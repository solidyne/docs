import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { safeCleanHeadingId, slugify } from "@mintlify/common";
import { Graph } from "@mintlify/link-rot/dist/graph.js";
import { decorateGraphNodeFromPageContent } from "@mintlify/link-rot/dist/static-checking/getBrokenInternalLinks.js";
import { getRedirects } from "@mintlify/link-rot/dist/static-checking/getRedirects.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

const ACTIVE_CONTENT_DIRS = new Set(["es", "en", "pt", "snippets"]);
const EXCLUDED_DIRS = new Set(["node_modules", "bkp_temp", "scripts", ".git"]);
const EXCLUDED_ROOT_FILES = new Set(["index_BKP.mdx"]);
const PAGE_EXTENSIONS = new Set([".mdx"]);
const LANGUAGES = new Set(["es", "en", "pt"]);

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function parseArgs(argv) {
  const options = {
    scopes: new Set(["es", "en", "pt", "snippets", "root"]),
    sourcePrefix: "",
    checkAnchors: true,
    maxDetails: 100,
    json: false,
    previewFixes: false,
    applySafeFixes: false,
    reportPath: "",
    syncCacheReportPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scope") {
      const value = argv[++index];
      if (!value) throw new Error("--scope requiere un valor");
      const requested = value.split(",").map((item) => item.trim()).filter(Boolean);
      const allowed = new Set(["es", "en", "pt", "snippets", "root", "all"]);
      const invalid = requested.filter((item) => !allowed.has(item));
      if (invalid.length) throw new Error(`Scope desconocido: ${invalid.join(", ")}`);
      options.scopes = requested.includes("all")
        ? new Set(["es", "en", "pt", "snippets", "root"])
        : new Set(requested);
    } else if (arg === "--source-prefix") {
      const value = argv[++index];
      if (!value) throw new Error("--source-prefix requiere un valor");
      options.sourcePrefix = normalizePath(value).replace(/^\/+|\/+$/g, "");
    } else if (arg === "--no-anchors") {
      options.checkAnchors = false;
    } else if (arg === "--max-details") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--max-details requiere un entero mayor o igual que cero");
      }
      options.maxDetails = value;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--fix-safe") {
      options.previewFixes = true;
    } else if (arg === "--apply-safe") {
      options.applySafeFixes = true;
    } else if (arg === "--report") {
      const value = argv[++index];
      if (!value) throw new Error("--report requiere una ruta relativa a docs");
      options.reportPath = normalizePath(value);
    } else if (arg === "--sync-cache-report") {
      const value = argv[++index];
      if (!value) throw new Error("--sync-cache-report requiere la ruta de un reporte previo");
      options.syncCacheReportPath = normalizePath(value);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Uso:
  node scripts/link-health/check-internal-links.mjs [opciones]

Opciones:
  --scope <lista>          all, es, en, pt, snippets o root (separados por coma)
  --source-prefix <ruta>   limita los archivos origen, por ejemplo en/mx2200
  --no-anchors             no comprueba fragmentos #seccion
  --max-details <n>        máximo de hallazgos mostrados (predeterminado: 100)
  --json                   salida JSON completa
  --fix-safe               muestra correcciones seguras sin modificar archivos
  --apply-safe             aplica únicamente las correcciones de confianza alta
  --report <ruta>          guarda un reporte JSON posterior al análisis
  --sync-cache-report <r>  replica en .transdata.json los cambios de un reporte previo
  --help                   muestra esta ayuda

 Sin --apply-safe ni --sync-cache-report, el análisis no modifica archivos. Los enlaces externos se omiten.`);
}

async function walk(relativeDir = "") {
  const absoluteDir = path.join(DOCS_ROOT, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = normalizePath(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      if (!relativeDir && EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...await walk(relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function isActivePage(file) {
  if (!PAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) return false;
  const parts = file.split("/");
  if (parts.length === 1) return !EXCLUDED_ROOT_FILES.has(file);
  return ACTIVE_CONTENT_DIRS.has(parts[0]);
}

function sourceScope(file) {
  const first = file.split("/")[0];
  if (ACTIVE_CONTENT_DIRS.has(first)) return first;
  return "root";
}

function sourceLanguage(file) {
  const parts = file.split("/");
  if (LANGUAGES.has(parts[0])) return parts[0];
  if (parts[0] !== "snippets") return null;
  const basename = path.posix.basename(file, path.posix.extname(file));
  if (basename.endsWith("-en")) return "en";
  if (basename.endsWith("-pt")) return "pt";
  return "es";
}

function isSelectedSource(file, options) {
  if (!options.scopes.has(sourceScope(file))) return false;
  return !options.sourcePrefix || file === options.sourcePrefix || file.startsWith(`${options.sourcePrefix}/`);
}

function isDocumentReference(mdxPath) {
  if (mdxPath.pathType !== "internal") return false;
  if (mdxPath.wrapper === "src") return false;
  const rawPath = mdxPath.originalPath.split(/[?#]/, 1)[0];
  if (!rawPath) return true;
  const extension = path.posix.extname(rawPath).toLowerCase();
  return extension === "" || PAGE_EXTENSIONS.has(extension);
}

function withoutPageExtension(value) {
  return normalizePath(value).replace(/\.(?:mdx|md)$/i, "").replace(/^\/+/, "");
}

function canonicalHref(pageFile, anchor = "") {
  return `/${withoutPageExtension(pageFile)}${anchor || ""}`;
}

function findSuggestion(brokenPath, targetPath, activePages) {
  const sourceFile = normalizePath(path.posix.join(brokenPath.relativeDir, brokenPath.filename));
  const language = sourceLanguage(sourceFile);
  const targetParts = targetPath.split("/");
  const anchor = brokenPath.anchorLink || "";
  const normalizedPages = activePages.map((file) => ({ file, route: withoutPageExtension(file) }));

  if (language && targetParts.length > 1) {
    const targetLanguage = targetParts[0].toLowerCase();
    if (targetLanguage !== language && (LANGUAGES.has(targetLanguage) || targetLanguage === "pt-br" || targetLanguage === "en-us")) {
      const mirroredRoute = [language, ...targetParts.slice(1)].join("/");
      const mirror = normalizedPages.find(({ route }) => route === mirroredRoute);
      if (mirror) {
        return {
          confidence: "high",
          reason: "misma ruta relativa en el idioma del documento origen",
          href: canonicalHref(mirror.file, anchor),
        };
      }
    }
  }

  const caseInsensitive = normalizedPages.filter(({ route }) => route.toLowerCase() === targetPath.toLowerCase());
  if (caseInsensitive.length === 1 && caseInsensitive[0].route !== targetPath) {
    return {
      confidence: "high",
      reason: "diferencia única de mayúsculas/minúsculas",
      href: canonicalHref(caseInsensitive[0].file, anchor),
    };
  }

  const basename = path.posix.basename(targetPath).toLowerCase();
  if (!basename) return null;
  const sameLanguage = language
    ? normalizedPages.filter(({ route }) => route.startsWith(`${language}/`))
    : normalizedPages;
  const basenameMatches = sameLanguage.filter(({ route }) => path.posix.basename(route).toLowerCase() === basename);

  if (basenameMatches.length === 1) {
    return {
      confidence: "high",
      reason: "filename único dentro del idioma; la ruta actual no coincide",
      href: canonicalHref(basenameMatches[0].file, anchor),
    };
  }

  return null;
}

function targetLanguagePrefix(route) {
  const prefix = route.split("/")[0]?.toLowerCase();
  if (LANGUAGES.has(prefix)) return prefix;
  if (prefix === "en-us") return "en";
  if (prefix === "pt-br") return "pt";
  return null;
}

function hasWrongLanguagePrefix(page, targetRoute) {
  const language = sourceLanguage(page);
  const rawPrefix = targetRoute.split("/")[0]?.toLowerCase();
  const targetLanguage = targetLanguagePrefix(targetRoute);
  return Boolean(language && targetLanguage && rawPrefix !== language);
}

function spanishCounterpart(page, pageByRoute) {
  const language = sourceLanguage(page);
  if (language === "en" || language === "pt") {
    if (page.startsWith(`${language}/`)) {
      return pageByRoute.get(`es/${withoutPageExtension(page).split("/").slice(1).join("/")}`) || null;
    }
    if (page.startsWith("snippets/")) {
      const suffix = new RegExp(`-${language}\\.mdx$`, "i");
      const candidate = page.replace(suffix, ".mdx");
      return pageByRoute.get(withoutPageExtension(candidate)) || null;
    }
  }
  return null;
}

function anchorExists(page, anchorLink, nodeByPage) {
  if (!anchorLink) return true;
  const node = nodeByPage.get(page);
  return Boolean(node?.headingSlugs?.has(normalizeAnchor(anchorLink)));
}

function normalizeAnchor(anchorLink) {
  return safeCleanHeadingId(slugify(decodePath(anchorLink.replace(/^#/, ""))));
}

function translatedAnchor(sourcePage, targetPage, anchorLink, nodeByPage) {
  if (!anchorLink) return "";
  const sourceSlugs = [...(nodeByPage.get(sourcePage)?.headingSlugs || [])];
  const targetSlugs = [...(nodeByPage.get(targetPage)?.headingSlugs || [])];
  const sourceAnchor = normalizeAnchor(anchorLink);
  const headingIndex = sourceSlugs.indexOf(sourceAnchor);
  if (headingIndex < 0 || !targetSlugs[headingIndex]) return null;
  return `#${targetSlugs[headingIndex]}`;
}

