const MAX_ITEM_SPECIFICS = 30;
const MAX_NAME_LENGTH = 65;
const MAX_VALUE_LENGTH = 65;

function clean(value, max = 5000) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function valueList(value) {
  const input = Array.isArray(value) ? value : [value];
  const output = [];
  for (const entry of input) {
    const normalized = clean(entry, MAX_VALUE_LENGTH);
    if (normalized && !output.includes(normalized)) output.push(normalized);
  }
  return output;
}

export function buildDraftItemSpecificColumns(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { headers: [], values: [], count: 0 };

  const headers = [];
  const values = [];
  const seen = new Set();

  for (const [rawName, rawValue] of Object.entries(value)) {
    let name = clean(rawName, MAX_NAME_LENGTH + 2).replace(/^C:/i, '').replace(/^\*+/, '').trim();
    if (!name) continue;
    name = name.slice(0, MAX_NAME_LENGTH);
    const key = name.toLocaleLowerCase('de-DE');
    if (seen.has(key)) continue;

    const entries = valueList(rawValue);
    if (!entries.length) continue;

    headers.push(`C:${name}`);
    values.push(entries.join('|'));
    seen.add(key);
    if (headers.length >= MAX_ITEM_SPECIFICS) break;
  }

  return { headers, values, count: headers.length };
}
