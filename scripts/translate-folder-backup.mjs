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
const MODEL = "deepseek/deepseek-v3.2";

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

function sourceContentHash(content) {
  // The legacy `source_hash` values were calculated after normalizing line endings.
  return sha256(content.replace(/\r\n?/g, "\n"));
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
  const match = content.match(/^\s*source_hash:\s*["']?([a-fA-F0-9]{64})["']?\s*$/m);
  return match ? match[1].toLowerCase() : null;
}

function getLegacyMigration(sourceContent, targetFilePath, metaPath) {
  if (FORCE) {
    return null;
  }

  const currentSourceHash = sourceContentHash(sourceContent);

  if (fs.existsSync(metaPath)) {
    const metadata = loadSectionMetadata(metaPath);
    const isMigratedFile =
      Array.isArray(metadata.sections) &&
      metadata.sections.length === 0 &&
      metadata.source_hash === currentSourceHash;

    return isMigratedFile
      ? { sourceHash: currentSourceHash, needsWrite: false }
      : null;
  }

  if (!fs.existsSync(targetFilePath)) {
    return null;
  }

  const targetContent = fs.readFileSync(targetFilePath, "utf8");
  const targetSourceHash = extractSourceHash(targetContent);

  if (!targetSourceHash || targetSourceHash !== currentSourceHash) {
    return null;
  }

  return { sourceHash: currentSourceHash, needsWrite: true };
}

function getMdxBody(content) {
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  if (!normalizedContent.startsWith("---")) return normalizedContent;

  const end = normalizedContent.indexOf("\n---", 3);
  return end === -1
    ? normalizedContent
    : normalizedContent.substring(end + 4).trimStart();
}

function isAccordionBlock(content) {
  return /^<Accordion(\s|>|$)/.test(content.trim());
}

function getDryRunSectionStats(esContent, metaPath) {
  const sections = parseMdxSections(getMdxBody(esContent));
  const prevMeta = loadSectionMetadata(metaPath);
  const prevSections = new Set((prevMeta.sections || []).map(section => section.hash));

  let translatedSections = 0;
  let reusedSections = 0;

  for (const section of sections) {
    if (section.content.trim().startsWith("import ")) continue;

    const sectionHash = sha256(section.content);
    if (!FORCE && !isAccordionBlock(section.content) && prevSections.has(sectionHash)) {
      reusedSections++;
    } else {
      translatedSections++;
    }
  }

  return {
    totalSections: sections.length,
    translatedSections,
    reusedSections,
    failedSections: 0
  };
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
  const targetLanguage = data.language || LANGUAGE_MAP[lang] || lang;
  const context = Object.entries(data.context || {})
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const rules = (data.rules || [])
    .map(rule => `- ${rule}`)
    .join("\n");
  const noTranslate = (data.no_translate || [])
    .map(term => `- \`${term}\``)
    .join("\n");
  const preferred = Object.entries(data.preferred || {})
    .map(([source, target]) => `- \`${source}\` → \`${target}\``)
    .join("\n");
  const notes = (data.notes || [])
    .map(note => `- ${note}`)
    .join("\n");

  return `
TERMINOLOGY GLOSSARY (${targetLanguage})

This glossary is mandatory. Apply preferred translations exactly whenever they match the Spanish source. Preserve every term in “Do not translate” exactly as written. When entries overlap, prefer the most specific source phrase.

Context:
${context || "- Professional broadcast documentation"}

Translation rules:
${rules || "- Use professional broadcast terminology."}

Do not translate:
${noTranslate || "- None"}

Preferred translations (Spanish → ${targetLanguage}):
${preferred || "- None"}

Additional notes:
${notes || "- None"}
`.trim();
}

async function translateContent(rules, glossary, content, targetLang) {

  const targetLanguage = LANGUAGE_MAP[targetLang] || targetLang;

  const prompt = `
${rules}

${glossary}

Translate the following MDX file from Spanish to ${targetLanguage}.
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
  let totalSections = 0;
  let translatedSections = 0;
  let reusedSections = 0;
  let failedSections = 0;
  let migratedFiles = 0;

  console.log(`\n🌍 Language: ${lang}`);
  console.log(`📂 Files found: ${files.length}\n`);

            // Mejor función: obtiene human_revision del frontmatter destino
    function getDestRevision(mdFile) {
      if (!fs.existsSync(mdFile)) return 0;
      const content = fs.readFileSync(mdFile, "utf8");
      const match = content.match(/^---\s*([\s\S]*?)\s*---/m);
      if (!match) return 0;
      try {
        const obj = yaml.load(match[1]) || {};
        if (obj.translation && typeof obj.translation === 'object') {
          return Number(obj.translation.human_revision || 0);
        }
        return Number(obj.human_revision || 0);
      } catch (err) {
        return 0;
      }
    }

    let skippedReviewed = 0;
    let forcedUpdates = 0;
    for (const file of files) {
      const relativePath = path.relative(sourceFolder, file);
      const targetPath = path.join(targetFolder, relativePath);
      const metaPath = targetPath + ".transdata.json";

      console.log("→ Processing:", relativePath);

            if (fs.existsSync(targetPath)) {
        const destRev = getDestRevision(targetPath);
        if (destRev > 0 && !FORCE_REVIEWED) {
          console.warn(`⚠️ Archivo ${relativePath} revisado manualmente (human_revision=${destRev}). Usa --force-reviewed para forzar actualización.`);
          skippedReviewed++;
          skipped++;
          continue;
        }
        if (destRev > 0 && FORCE_REVIEWED) {
          forcedUpdates++;
        }
      }


      if (DRY_RUN) {
        const sourceContent = fs.readFileSync(file, "utf8");
        const legacyMigration = getLegacyMigration(sourceContent, targetPath, metaPath);

        if (legacyMigration) {
          const message = legacyMigration.needsWrite
            ? "Archivo sin cambios; se migraría al caché seccional."
            : "Archivo sin cambios; ya está migrado y se omitirá.";
          console.log(`   ↪️ ${message}`);
          if (legacyMigration.needsWrite) {
            migratedFiles++;
          } else {
            skipped++;
          }
        } else {
          const sectionStats = getDryRunSectionStats(sourceContent, metaPath);
          totalSections += sectionStats.totalSections;
          translatedSections += sectionStats.translatedSections;
          reusedSections += sectionStats.reusedSections;
          translated++;
          console.log(`   ↪️ Secciones previstas — Traducidas: ${sectionStats.translatedSections}, Reusadas: ${sectionStats.reusedSections}, Falladas: 0`);
        }
        continue;
      }

      try {
        const fileResult = await processFileGranular(file, targetPath, metaPath, lang, rules, glossary);
        if (fileResult.migrated) {
          migratedFiles++;
          skipped++;
        } else if (fileResult.skipped) {
          skipped++;
        } else {
          translated++;
          totalSections += fileResult.totalSections;
          translatedSections += fileResult.translatedSections;
          reusedSections += fileResult.reusedSections;
          failedSections += fileResult.failedSections;
        }
        const status = fileResult.migrated || fileResult.skipped ? "Omitido" : "Done";
        console.log(`   ✅ ${status}:`, relativePath, "\n");
      } catch (err) {
        errors++;
        console.log("   ❌ Error:", err.message, "\n");
      }
    }
    return {
      translated,
      skipped,
      errors,
      total: files.length,
      skippedReviewed,
      forcedUpdates,
      totalSections,
      translatedSections,
      reusedSections,
      failedSections,
      migratedFiles
    };
}
async function processFileGranular(esFilePath, targetFilePath, metaPath, targetLang, rules, glossary) {
  const esContent = fs.readFileSync(esFilePath, "utf8");

  const legacyMigration = getLegacyMigration(esContent, targetFilePath, metaPath);
  if (legacyMigration) {
    if (legacyMigration.needsWrite) {
      console.log("   ↪️ Archivo sin cambios; migrando al caché seccional.");
      fs.writeFileSync(metaPath, JSON.stringify({
        version: 1,
        human_revision: 0,
        source_hash: legacyMigration.sourceHash,
        sections: []
      }, null, 2), "utf8");
      return { migrated: true };
    }

    console.log("   ↪️ Archivo sin cambios; ya está migrado y se omite.");
    return { skipped: true };
  }

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
  reviewed_by: "the holy spirit"
  reviewed_at: "AAAAMMDD"
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

        function normalizeString(str) {
      if (!str) return "";
      return String(str).trim().replace(/^"+|"+$/g, '').replace(/[`']/g,'').replace(/\s+/g,' ').toLowerCase();
    }
    async function safeTranslateField(value, rules, glossary, targetLang, fieldName = "") {
      if (!value || typeof value !== "string" || value.trim().length === 0) {
        return undefined;
      }
      let translated = value;
      for (let attempts = 0; attempts < 3; attempts++) {
        try {
          // Contexto especial para título/desc
          let isShort = (fieldName === "title" || fieldName === "description");
          let customPrompt = isShort
            ? `${rules}\nTranslate only this field (\"${fieldName}\") from Spanish to ${targetLang}.\nField content:\n\"${value}\"\nReturn ONLY the translated text, no extra formatting.`
            : rules;

          const result = await translateContent(customPrompt, glossary, value, targetLang);
          console.log(`Frontmatter [${fieldName}] | orig: '${value}' | LLM: '${result}'`);
          if (
            result &&
            normalizeString(result) &&
            normalizeString(result) !== normalizeString(value)
          ) {
            translated = result.trim().replace(/^"+|"+$/g, '');
            break;
          }
        } catch (error) {
          console.warn(`⚠️ Fallo en traducción de campo [${fieldName}] (intento ${attempts + 1})`);
        }
      }
      // Si nunca cambió, o es vacío, devuelve undefined para que no reemplace
      if (!translated.trim() || normalizeString(translated) === normalizeString(value)) {
        console.warn(`⚠️ Campo frontmatter [${fieldName}] no traducido o igual al original (posible fallo en LLM), dejando original.`);
        return undefined;
      }
      return translated;
    }

    let translatedTitle = esFrontmatter && esFrontmatter.title
    ? await safeTranslateField(esFrontmatter.title, rules, glossary, targetLang, "title")
    : undefined;
  let translatedDesc = esFrontmatter && esFrontmatter.description
    ? await safeTranslateField(esFrontmatter.description, rules, glossary, targetLang, "description")
    : undefined;
  let translatedKeywords = esFrontmatter && esFrontmatter.keywords
    ? await translateList(esFrontmatter.keywords)
    : undefined;
  let translatedTags = esFrontmatter && esFrontmatter.tags
  ? Array.isArray(esFrontmatter.tags)
    ? esFrontmatter.tags.map(e => typeof e === "string" ? e.trim() : e).filter(Boolean)
    : esFrontmatter.tags
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
  let translatedSections = 0;
  let reusedSections = 0;
  let failedSections = 0;

    async function translateAccordionBlock(block, rules, glossary, targetLang) {
      // Traduce el atributo title (puede tener comillas simples o dobles, o sin nada)
      let translated = await replaceAsync(
        block,
        /<Accordion([^>]*)title\s*=\s*["']?([^"'>]+)["']?([^>]*)>([\s\S]*?)<\/Accordion>/gi,
        async (_, preAttrs, title, postAttrs, innerContent) => {
          // Traduce el título del acordeón
          const translatedTitle = await safeTranslateField(title, rules, glossary, targetLang, "title");
          // Traduce el contenido interno (tablas + markdown)
          const translatedContent = await safeTranslateField(innerContent, rules, glossary, targetLang, "mdx");
          return `<Accordion${preAttrs}title=\"${translatedTitle}\"${postAttrs}>\n${translatedContent}\n</Accordion>`;
        }
      );
      return translated;
    }

    async function replaceAsync(str, regex, asyncFn) {
      const promises = [];
      str.replace(regex, (...args) => {
        promises.push(asyncFn(...args));
        return '';
      });
      const data = await Promise.all(promises);
      let i = 0;
      return str.replace(regex, () => data[i++]);
    }

    for (const section of sections) {
      const sectionHash = sha256(section.content);
      console.log("    → Sección:", section.title ? `[${section.title}]` : "[sin título]");

      // No traducir imports
      if (section.content.trim().startsWith('import ')) {
        console.log("      ↪️ Sección preservada literal (import)");
        newContentArr.push(section.content);
        newSectionMeta.push({
          hash: sectionHash,
          translation: section.content,
          title: section.title,
          level: section.level
        });
        continue;
      }

      // Nuevo: traducir Accordions multilínea
      if (isAccordionBlock(section.content)) {
        console.log("      ↪️ Traduciendo bloque Accordion (multilínea)");
        const translatedAccordion = await translateAccordionBlock(section.content, rules, glossary, targetLang);
        translatedSections++;
        newContentArr.push(translatedAccordion);
        newSectionMeta.push({
          hash: sectionHash,
          translation: translatedAccordion,
          title: section.title,
          level: section.level
        });
        continue;
      }

      // Verificar si la sección fue modificada
      if (!FORCE && prevSections[sectionHash]) {
        console.log("      ↪️ Sección sin cambios, reusando traducción existente");
        reusedSections++;
        newContentArr.push(prevSections[sectionHash].translation);
        newSectionMeta.push({
          hash: sectionHash,
          translation: prevSections[sectionHash].translation,
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
        failedSections++;
        console.warn("      ⚠️ Usando texto original por falla persistente de traducción.");
      } else {
        translatedSections++;
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
  console.log(`  Resumen de secciones — Traducidas: ${translatedSections}, Reusadas: ${reusedSections}, Falladas: ${failedSections}`);

  // Escribir el archivo traducido y el json de metadatos
  fs.writeFileSync(targetFilePath, finalMdx, "utf8");
  fs.writeFileSync(metaPath, JSON.stringify({
    human_revision: 0,
    sections: newSectionMeta
  }, null, 2), "utf8");

  return {
    totalSections: sections.length,
    translatedSections,
    reusedSections,
    failedSections
  };
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

  let totalSkippedReviewed = 0;
  let totalForcedUpdates = 0;
  let totalMigratedFiles = 0;
  let totalSections = 0;
  let totalTranslatedSections = 0;
  let totalReusedSections = 0;
  let totalFailedSections = 0;
  for (const lang of langs) {
    const r = await processLanguage(sourceFolder, lang);
    results[lang] = r;
    totalSkippedReviewed += r.skippedReviewed || 0;
    totalForcedUpdates += r.forcedUpdates || 0;
    totalMigratedFiles += r.migratedFiles || 0;
    totalSections += r.totalSections || 0;
    totalTranslatedSections += r.translatedSections || 0;
    totalReusedSections += r.reusedSections || 0;
    totalFailedSections += r.failedSections || 0;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const date = new Date().toISOString().slice(0, 10);
  const folderName = path.basename(sourceFolder);
  const reportFile = `translate-report_${folderName}_${langArg}_${date}.json`;

  ensureDirSync(path.join(__dirname, "reports"));

  fs.writeFileSync(
    path.join(__dirname, "reports", reportFile),
    JSON.stringify({
      model: MODEL,
      duration_sec: duration,
      results,
      skipped_reviewed: totalSkippedReviewed,
      forced_updates: totalForcedUpdates,
      migrated_files: totalMigratedFiles
    }, null, 2)
  );

  console.log("\n🎉 Translation complete.");
  console.log(`📊 Stats:`);
  console.log(`- Skipped reviewed files: ${totalSkippedReviewed}`);
  console.log(`- Forced updates: ${totalForcedUpdates}`);
  console.log(`- Migrated legacy files: ${totalMigratedFiles}`);
  console.log(`- Total sections: ${totalSections}`);
  console.log(`- Translated sections: ${totalTranslatedSections}`);
  console.log(`- Reused sections: ${totalReusedSections}`);
  console.log(`- Failed sections: ${totalFailedSections}`);
}

main();
