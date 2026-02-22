import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "anthropic/claude-3.5-sonnet";
const MAX_TOKENS = 8000;        // output budget per call
const MAX_PARTS = 3;            // 1 initial + up to 2 continuations
const CONTEXT_CHARS = 1200;     // tail context to avoid repeats

if (!OPENROUTER_API_KEY) {
  console.error("❌ Missing OPENROUTER_API_KEY");
  process.exit(1);
}

// ==========================
// ARGUMENTS
// ==========================

const args = process.argv.slice(2);
const folderArg = args.find((a) => !a.startsWith("--"));

const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const ONLY_NEW = args.includes("--only-new");
const ONLY_CHANGED = args.includes("--only-changed");

if (!folderArg) {
  console.log("Usage:");
  console.log(
    "node translate-folder.mjs DOCS/es/unidex [--dry-run] [--force] [--only-new] [--only-changed]"
  );
  process.exit(1);
}

if ([FORCE, ONLY_NEW, ONLY_CHANGED].filter(Boolean).length > 1) {
  console.error("❌ Use only one of --force | --only-new | --only-changed");
  process.exit(1);
}

// ==========================
// UTILS
// ==========================

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function getAllMdxFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      results = results.concat(getAllMdxFiles(filePath));
    } else if (file.endsWith(".mdx")) {
      results.push(filePath);
    }
  }

  return results;
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function extractSourceHash(enContent) {
  const match = enContent.match(/source_hash:\s*"(.*?)"/);
  return match ? match[1] : null;
}

/**
 * Detects explicit truncation markers (high precision, low false positives).
 */
function looksTruncated(text) {
  const t = (text || "").trim();
  if (!t) return true;

  // Known truncation marker observed
  if (t.includes("[Continued in next part")) return true;

  // Generic bracketed placeholders that must never appear in final MDX
  // We anchor to bracketed lines to avoid false positives in normal prose.
  const placeholderLineRegexes = [
    /^\[\s*content continues\b.*\]$/im,
    /^\[\s*translation continues\b.*\]$/im,
    /^\[\s*continued\b.*\]$/im,
    /^\[\s*to be continued\b.*\]$/im,
    /^\[\s*remaining sections\b.*\]$/im,
    /^\[\s*content continues\b.*following\b.*rules\b.*\]$/im,
    /^\[\s*content continues\b.*careful\b.*translation\b.*\]$/im,
    /^\[\s*content continues\b.*same\b.*careful\b.*translation\b.*\]$/im,
    /^\[\s*content continues\b.*following\b.*all\b.*rules\b.*\]$/im,
  ];

  if (placeholderLineRegexes.some((re) => re.test(t))) return true;

  return false;
}

/**
 * Heuristic to catch "silent" cutoff cases (no marker).
 * Conservative: triggers only on likely-abrupt endings.
 */
