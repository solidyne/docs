import fs from "node:fs";
import path from "node:path";

import { safeCleanHeadingId, slugify } from "@mintlify/common";
import { Graph } from "@mintlify/link-rot/dist/graph.js";
import { decorateGraphNodeFromPageContent } from "@mintlify/link-rot/dist/static-checking/getBrokenInternalLinks.js";

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractLinkTargets(content) {
  const targets = [];
  const patterns = [
    /\]\(\s*<?([^\s)>]+)>?(?=\s*(?:["'][^"'\r\n]*["'])?\s*\))/g,
    /\bhref\s*=\s*(?:\{\s*)?(["'])(.*?)\1(?:\s*\})?/g,
  ];

  for (const [patternIndex, pattern] of patterns.entries()) {
    for (const match of content.matchAll(pattern)) {
      const value = patternIndex === 0 ? match[1] : match[2];
      const offset = patternIndex === 0
        ? match[0].indexOf(value)
        : match[0].lastIndexOf(value);
      targets.push({
        value,
        start: match.index + offset,
        end: match.index + offset + value.length,
      });
    }
  }

  return targets.sort((left, right) => left.start - right.start);
}

export function protectLinkTargets(content) {
  const targets = extractLinkTargets(content);
  const replacements = targets.map((target, index) => ({
    ...target,
    token: `__SOLIDYNE_LINK_TARGET_${String(index).padStart(4, "0")}__`,
  }));
  let protectedContent = content;

  for (const item of replacements.toReversed()) {
    protectedContent = `${protectedContent.slice(0, item.start)}${item.token}${protectedContent.slice(item.end)}`;
  }

  return {
    content: protectedContent,
    restore(translatedContent) {
      let restored = translatedContent;
      for (const item of replacements) {
        const occurrences = restored.split(item.token).length - 1;
        if (occurrences !== 1) {
          throw new Error(`El traductor no preservó el marcador protegido ${item.token}`);
        }
        restored = restored.replace(item.token, item.value);
      }
      return restored;
    },
  };
}

function splitTarget(value) {
  const hashIndex = value.indexOf("#");
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const fragment = hashIndex >= 0 ? value.slice(hashIndex + 1) : "";
  const queryIndex = beforeHash.indexOf("?");
  return {
    pathname: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    query: queryIndex >= 0 ? beforeHash.slice(queryIndex) : "",
    fragment,
  };
}

function isExternalTarget(value) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
}

function existingMdxPath(candidate) {
  const variants = path.extname(candidate).toLowerCase() === ".mdx"
    ? [candidate]
    : [`${candidate}.mdx`, path.join(candidate, "index.mdx")];
  return variants.find((item) => fs.existsSync(item) && fs.statSync(item).isFile()) || null;
}

function resolveSpanishDocument(sourceFile, target, docsRoot) {
  if (isExternalTarget(target) || target.startsWith("//")) return null;
  const { pathname, query, fragment } = splitTarget(target);
  let candidate;

  if (!pathname) {
    candidate = sourceFile;
  } else if (pathname.startsWith("/")) {
    candidate = path.join(docsRoot, decodePath(pathname).replace(/^\/+/, ""));
  } else {
    candidate = path.resolve(path.dirname(sourceFile), decodePath(pathname));
  }

  const mdxPath = existingMdxPath(candidate);
  if (!mdxPath) return null;

  const esRoot = path.join(docsRoot, "es");
  const relativeToEs = path.relative(esRoot, mdxPath);
  if (relativeToEs.startsWith("..") || path.isAbsolute(relativeToEs)) return null;
  return { pathname, query, fragment, mdxPath, relativeToEs };
}

function localizePathname(pathname, targetLang) {
  if (!pathname) return "";
  if (/^\/es(?:\/|$)/i.test(pathname)) {
    return pathname.replace(/^\/es(?=\/|$)/i, `/${targetLang}`);
  }
  return pathname;
}

