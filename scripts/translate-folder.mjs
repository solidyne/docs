import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "anthropic/claude-3.5-sonnet";

if (!OPENROUTER_API_KEY) {
  console.error("❌ Missing OPENROUTER_API_KEY");
  process.exit(1);
}

// ==========================
// ARGUMENTS
// ==========================

const args = process.argv.slice(2);
const folderArg = args.find(a => !a.startsWith("--"));

const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const ONLY_NEW = args.includes("--only-new");
const ONLY_CHANGED = args.includes("--only-changed");

if (!folderArg) {
  console.log("Usage:");
  console.log("node translate-folder.mjs DOCS/es/unidex [--dry-run] [--force] [--only-new] [--only-changed]");
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

function looksTruncated(text) {
  const t = (text || "").trim();
  if (!t) return true;
  if (t.includes("[Continued in next part")) return true;
  // otros marcadores típicos
  if (/continued/i.test(t) && /next part|part\s+\d+/i.test(t)) return true;
  return false;
}

// ==========================
// API CALL WITH RETRY
// ==========================

async function translateContent(rules, content) {
  // 1) primera parte
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: MODEL,
      temperature: 0,
      max_tokens: 8000, // <-- AGREGAR
      messages: [
        { role: "system", content: rules },
        {
          role: "user",
          content: "Translate the following MDX file strictly following the rules:\n\n" + content
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  let out = response.data.choices[0].message.content.trim();

  // 2) si parece truncado, pedir continuaciones
  let parts = 1;
  while (looksTruncated(out) && parts < 3) { // máx 3 partes
    parts++;

    const contResp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: MODEL,
        temperature: 0,
        max_tokens: 8000,
        messages: [
          { role: "system", content: rules },
          {
            role: "user",
            content:
              "Continue the translation from exactly where you left off.\n" +
              "Return ONLY the remaining MDX content.\n" +
              "Do NOT repeat anything already provided.\n" +
              "Do NOT add commentary.\n\n" +
              "Last output (for context):\n" +
              out.slice(Math.max(0, out.length - 2000))
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const more = contResp.data.choices[0].message.content.trim();

    // si el modelo repite el marcador sin dar contenido, cortamos
    if (!more || more === out || looksTruncated(more) && more.length < 200) {
      break;
    }

    // limpiar el marcador espurio si vino en la parte anterior
    out = out.replace(/\n?\[Continued in next part due to length\.\.\.\]\s*$/i, "").trim();

    // concatenar con una línea en blanco por seguridad
    out = out + "\n\n" + more;
  }

  // limpieza final por si quedó el marcador
  out = out.replace(/\n?\[Continued in next part due to length\.\.\.\]\s*$/i, "").trim();

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

      if (!FORCE && !ONLY_NEW && !ONLY_CHANGED) {
        shouldTranslate = true;
      }

      if (!FORCE && oldHash === newHash) {
        shouldTranslate = false;
      }
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
    mode: {
      force: FORCE,
      only_new: ONLY_NEW,
      only_changed: ONLY_CHANGED,
      dry_run: DRY_RUN
    }
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