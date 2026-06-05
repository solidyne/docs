import { parseMdxSections } from "./mdx-section-parser.mjs";
import { postProcessMdx, validateMdx } from "./mdx-postprocess.mjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import yaml from "js-yaml";
import { fileURLToPath } from "url";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
//const MODEL = "anthropic/claude-sonnet-4-6";
const MODEL = "deepseek/deepseek-chat";

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
const FORCE_REVIEWED = args.includes("--force-reviewed");

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

function loadSectionMetadata(metaPath) {
  if (!fs.existsSync(metaPath)) {
    return { version: 0, sections: [] };
  }
  const raw = fs.readFileSync(metaPath, "utf8");
  return JSON.parse(raw);
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

        // Utilidad para obtener versión del frontmatter del destino
    function getDestVersion(mdFile) {
      if (!fs.existsSync(mdFile)) return 0;
      const content = fs.readFileSync(mdFile, "utf8");
      const match = content.match(/^---\s*([\s\S]*?)\s*---/m);
      if (!match) return 0;
      try {
        const obj = yaml.load(match[1]) || {};
        return Number(obj.version) || 0;
      } catch (err) {
        return 0;
      }
    }

    for (const file of files) {
      const relativePath = path.relative(sourceFolder, file);
      const targetPath = path.join(targetFolder, relativePath);
      const metaPath = targetPath + ".transdata.json";

      console.log("→ Processing:", relativePath);

      if (fs.existsSync(targetPath)) {
        const destVer = getDestVersion(targetPath);
        if (destVer > 0 && !FORCE_REVIEWED) {
          console.warn(`⚠️ Archivo ${relativePath} tiene version manual (${destVer}) y NO será sobrescrito. Usa --force-reviewed para forzar.`);
          skipped++;
          continue;
        }
      }

      if (DRY_RUN) {
        translated++;
        continue;
      }

      try {
        await processFileGranular(file, targetPath, metaPath, lang, rules, glossary);
        translated++;
        console.log("   ✅ Done:", relativePath, "\n");
      } catch (err) {
        errors++;
        console.log("   ❌ Error:", err.message, "\n");
      }
    }
    return { translated, skipped, errors, total: files.length };
}
async function processFileGranular(esFilePath, targetFilePath, metaPath, targetLang, rules, glossary) {
  const esContent = fs.readFileSync(esFilePath, "utf8");

  // ====== NUEVO: Extraer y traducir frontmatter Y PRESERVAR FORMATO YAML =====
  function extractFrontmatterWithString(content) {
    content = content.replace(/\r\n?/g, '\n');
    if (!content.startsWith('---')) return { frontmatterStr: null, frontmatter: null, body: content };
    const end = content.indexOf('\n---', 3);
    if (end === -1) return { frontmatterStr: null, frontmatter: null, body: content };
    const frontmatterBlock = content.substring(3, end).trim();
    const body = content.substring(end + 4).trimStart();
    let fm = {};
    try {
      fm = yaml.load(frontmatterBlock) || {};
    } catch (err) {
      console.warn("⚠️ Error parsing frontmatter YAML:", err.message);
    }
    return { frontmatterStr: frontmatterBlock, frontmatter: fm, body };
  }

  // Traducción de arrays y campos simples
   async function translateList(arr) {
    if (!Array.isArray(arr)) return arr;
    // Filtrar solo strings no vacías y limpias
    let cleanArr = arr.filter(e => typeof e === "string" && e.trim().length > 0);
    if (!cleanArr.length) return [];
    let joined = cleanArr.join(", ");
    let translated = (await translateContent(rules, glossary, joined, targetLang)).trim();
    // Si el LLM devolvió un markdown block/código, fallback al input original limpio
    if (/no visible text|no hay contenido visible|```|```mdx/i.test(translated)) {
      return cleanArr; // Fallback sensato
    }
    // Devuelve array, limpia comillas/code y evita entradas vacías/rotas
    return translated
      .split(/\s*,\s*/)
      .map(e =>
        e
          .replace(/^[\"'`]+|[\"'`]+$/g, "") // remueve comillas/backtick extremos
          .replace(/\n+/g, " ") // quita saltos de línea raros
          .trim()
      )
      .filter(Boolean);
  }

  function asYamlInlineArray(arr) {
    if (!Array.isArray(arr)) return "[]";
    // Solo mantiene entradas no vacías y normales
    let arrClean = arr.filter(Boolean).map(x =>
      `"${String(x).replace(/\\\"/g, '\\"').replace(/\n/g, ' ').replace(/[`'\\]+/g, '')}"`
    );
    return `[${arrClean.join(", ")}]`;
  }

  function buildTranslationBlock(targetLang) {
  return `
translation:
  source_lang: "es"
  target_lang: "${targetLang}"
  human_revision: 0
  reviewed_by: null
  reviewed_at: null
`.trim();
  }

  function updateFrontmatterString(fmStr, newVals, translationBlock) {
    let result = fmStr;
    for (const key of Object.keys(newVals)) {
      let repValue = '';
      if (Array.isArray(newVals[key])) {
        if (!newVals[key].length) continue;
        repValue = asYamlInlineArray(newVals[key]);
      } else if (typeof newVals[key] === 'string' && newVals[key].length > 0) {
        let cleanVal = newVals[key].replace(/```[\s\S]*?```/g, "").replace(/\n/g, ' ').replace(/["`]+/g, '').trim();
        if (!cleanVal) continue;
        repValue = `"${cleanVal}"`;
      } else {
        continue; // Si campo vacío o no string, lo ignora
      }
      const regex = new RegExp(`^(${key}:\\s*).*$`, 'm');
      if (result.match(regex)) {
        result = result.replace(regex, `$1${repValue}`);
      } else {
        result = `${key}: ${repValue}\n${result}`;
      }
    }
    // Elimina bloques previos 'translation:' y sus hijos
    result = result.replace(/translation:[\s\S]*?(?=^[a-zA-Z\-_]+:|\n*---|$)/m, "");
    // Añade translation al final
    result = `${result.trim()}\n${translationBlock}`;
    return result.trim();
  }

  const { frontmatterStr, frontmatter: esFrontmatter, body: esBody } = extractFrontmatterWithString(esContent);

  let translatedTitle = esFrontmatter && esFrontmatter.title
    ? (await translateContent(rules, glossary, esFrontmatter.title, targetLang)).trim().replace(/^"+|"+$/g, '')
    : undefined;
  let translatedDesc = esFrontmatter && esFrontmatter.description
    ? (await translateContent(rules, glossary, esFrontmatter.description, targetLang)).trim().replace(/^"+|"+$/g, '')
    : undefined;
  let translatedKeywords = esFrontmatter && esFrontmatter.keywords
    ? await translateList(esFrontmatter.keywords)
    : undefined;
  let translatedTags = esFrontmatter && esFrontmatter.tags
    ? await translateList(esFrontmatter.tags)
    : undefined;

  let outFrontmatterBlock = frontmatterStr;
  if (frontmatterStr) {
    outFrontmatterBlock = updateFrontmatterString(frontmatterStr, {
      title: translatedTitle,
      description: translatedDesc,
      keywords: translatedKeywords,
      tags: translatedTags
    }, buildTranslationBlock(targetLang));
  }

  // ====== PROCESO NORMAL: Secciones del body (igual que antes) =====
  const sections = parseMdxSections(esBody);
  console.log("  Secciones detectadas:", sections.length);
  const prevMeta = loadSectionMetadata(metaPath);
  const prevSections = {};
  (prevMeta.sections || []).forEach(s => {
    prevSections[s.hash] = s;
  });
  let newSectionMeta = [];
  let newContentArr = [];

    for (const section of sections) {
    const sectionHash = sha256(section.content);
    console.log("    → Sección:", section.title || "sin título");

    // No traducir imports o JSX, solo preservar literal
    if (
      section.content.trim().startsWith('import ') ||
      section.content.trim().startsWith('<')
    ) {
      console.log("      ↪️ Sección preservada literal (import/JSX)");
      newContentArr.push(section.content);
      newSectionMeta.push({
        hash: sectionHash,
        translation: section.content,
        title: section.title,
        level: section.level
      });
      continue;
    }

    // Robustez: reintentos y filtrado
    let translation = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    while (attempts < MAX_ATTEMPTS) {
      try {
        translation = await translateContent(rules, glossary, section.content, targetLang);
        if (
          !translation || translation.trim() === "" ||
          /```mdx|no visible text|no hay contenido visible|```/i.test(translation) ||
          looksTruncated(translation)
        ) {
          attempts++;
          console.warn("      🔄 Reintento de traducción por texto inválido o truncado...");
          continue;
        }
        break; // traducción válida
      } catch {
        attempts++;
      }
    }
    if (!translation || translation === section.content) {
      translation = section.content;
      console.warn("      ⚠️ Usando texto original por falla persistente de traducción.");
    }
    newContentArr.push(translation);
    newSectionMeta.push({
      hash: sectionHash,
      translation,
      title: section.title,
      level: section.level
    });
  }


  // ====== ARMADO FINAL DEL ARCHIVO MDX TRADUCIDO CON FRONTMATTER =====
  const finalMdx = [
    (outFrontmatterBlock ? `---\n${outFrontmatterBlock.trim()}\n---` : null),
    newContentArr.join("\n\n")
  ].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");

  console.log("  Total secciones procesadas:", newSectionMeta.length);

  // Escribir el archivo traducido y el json de metadatos
  fs.writeFileSync(targetFilePath, finalMdx, "utf8");
  fs.writeFileSync(metaPath, JSON.stringify({
    human_revision: 0,
    sections: newSectionMeta
  }, null, 2), "utf8");
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
  const date = new Date().toISOString().slice(0, 10);
  const folderName = path.basename(sourceFolder);
  const reportFile = `translate-report_${folderName}_${langArg}_${date}.json`;

  ensureDirSync(path.join(__dirname, "reports"));

  fs.writeFileSync(
    path.join(__dirname, "reports", reportFile),
    JSON.stringify({ model: MODEL, duration_sec: duration, results }, null, 2)
  );


  console.log("\n🎉 Translation complete.");
}

main();