function findSpanishCanonicalSuggestion({
  page,
  referenceIndex,
  referencesByPage,
  pageByRoute,
  nodeByPage,
  redirects,
}) {
  const language = sourceLanguage(page);
  if (language !== "en" && language !== "pt") return null;
  const spanishPage = spanishCounterpart(page, pageByRoute);
  if (!spanishPage) return null;

  const translatedReferences = referencesByPage.get(page) || [];
  const spanishReferences = referencesByPage.get(spanishPage) || [];
  if (translatedReferences.length !== spanishReferences.length) return null;

  const spanishReference = spanishReferences[referenceIndex];
  if (!spanishReference) return null;
  const spanishRoute = applyExactRedirect(resolveTargetRoute(spanishReference), redirects);
  const spanishTargetPage = pageByRoute.get(spanishRoute);
  if (!spanishTargetPage?.startsWith("es/")) return null;

  const translatedRoute = `${language}/${withoutPageExtension(spanishTargetPage).split("/").slice(1).join("/")}`;
  const translatedTargetPage = pageByRoute.get(translatedRoute);
  if (!translatedTargetPage) return null;
  const anchor = translatedAnchor(spanishTargetPage, translatedTargetPage, spanishReference.anchorLink, nodeByPage);
  if (anchor === null) return null;

  return {
    confidence: "high",
    reason: "filename canónico recuperado del enlace equivalente en ES",
    href: canonicalHref(translatedTargetPage, anchor),
  };
}