function endsAbruptly(text) {
  const t = (text || "").trimEnd();
  if (!t) return true;

  const lastLine = t.split("\n").pop() ?? "";

  // If last line ends with an escape, comma, colon, open bracket/paren/brace, or arrow bullet starter
  if (/[\\,:;\-–—]$/.test(lastLine.trim())) return true;
  if (/[({[\u003c]$/.test(lastLine.trim())) return true; // includes "<" (start of a tag) as a weak signal

  // Very common in truncated Markdown: unfinished emphasis/code fence or dangling backtick
  if ((lastLine.match(/`/g) || []).length % 2 === 1) return true;

  // If it ends with an unclosed MDX tag start on the last line (e.g., "<Info")
  if (/<[A-Za-z][A-Za-z0-9-]*\s*$/.test(lastLine)) return true;

  return false;
}

function stripTruncationMarkers(text) {
  let t = (text || "");

  // Remove known marker
  t = t.replace(/\n?\[Continued in next part due to length\.\.\.\]\s*$/i, "");
  t = t.replace(/\n?\[Continued in next part.*?\]\s*$/i, "");

  // Remove common bracketed placeholder lines (end-of-output)
  t = t.replace(/\n?\[\s*content continues[^\]]*\]\s*$/i, "");
  t = t.replace(/\n?\[\s*translation continues[^\]]*\]\s*$/i, "");
  t = t.replace(/\n?\[\s*remaining sections[^\]]*\]\s*$/i, "");
  t = t.replace(/\n?\[\s*to be continued[^\]]*\]\s*$/i, "");
  t = t.replace(/\n?\[\s*continued[^\]]*\]\s*$/i, "");

  return t.trim();
}

// ==========================
// API CALLS
// ==========================

async function callOpenRouter({ rules, userContent }) {
  return axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: MODEL,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: rules },
        { role: "user", content: userContent },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // Optional but recommended by OpenRouter
        "HTTP-Referer": "https://solidyne-docs.local",
        "X-Title": "Solidyne MDX Translator",
      },
      timeout: 120000,
    }
  );
}

async function translateContentWithRetry(rules, esContent) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await callOpenRouter({
        rules,
        userContent:
          "Translate the following MDX file strictly following the rules.\n" +
          "Return ONLY the translated MDX. Do NOT use code fences.\n\n" +
          esContent,
      });

      let out = (res.data?.choices?.[0]?.message?.content || "").trim();
      return out;
    } catch (err) {
      if (attempt === 3) throw err;
      const status = err?.response?.status;
      console.log(`   ⚠ Translate attempt ${attempt} failed${status ? ` (HTTP ${status})` : ""}. Retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return "";
}

async function continueContentWithRetry(rules, tailContext) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await callOpenRouter({
        rules,
        userContent:
          "Continue EXACTLY from where you stopped.\n" +
          "Output ONLY the missing tail of the MDX.\n" +
          "Do NOT repeat any previous lines.\n" +
          "Do NOT add commentary.\n" +
          "Do NOT add markers like '[Continued...]'.\n" +
          "Start with the very next line that should appear after the last output.\n\n" +
          "Last output tail (for context):\n" +
          tailContext,
      });

      let more = (res.data?.choices?.[0]?.message?.content || "").trim();
      return more;
    } catch (err) {
      if (attempt === 3) throw err;
      const status = err?.response?.status;
      console.log(`   ⚠ Continue attempt ${attempt} failed${status ? ` (HTTP ${status})` : ""}. Retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return "";
}

/**
 * Robust translation that auto-continues if truncated.
 */
async function translateContent(rules, esContent) {
  let out = await translateContentWithRetry(rules, esContent);
  out = stripTruncationMarkers(out);

  let parts = 1;
  while ((looksTruncated(out) || endsAbruptly(out)) && parts < MAX_PARTS) {
    parts++;

    const tailContext = out.slice(Math.max(0, out.length - CONTEXT_CHARS));
    const more = await continueContentWithRetry(rules, tailContext);

    const cleanMore = stripTruncationMarkers(more);

    // Guardrails: if continuation is empty or clearly not progressing, stop
    if (!cleanMore || cleanMore.length < 40) {
      console.log("   ⚠ Continuation returned too little content; stopping continuation loop.");
      break;
    }

    // If model repeats tail context, avoid infinite growth
    if (out.endsWith(cleanMore)) {
      console.log("   ⚠ Continuation appears duplicated; stopping continuation loop.");
      break;
    }

    out = stripTruncationMarkers(out) + "\n\n" + cleanMore;
  }

  // Final cleanup
  out = stripTruncationMarkers(out);

  // Final safety: if still looks truncated, fail loudly (so it shows in report)
  if (looksTruncated(out)) {
    throw new Error("Model output appears truncated after continuations.");
  }
  if (looksTruncated(out)) {
  throw new Error("Model output appears truncated or contains placeholder markers.");
  }
  return out;
}

// ==========================
// FRONTMATTER
// ==========================

function injectTranslationMetadata(enContent, sourceHash) {
  const metadata = `
translation:
  source_lang: "es"
  status: "draft"
  version: 0
  reviewed_by: ""
  reviewed_at: ""
  source_hash: "${sourceHash}"
`;

  if (enContent.startsWith("---")) {
    const end = enContent.indexOf("\n---", 3);
    if (end !== -1) {
      const before = enContent.slice(0, end);
      const after = enContent.slice(end);
      return before + metadata + after;
    }
  }

  return `---\n${metadata}---\n\n${enContent}`;
}

// ==========================
// MAIN
// ==========================

async function main() {
  const startTime = Date.now();

  const sourceFolder = path.resolve(folderArg);
  const targetFolder = sourceFolder.replace(
    path.sep + "es" + path.sep,
    path.sep + "en" + path.sep
  );

  if (!fs.existsSync(sourceFolder)) {
    console.error("❌ Source folder not found");
    process.exit(1);
  }

  const rules = fs.readFileSync(
    path.join(__dirname, "solidyne_mdx_rules.txt"),
    "utf8"
  );

  const files = getAllMdxFiles(sourceFolder);

  let translated = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`📂 Found ${files.length} files\n`);

  for (const file of files) {
    const relativePath = path.relative(sourceFolder, file);
    const targetPath = path.join(targetFolder, relativePath);

    const esContent = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const newHash = sha256(esContent);

    let shouldTranslate = true;

    if (fs.existsSync(targetPath)) {
      const enContent = fs.readFileSync(targetPath, "utf8");
      const oldHash = extractSourceHash(enContent);

      if (ONLY_NEW) shouldTranslate = false;

      if (ONLY_CHANGED && oldHash === newHash) {
        shouldTranslate = false;
      }

      // Default mode: translate if missing hash or hash changed; skip if same
      if (!FORCE && oldHash === newHash) {
        shouldTranslate = false;
      }

      if (FORCE) shouldTranslate = true;
    }

    if (!shouldTranslate) {
      console.log("↷ Skipped:", relativePath);
      skipped++;
      continue;
    }

    console.log("→ Translating:", relativePath);

    if (DRY_RUN) {
      console.log("   (dry-run)");
      translated++;
      continue;
    }

    try {
      const translatedContent = await translateContent(rules, esContent);
      const finalContent = injectTranslationMetadata(translatedContent, newHash);

      ensureDirSync(path.dirname(targetPath));
      fs.writeFileSync(targetPath, finalContent, "utf8");

      translated++;
      console.log("   ✅ Done\n");
    } catch (err) {
      errors++;
      console.log("   ❌ Error:", err.message, "\n");
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const report = {
    total: files.length,
    translated,
    skipped,
    errors,
    duration_sec: duration,
    model: MODEL,
    limits: {
      max_tokens: MAX_TOKENS,
      max_parts: MAX_PARTS,
      context_chars: CONTEXT_CHARS,
    },
    mode: {
      force: FORCE,
      only_new: ONLY_NEW,
      only_changed: ONLY_CHANGED,
      dry_run: DRY_RUN,
    },
  };

  ensureDirSync(path.join(__dirname, "reports"));

  fs.writeFileSync(
    path.join(__dirname, "reports", `report-${Date.now()}.json`),
    JSON.stringify(report, null, 2)
  );

  console.log("\n🎉 Done.");
  console.log(report);
}

main();