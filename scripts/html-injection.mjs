function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripMarkedBlock(html, startMarker, endMarker) {
  const source = String(html ?? "");
  const start = escapeRegExp(startMarker);
  const end = escapeRegExp(endMarker);
  return source.replace(new RegExp(`\\s*${start}[\\s\\S]*?${end}\\s*`, "g"), "\n");
}

export function insertBeforeFinalClosingBody(html, block) {
  const source = String(html ?? "");
  const matches = Array.from(source.matchAll(/<\/body\s*>/gi));
  const normalizedBlock = String(block ?? "").trim();

  if (!normalizedBlock) return source;
  if (!matches.length) return `${source.replace(/\s+$/, "")}\n${normalizedBlock}\n`;

  const lastBody = matches[matches.length - 1];
  const bodyIndex = lastBody.index;
  const before = source.slice(0, bodyIndex).replace(/[ \t]*$/, "");
  const after = source.slice(bodyIndex);
  const indentedBlock = normalizedBlock.split("\n").map((line) => `  ${line}`).join("\n");

  return `${before}\n${indentedBlock}\n${after}`;
}

export function injectMarkedBlock(html, { startMarker, endMarker, content }) {
  const cleaned = stripMarkedBlock(html, startMarker, endMarker);
  const block = [startMarker, content, endMarker].filter(Boolean).join("\n");
  return insertBeforeFinalClosingBody(cleaned, block);
}