function buildFixPlan(findings) {
  const fixes = new Map();
  for (const finding of findings) {
    if (finding.suggestion?.confidence !== "high" || finding.link === finding.suggestion.href) continue;
    const key = `${finding.file}\u0000${finding.link}\u0000${finding.suggestion.href}`;
    const current = fixes.get(key);
    if (current) {
      current.occurrences += 1;
    } else {
      fixes.set(key, {
        file: finding.file,
        from: finding.link,
        to: finding.suggestion.href,
        reason: finding.suggestion.reason,
        occurrences: 1,
      });
    }
  }
  return [...fixes.values()].sort((a, b) => a.file.localeCompare(b.file) || a.from.localeCompare(b.from));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLinkTarget(content, from, to) {
  const escaped = escapeRegExp(from);
  let replacements = 0;

  const markdownLink = new RegExp(
    `(\\]\\(\\s*<?)${escaped}(?=>?\\s*(?:["'][^"'\\r\\n]*["'])?\\s*\\))`,
    "g"
  );
  let output = content.replace(markdownLink, (match, prefix) => {
    replacements += 1;
    return `${prefix}${to}`;
  });

  const hrefAttribute = new RegExp(
    `(\\bhref\\s*=\\s*(?:\\{\\s*)?["'])${escaped}(?=["'](?:\\s*\\})?)`,
    "g"
  );
  output = output.replace(hrefAttribute, (match, prefix) => {
    replacements += 1;
    return `${prefix}${to}`;
  });

  return { content: output, replacements };
}

async function prepareTranslationCacheUpdates(changes) {
  const changesByFile = Map.groupBy(changes, (change) => change.file);
  const prepared = [];

  for (const [file, fileChanges] of changesByFile) {
    if (!file.startsWith("en/") && !file.startsWith("pt/")) continue;

    const cacheFile = `${file}.transdata.json`;
    const absolutePath = path.join(DOCS_ROOT, cacheFile);
    let raw;
    try {
      raw = await fs.readFile(absolutePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      throw error;
    }

    let metadata;
    try {
      metadata = JSON.parse(raw);
    } catch (error) {
      throw new Error(`No se pudo interpretar ${cacheFile}: ${error.message}`);
    }

    const cacheChanges = [];
    for (const change of fileChanges) {
      let replacements = 0;
      for (const section of metadata.sections || []) {
        if (typeof section.translation !== "string") continue;
        const result = replaceLinkTarget(section.translation, change.from, change.to);
        section.translation = result.content;
        replacements += result.replacements;
      }
      if (replacements) cacheChanges.push({ ...change, replacements });
    }

    if (cacheChanges.length) {
      prepared.push({
        file: cacheFile,
        absolutePath,
        content: `${JSON.stringify(metadata, null, 2)}\n`,
        changes: cacheChanges,
      });
    }
  }

  return prepared;
}

async function writeTranslationCacheUpdates(prepared) {
  for (const item of prepared) {
    await fs.writeFile(item.absolutePath, item.content, "utf8");
  }

  const changes = prepared.flatMap((item) => item.changes);
  return {
    filesChanged: prepared.length,
    actionsApplied: changes.length,
    replacementsApplied: changes.reduce((total, item) => total + item.replacements, 0),
    changes,
  };
}

function resolvePathInsideDocs(requestedPath, optionName) {
  const absolutePath = path.resolve(DOCS_ROOT, requestedPath);
  const relativeCheck = path.relative(DOCS_ROOT, absolutePath);
  if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
    throw new Error(`La ruta de ${optionName} debe permanecer dentro de la carpeta docs`);
  }
  return absolutePath;
}

async function syncTranslationCachesFromReport(requestedPath) {
  const absolutePath = resolvePathInsideDocs(requestedPath, "--sync-cache-report");
  const payload = JSON.parse(await fs.readFile(absolutePath, "utf8"));
  const changes = payload?.appliedSafeFixes?.changes;
  if (!Array.isArray(changes)) {
    throw new Error("El reporte no contiene appliedSafeFixes.changes");
  }

  const prepared = await prepareTranslationCacheUpdates(changes);
  const cacheApplication = await writeTranslationCacheUpdates(prepared);
  payload.appliedSafeFixes.translationCache = cacheApplication;
  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { reportPath: absolutePath, ...cacheApplication };
}

async function applyFixPlan(fixPlan) {
  const fixesByFile = Map.groupBy(fixPlan, (fix) => fix.file);
  const prepared = [];
  const mismatches = [];

  for (const [file, fixes] of fixesByFile) {
    const absolutePath = path.join(DOCS_ROOT, file);
    let content = await fs.readFile(absolutePath, "utf8");
    const applied = [];

    for (const fix of fixes) {
      const result = replaceLinkTarget(content, fix.from, fix.to);
      if (result.replacements !== fix.occurrences) {
        mismatches.push({
          file,
          from: fix.from,
          to: fix.to,
          expected: fix.occurrences,
          found: result.replacements,
        });
        continue;
      }
      content = result.content;
      applied.push({ ...fix, replacements: result.replacements });
    }

    prepared.push({ file, absolutePath, content, applied });
  }

  if (mismatches.length) {
    const detail = mismatches
      .map((item) => `${item.file}: ${item.from} (esperadas ${item.expected}, encontradas ${item.found})`)
      .join("\n");
    throw new Error(`La aplicación segura fue cancelada antes de escribir por diferencias de coincidencias:\n${detail}`);
  }

  const applied = prepared.flatMap((item) => item.applied);
  const preparedCaches = await prepareTranslationCacheUpdates(applied);

  for (const item of prepared) {
    if (item.applied.length) await fs.writeFile(item.absolutePath, item.content, "utf8");
  }
  const translationCache = await writeTranslationCacheUpdates(preparedCaches);

  return {
    filesChanged: prepared.filter((item) => item.applied.length).length,
    actionsApplied: applied.length,
    replacementsApplied: applied.reduce((total, item) => total + item.replacements, 0),
    changes: applied,
    translationCache,
  };
}

async function writeManualReviewReport(report, application, requestedPath) {
  const absolutePath = resolvePathInsideDocs(requestedPath, "--report");

  const manualReview = report.findings.filter((finding) => !finding.suggestion);
  const payload = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    docsRoot: report.docsRoot,
    appliedSafeFixes: application,
    summary: {
      analyzedSourcePages: report.summary.analyzedSourcePages,
      syntaxErrors: report.summary.syntaxErrors,
      manualReviewItems: manualReview.length,
      byKind: groupCount(manualReview, (item) => item.kind),
      byScope: groupCount(manualReview, (item) => item.scope),
    },
    syntaxErrors: report.syntaxErrors,
    manualReview,
  };

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return absolutePath;
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveTargetRoute(mdxPath) {
  const original = mdxPath.originalPath.replaceAll("\\", "/");
  const rawPath = decodePath(original.split(/[?#]/, 1)[0]);
  const sourceDir = normalizePath(mdxPath.relativeDir);
  let route;

  if (!rawPath) {
    route = normalizePath(path.posix.join(sourceDir, mdxPath.filename));
  } else if (rawPath.startsWith("./") || rawPath.startsWith("../")) {
    route = path.posix.normalize(path.posix.join(sourceDir, rawPath));
  } else {
    route = rawPath.replace(/^\/+/, "");
  }

  return withoutPageExtension(route).replace(/\/+$/, "");
}

function applyExactRedirect(route, redirects) {
  const redirect = redirects.find(({ source }) => withoutPageExtension(source) === route);
  return redirect ? withoutPageExtension(redirect.destination) : route;
}

function groupCount(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function analyze(options) {
  const allFiles = await walk();
  const activePages = allFiles.filter(isActivePage).sort();
  const graph = new Graph(DOCS_ROOT);
  graph.addNodes(activePages);
  const redirects = await getRedirects(DOCS_ROOT);
  const pageByRoute = new Map();
  const nodeByPage = new Map();
  const referencesByPage = new Map();

  for (const page of activePages) {
    pageByRoute.set(withoutPageExtension(page), page);
    if (path.posix.basename(page).toLowerCase() === "index.mdx") {
      pageByRoute.set(path.posix.dirname(page), page);
    }
  }

  const syntaxErrors = [];
  for (const page of activePages) {
    const node = graph.getNode(page);
    if (!node) continue;
    nodeByPage.set(page, node);
    try {
      const content = await fs.readFile(path.join(DOCS_ROOT, page), "utf8");
      await decorateGraphNodeFromPageContent(node, content, { checkSnippets: true });
      referencesByPage.set(page, node.paths.filter(isDocumentReference));
    } catch (error) {
      syntaxErrors.push({
        file: page,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const findings = [];
  for (const page of activePages) {
    if (!isSelectedSource(page, options)) continue;
    const node = nodeByPage.get(page);
    if (!node) continue;

    const references = referencesByPage.get(page) || [];
    for (let referenceIndex = 0; referenceIndex < references.length; referenceIndex += 1) {
      const item = references[referenceIndex];
      const targetRoute = resolveTargetRoute(item);
      const redirectedRoute = applyExactRedirect(targetRoute, redirects);
      const targetPage = pageByRoute.get(redirectedRoute);
      const spanishSuggestion = findSpanishCanonicalSuggestion({
        page,
        referenceIndex,
        referencesByPage,
        pageByRoute,
        nodeByPage,
        redirects,
      });
      const genericSuggestion = findSuggestion(item, targetRoute, activePages);

      if (hasWrongLanguagePrefix(page, targetRoute)) {
        let suggestion = spanishSuggestion || genericSuggestion;
        if (suggestion) {
          const [suggestedPath, suggestedFragment] = suggestion.href.split("#", 2);
          const suggestedPage = pageByRoute.get(withoutPageExtension(suggestedPath)) || "";
          const suggestedAnchor = suggestedFragment ? `#${suggestedFragment}` : "";
          if (!anchorExists(suggestedPage, suggestedAnchor, nodeByPage)) suggestion = null;
        }
        findings.push({
          file: page,
          scope: sourceScope(page),
          kind: "wrong_language",
          link: item.originalPath,
          suggestion,
        });
        continue;
      }

      if (!targetPage) {
        findings.push({
          file: page,
          scope: sourceScope(page),
          kind: "missing_page",
          link: item.originalPath,
          suggestion: spanishSuggestion || genericSuggestion,
        });
        continue;
      }

      if (options.checkAnchors && item.anchorLink) {
        const targetNode = nodeByPage.get(targetPage);
        const anchor = normalizeAnchor(item.anchorLink);
        if (targetNode?.headingSlugs && !targetNode.headingSlugs.has(anchor)) {
          findings.push({
            file: page,
            scope: sourceScope(page),
            kind: "missing_anchor",
            link: item.originalPath,
            suggestion: null,
          });
        }
      }
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.link.localeCompare(b.link));
  const fixPlan = buildFixPlan(findings);

  const selectedSyntaxErrors = syntaxErrors.filter((item) => isSelectedSource(item.file, options));
  const selectedPages = activePages.filter((file) => isSelectedSource(file, options));

  return {
    generatedAt: new Date().toISOString(),
    docsRoot: DOCS_ROOT,
    options: {
      scopes: [...options.scopes],
      sourcePrefix: options.sourcePrefix || null,
      checkAnchors: options.checkAnchors,
      previewFixes: options.previewFixes,
      applySafeFixes: options.applySafeFixes,
    },
    summary: {
      activePages: activePages.length,
      analyzedSourcePages: selectedPages.length,
      syntaxErrors: selectedSyntaxErrors.length,
      brokenLinks: findings.length,
      missingPages: findings.filter((item) => item.kind === "missing_page").length,
      missingAnchors: findings.filter((item) => item.kind === "missing_anchor").length,
      wrongLanguageLinks: findings.filter((item) => item.kind === "wrong_language").length,
      highConfidenceSuggestions: findings.filter((item) => item.suggestion?.confidence === "high").length,
      mediumConfidenceSuggestions: findings.filter((item) => item.suggestion?.confidence === "medium").length,
      safeFixActions: fixPlan.length,
      safeFixOccurrences: fixPlan.reduce((total, item) => total + item.occurrences, 0),
    },
    countsByScope: groupCount(findings, (item) => item.scope),
    syntaxErrors: selectedSyntaxErrors,
    findings,
    fixPlan,
  };
}

function printTextReport(report, maxDetails) {
  const { summary } = report;
  console.log("Diagnóstico de enlaces internos MDX");
  console.log(`Raíz: ${report.docsRoot}`);
  console.log(`Páginas activas: ${summary.activePages}`);
  console.log(`Páginas analizadas como origen: ${summary.analyzedSourcePages}`);
  console.log(`Errores de sintaxis MDX: ${summary.syntaxErrors}`);
  console.log(`Problemas de enlaces: ${summary.brokenLinks} (${summary.missingPages} páginas, ${summary.missingAnchors} anclas, ${summary.wrongLanguageLinks} cruces de idioma)`);
  console.log(`Sugerencias: ${summary.highConfidenceSuggestions} altas, ${summary.mediumConfidenceSuggestions} medias`);
  console.log(`Plan seguro: ${summary.safeFixActions} acciones sobre ${summary.safeFixOccurrences} apariciones`);
  console.log(`Por scope: ${Object.entries(report.countsByScope).map(([key, value]) => `${key}=${value}`).join(", ") || "sin hallazgos"}`);

  if (report.syntaxErrors.length) {
    console.log("\nErrores de sintaxis:");
    for (const item of report.syntaxErrors) {
      console.log(`- ${item.file}: ${item.error}`);
    }
  }

  const visible = report.findings.slice(0, maxDetails);
  if (visible.length) console.log("\nHallazgos:");
  for (const item of visible) {
    const suggestion = item.suggestion
      ? ` -> ${item.suggestion.href} [${item.suggestion.confidence}: ${item.suggestion.reason}]`
      : "";
    console.log(`- [${item.kind}] ${item.file}: ${item.link}${suggestion}`);
  }
  if (report.findings.length > visible.length) {
    console.log(`\n... ${report.findings.length - visible.length} hallazgos adicionales. Use --json o aumente --max-details.`);
  }

  if (report.options.previewFixes) {
    console.log("\nVista previa de correcciones seguras (no se modificó ningún archivo):");
    for (const fix of report.fixPlan) {
      const occurrences = fix.occurrences > 1 ? ` (${fix.occurrences} apariciones)` : "";
      console.log(`- ${fix.file}: ${fix.from} -> ${fix.to}${occurrences} [${fix.reason}]`);
    }
    if (!report.fixPlan.length) console.log("- No hay correcciones seguras disponibles.");
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    if (options.syncCacheReportPath) {
      if (options.previewFixes || options.applySafeFixes || options.reportPath) {
        throw new Error("--sync-cache-report debe ejecutarse sin --fix-safe, --apply-safe ni --report");
      }
      const result = await syncTranslationCachesFromReport(options.syncCacheReportPath);
      console.log(`Caché de traducción sincronizada: ${result.actionsApplied} acciones, ${result.replacementsApplied} reemplazos, ${result.filesChanged} archivos.`);
      console.log(`Reporte actualizado: ${result.reportPath}`);
      return;
    }

    if (options.previewFixes && options.applySafeFixes) {
      throw new Error("Use --fix-safe o --apply-safe, no ambos en la misma ejecución");
    }

    let report = await analyze(options);
    let application = null;
    if (options.applySafeFixes) {
      application = await applyFixPlan(report.fixPlan);
      report = await analyze({ ...options, applySafeFixes: false });
      report.application = application;
    }

    let savedReport = null;
    if (options.reportPath) {
      savedReport = await writeManualReviewReport(report, application, options.reportPath);
      report.savedReport = savedReport;
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report, options.maxDetails);
      if (application) {
        console.log(`\nCorrecciones aplicadas: ${application.actionsApplied} acciones, ${application.replacementsApplied} reemplazos, ${application.filesChanged} archivos.`);
      }
      if (savedReport) console.log(`Reporte guardado: ${savedReport}`);
    }

    if (report.summary.syntaxErrors || report.summary.brokenLinks) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

await main();