function normalizeAnchor(fragment) {
  return safeCleanHeadingId(slugify(decodePath(fragment)));
}

function replaceTargets(content, replacements) {
  let output = content;
  for (const replacement of replacements.toReversed()) {
    output = `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`;
  }
  return output;
}

export async function localizeInternalDocumentLinks({
  docsRoot,
  sourceFolder,
  targetFolder,
  sourceFiles,
  targetLang,
}) {
  const graph = new Graph(docsRoot);
  const headingsCache = new Map();
  const warnings = [];
  let filesChanged = 0;
  let linksChanged = 0;
  let anchorsChanged = 0;

  async function getHeadingSlugs(file) {
    const relativeFile = normalizePath(path.relative(docsRoot, file));
    if (headingsCache.has(relativeFile)) return headingsCache.get(relativeFile);
    graph.addNodes([relativeFile]);
    const node = graph.getNode(relativeFile);
    await decorateGraphNodeFromPageContent(node, fs.readFileSync(file, "utf8"), { checkSnippets: true });
    const slugs = [...(node.headingSlugs || [])];
    headingsCache.set(relativeFile, slugs);
    return slugs;
  }

  for (const sourceFile of sourceFiles) {
    const relativeFile = path.relative(sourceFolder, sourceFile);
    const targetFile = path.join(targetFolder, relativeFile);
    if (!fs.existsSync(targetFile)) continue;

    const sourceContent = fs.readFileSync(sourceFile, "utf8");
    const targetContent = fs.readFileSync(targetFile, "utf8");
    const sourceTargets = extractLinkTargets(sourceContent);
    const targetTargets = extractLinkTargets(targetContent);

    if (sourceTargets.length !== targetTargets.length) {
      warnings.push({
        file: normalizePath(relativeFile),
        reason: `cantidad de enlaces distinta (ES=${sourceTargets.length}, ${targetLang.toUpperCase()}=${targetTargets.length})`,
      });
      continue;
    }

    const replacements = [];
    for (let index = 0; index < sourceTargets.length; index += 1) {
      const sourceTarget = sourceTargets[index].value;
      const resolved = resolveSpanishDocument(sourceFile, sourceTarget, docsRoot);
      if (!resolved) continue;

      const translatedTargetFile = path.join(docsRoot, targetLang, resolved.relativeToEs);
      if (!fs.existsSync(translatedTargetFile)) {
        warnings.push({
          file: normalizePath(relativeFile),
          link: sourceTarget,
          reason: `no existe el documento equivalente en ${targetLang.toUpperCase()}`,
        });
        continue;
      }

      let localizedFragment = resolved.fragment;
      if (resolved.fragment) {
        const sourceHeadings = await getHeadingSlugs(resolved.mdxPath);
        const targetHeadings = await getHeadingSlugs(translatedTargetFile);
        const headingIndex = sourceHeadings.indexOf(normalizeAnchor(resolved.fragment));
        if (headingIndex < 0 || !targetHeadings[headingIndex]) {
          warnings.push({
            file: normalizePath(relativeFile),
            link: sourceTarget,
            reason: "no se pudo relacionar el subtítulo ES con su traducción",
          });
          continue;
        }
        localizedFragment = targetHeadings[headingIndex];
      }

      const localizedTarget = `${localizePathname(resolved.pathname, targetLang)}${resolved.query}${localizedFragment ? `#${localizedFragment}` : ""}`;
      const currentTarget = targetTargets[index];
      if (currentTarget.value === localizedTarget) continue;
      replacements.push({ ...currentTarget, value: localizedTarget });
      if (resolved.fragment) anchorsChanged += 1;
    }

    if (replacements.length) {
      fs.writeFileSync(targetFile, replaceTargets(targetContent, replacements), "utf8");
      filesChanged += 1;
      linksChanged += replacements.length;
    }
  }

  return { filesChanged, linksChanged, anchorsChanged, warnings };
}
