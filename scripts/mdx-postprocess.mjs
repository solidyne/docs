export function postProcessMdx(content, targetLang) {

  let result = content;

  // 1. corregir enlaces markdown
  result = result.replace(/\]\(\/es\//g, `](/${targetLang}/`);

  // 2. enlaces HTML
  result = result.replace(/href=["']\/es\//g, `href="/${targetLang}/`);

  // 3. enlaces MDX <Link>
  result = result.replace(/href=\{?["']\/es\//g, `href="/${targetLang}/`);

  // 4. snippets
  result = result.replace(
    /\/snippets\/([a-zA-Z0-9_-]+)\.mdx/g,
    `/snippets/$1-${targetLang}.mdx`
  );

  return result;
}

export function validateMdx(content, filePath, targetLang) {

  if (content.includes("/es/")) {
    console.warn(`⚠ Spanish link detected in ${filePath}`);
  }

  const wrongSnippet = `/snippets/`;
  const correctSuffix = `-${targetLang}.mdx`;

  if (content.includes(wrongSnippet) && !content.includes(correctSuffix)) {
    console.warn(`⚠ Possible snippet language issue in ${filePath}`);
  }

}