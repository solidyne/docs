// ...otros imports...

/**
 * Recibe el contenido string de un archivo MDX
 * Retorna un array de secciones:
 * [
 *   { id, title, level, content, startLine, endLine }
 * ]
 */
function parseMdxSections(content) {
  // Normaliza saltos de línea (CRLF o CR solos a LF)
  content = content.replace(/\r\n?/g, '\n');
  const lines = content.split("\n");
  const sections = [];
  let current = null;
  const headingRegex = /^\s*(#{2,})\s+(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Si es import o JSX, preserva literal (no crear sección, no traducir)
    if (line.trim().startsWith("import ") || line.trim().startsWith("<")) {
      // Si no hay sección abierta, inicializa Whole file
      if (!current) {
        current = {
          id: 'section_1', title: 'Whole file', level: 0, startLine: i, content: ''
        };
      }
      current.content += line + '\n';
      continue;
    }
    const match = headingRegex.exec(line);
    if (match && match[1].length >= 2) {  // ##, ###, ####...
      if (current && current.content.trim()) {
        current.endLine = i - 1;
        sections.push(current);
      }
      current = {
        id: `section_${sections.length + 1}`,
        title: match[2].trim(),
        level: match[1].length,
        startLine: i,
        endLine: null,
        content: line + '\n',
      };
    } else if (current) {
      current.content += line + '\n';
    } else {
      current = {
        id: "section_1",
        title: "Whole file",
        level: 0,
        startLine: i,
        content: line + '\n'
      };
    }
  }
  if (current && current.content.trim()) {
    current.endLine = lines.length - 1;
    sections.push(current);
  }
  return sections;
}

// Export para importar desde translate-folder.mjs
export { parseMdxSections };