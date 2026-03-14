import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "anthropic/claude-3.5-sonnet";

const MAX_TOKENS = 8000;
const MAX_PARTS = 3;

const SUPPORTED_LANGS = ["en", "pt"];
const LANGUAGE_MAP = {
  en: "English",
  pt: "Brazilian Portuguese (pt-BR)"
};

if (!OPENROUTER_API_KEY) {
  console.error("❌ Missing OPENROUTER_API_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const folderArg = args[0];
const langArg = args[1];

const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const ONLY_NEW = args.includes("--only-new");
const ONLY_CHANGED = args.includes("--only-changed");

if (!folderArg || !langArg) {
  console.log(`
Usage:
node translate-folder.mjs <source-folder> <lang>

Examples:
node translate-folder.mjs docs/es/unidex en
node translate-folder.mjs docs/es/unidex pt
node translate-folder.mjs docs/es/unidex all

Available languages:
${SUPPORTED_LANGS.join(", ")}
`);
  process.exit(1);
}

if (langArg !== "all" && !SUPPORTED_LANGS.includes(langArg)) {
  console.error(`❌ Unsupported language: ${langArg}`);
  process.exit(1);
}

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

function extractSourceHash(content) {
  const match = content.match(/source_hash:\s*"(.*?)"/);
  return match ? match[1] : null;
}

function looksTruncated(text) {
  const t = (text || "").trim();
  if (!t) return true;

  if (
    /\[(continued|content continues|translation continues)/i.test(t) ||
    /(continued in next part|remaining sections)/i.test(t)
  ) {
    return true;
  }

  return false;
}

function loadGlossary(lang) {
  const glossaryPath = path.join(__dirname, "glossaries", `${lang}.yml`);

  if (!fs.existsSync(glossaryPath)) return "";

  const raw = fs.readFileSync(glossaryPath, "utf8");
  const data = yaml.load(raw);

  let table = `\nTERMINOLOGY GLOSSARY (${lang.toUpperCase()})\n\nSPANISH | ${lang.toUpperCase()}\n--- | ---\n`;

  for (const [key, value] of Object.entries(data)) {
    table += `${key} | ${value}\n`;
  }

  return table;
}

async function translateContent(rules, glossary, content, targetLang) {

  const prompt = `
${rules}

${glossary}

Translate the following MDX file from Spanish to ${targetLang}.
Return ONLY the translated MDX.
`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: MODEL,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: content }
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

  let parts = 1;

  while (looksTruncated(out) && parts < MAX_PARTS) {

    parts++;

    const contResp = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: MODEL,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: `
Continue the translation from where it stopped.

Return ONLY the remaining MDX.

Previous output context:
${out.slice(-2000)}
`
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

    if (!more || more.length < 50) break;

    out = out.replace(/\[.*continued.*\]/i, "").trim();
    out += "\n\n" + more;
  }

  return out;
}

function injectTranslationMetadata(content, hash, targetLang) {

  const metadata = `
translation:
  source_lang: "es"
  target_lang: "${targetLang}"
  status: "draft"
  version: 0
  reviewed_by: ""
  reviewed_at: ""
  source_hash: "${hash}"
`;

  if (content.startsWith("---")) {
    const end = content.indexOf("\n---", 3);

    if (end !== -1) {
      const before = content.slice(0, end);
      const after = content.slice(end);

      return before + metadata + after;
    }
  }

  return `---\n${metadata}---\n\n${content}`;
}

async function processLanguage(sourceFolder, lang) {

  const targetFolder = sourceFolder.replace(
    path.sep + "es" + path.sep,
    path.sep + lang + path.sep
  );

  const rules = fs.readFileSync(
    path.join(__dirname, "translation_rules.txt"),
    "utf8"
  );

  const glossary = loadGlossary(lang);

  const files = getAllMdxFiles(sourceFolder);

  let translated = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`\n🌍 Language: ${lang}`);
  console.log(`📂 Files found: ${files.length}\n`);

  for (const file of files) {

    const relativePath = path.relative(sourceFolder, file);
    const targetPath = path.join(targetFolder, relativePath);

    const esContent = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const newHash = sha256(esContent);

    let shouldTranslate = true;

    if (fs.existsSync(targetPath)) {

      const enContent = fs.readFileSync(targetPath, "utf8");
      const oldHash = extractSourceHash(enContent);

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
      translated++;
      continue;
    }

    try {

      const translatedContent = await translateContent(
        rules,
        glossary,
        esContent,
        lang
      );

      const finalContent = injectTranslationMetadata(
        translatedContent,
        newHash,
        lang
      );

      ensureDirSync(path.dirname(targetPath));

      fs.writeFileSync(targetPath, finalContent, "utf8");

      translated++;

      console.log("   ✅ Done\n");

    } catch (err) {

      errors++;

      console.log("   ❌ Error:", err.message, "\n");
    }
  }

  return { translated, skipped, errors, total: files.length };
}

async function main() {

  const startTime = Date.now();
  const sourceFolder = path.resolve(folderArg);

  if (!fs.existsSync(sourceFolder)) {
    console.error("❌ Source folder not found");
    process.exit(1);
  }

  let langs = [];

  if (langArg === "all") {
    langs = SUPPORTED_LANGS;
  } else {
    langs = [langArg];
  }

  const results = {};

  for (const lang of langs) {

    const r = await processLanguage(sourceFolder, lang);

    results[lang] = r;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const report = {
    model: MODEL,
    duration_sec: duration,
    results
  };

  ensureDirSync(path.join(__dirname, "reports"));

  fs.writeFileSync(
    path.join(__dirname, "reports", `report-${Date.now()}.json`),
    JSON.stringify(report, null, 2)
  );

  console.log("\n🎉 Translation complete.");
}

main();