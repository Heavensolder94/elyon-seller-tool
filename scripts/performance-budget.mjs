import { readFile } from "node:fs/promises";
import path from "node:path";

export const PERFORMANCE_BUDGETS = Object.freeze({
  sourceHtmlBytes: 1_020_000,
  outputHtmlBytes: 220_000,
  coreBytes: 540_000,
  lazyAgentsBytes: 300_000,
  maxInlineScriptBytes: 16_000,
  startupScriptCount: 24,
  startupLocalScriptBytes: 900_000,
  startupMutationObserverOccurrences: 14,
  startupPollingOccurrences: 6,
});

const SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_PATTERN = /\bsrc\s*=\s*["']([^"']+)["']/i;
const LAZY_SRC_PATTERN = /\bsrc\s*:\s*["']([^"']+)["']/g;

function bytes(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function countMatches(value, pattern) {
  return [...String(value || "").matchAll(pattern)].length;
}

function normalizeScriptPath(src) {
  const value = String(src || "").trim();
  if (!value || /^(?:data:|blob:|javascript:)/i.test(value)) return "";
  if (/^(?:https?:)?\/\//i.test(value)) return value;
  try {
    return new URL(value, "https://elyon.local").pathname;
  } catch {
    return value.split("?")[0].split("#")[0];
  }
}

export function parseStartupScripts(html) {
  const scripts = [];
  for (const match of String(html || "").matchAll(SCRIPT_PATTERN)) {
    const attributes = match[1] || "";
    const body = match[2] || "";
    const srcMatch = attributes.match(SRC_PATTERN);
    scripts.push({
      src: srcMatch ? srcMatch[1] : "",
      path: srcMatch ? normalizeScriptPath(srcMatch[1]) : "",
      attributes,
      inlineBytes: srcMatch ? 0 : bytes(body.trim()),
    });
  }
  return scripts;
}

export function parseLazyScriptPaths(runtimeLoaderSource) {
  const paths = [];
  for (const match of String(runtimeLoaderSource || "").matchAll(LAZY_SRC_PATTERN)) {
    const normalized = normalizeScriptPath(match[1]);
    if (normalized) paths.push(normalized);
  }
  return paths;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.filter(Boolean).forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates].sort();
}

function addLimitError(errors, label, actual, limit) {
  if (actual > limit) {
    errors.push(`${label}: ${actual.toLocaleString("de-DE")} > Budget ${limit.toLocaleString("de-DE")}`);
  }
}

export function analyzeDesktopPerformance({
  sourceHtml,
  outputHtml,
  coreCode,
  agentsCode,
  runtimeLoaderSource,
  assetContents = new Map(),
  budgets = PERFORMANCE_BUDGETS,
}) {
  const errors = [];
  const scripts = parseStartupScripts(outputHtml);
  const externalScripts = scripts
    .map((script) => script.src)
    .filter((src) => /^(?:https?:)?\/\//i.test(src));
  const startupPaths = scripts
    .map((script) => script.path)
    .filter((scriptPath) => scriptPath && !/^(?:https?:)?\/\//i.test(scriptPath));
  const uniqueStartupPaths = [...new Set(startupPaths)];
  const duplicateStartupPaths = duplicateValues(startupPaths);
  const lazyPaths = parseLazyScriptPaths(runtimeLoaderSource);
  const duplicateLazyPaths = duplicateValues(lazyPaths);
  const lazyPathSet = new Set(lazyPaths);
  const startupLazyOverlap = uniqueStartupPaths.filter((scriptPath) => lazyPathSet.has(scriptPath));
  const maxInlineScriptBytes = scripts.reduce((max, script) => Math.max(max, script.inlineBytes), 0);

  let startupLocalScriptBytes = 0;
  let startupMutationObserverOccurrences = 0;
  let startupPollingOccurrences = 0;
  const missingStartupAssets = [];

  uniqueStartupPaths.forEach((scriptPath) => {
    const content = assetContents instanceof Map ? assetContents.get(scriptPath) : assetContents[scriptPath];
    if (typeof content !== "string") {
      missingStartupAssets.push(scriptPath);
      return;
    }
    startupLocalScriptBytes += bytes(content);
    startupMutationObserverOccurrences += countMatches(content, /\bMutationObserver\s*\(/g);
    startupPollingOccurrences += countMatches(content, /\bsetInterval\s*\(/g);
  });

  if (externalScripts.length) {
    errors.push(`Externe Start-Skripte sind nicht erlaubt: ${externalScripts.join(", ")}`);
  }
  if (duplicateStartupPaths.length) {
    errors.push(`Doppelte Start-Skripte: ${duplicateStartupPaths.join(", ")}`);
  }
  if (duplicateLazyPaths.length) {
    errors.push(`Doppelte Lazy-Module: ${duplicateLazyPaths.join(", ")}`);
  }
  if (startupLazyOverlap.length) {
    errors.push(`Module gleichzeitig im Start- und Lazy-Pfad: ${startupLazyOverlap.join(", ")}`);
  }
  if (missingStartupAssets.length) {
    errors.push(`Nicht gefundene Start-Assets: ${missingStartupAssets.join(", ")}`);
  }

  const metrics = {
    sourceHtmlBytes: bytes(sourceHtml),
    outputHtmlBytes: bytes(outputHtml),
    coreBytes: bytes(coreCode),
    lazyAgentsBytes: bytes(agentsCode),
    maxInlineScriptBytes,
    startupScriptCount: uniqueStartupPaths.length,
    startupLocalScriptBytes,
    startupMutationObserverOccurrences,
    startupPollingOccurrences,
    lazyScriptCount: new Set(lazyPaths).size,
    externalStartupScriptCount: externalScripts.length,
  };

  addLimitError(errors, "Quell-HTML", metrics.sourceHtmlBytes, budgets.sourceHtmlBytes);
  addLimitError(errors, "Produktions-HTML", metrics.outputHtmlBytes, budgets.outputHtmlBytes);
  addLimitError(errors, "App-Kern", metrics.coreBytes, budgets.coreBytes);
  addLimitError(errors, "Lazy-Agentenmodul", metrics.lazyAgentsBytes, budgets.lazyAgentsBytes);
  addLimitError(errors, "Größtes Inline-Skript", metrics.maxInlineScriptBytes, budgets.maxInlineScriptBytes);
  addLimitError(errors, "Start-Skriptanzahl", metrics.startupScriptCount, budgets.startupScriptCount);
  addLimitError(errors, "Lokales Start-JavaScript", metrics.startupLocalScriptBytes, budgets.startupLocalScriptBytes);
  addLimitError(errors, "MutationObserver im Startpfad", metrics.startupMutationObserverOccurrences, budgets.startupMutationObserverOccurrences);
  addLimitError(errors, "Polling-Schleifen im Startpfad", metrics.startupPollingOccurrences, budgets.startupPollingOccurrences);

  return {
    ok: errors.length === 0,
    errors,
    metrics,
    budgets: { ...budgets },
    startupPaths: uniqueStartupPaths,
    lazyPaths: [...new Set(lazyPaths)],
  };
}

export async function auditDesktopPerformance({
  sourceHtml,
  outputHtml,
  coreCode,
  agentsCode,
  runtimeLoaderSource,
  publicRoot,
  budgets = PERFORMANCE_BUDGETS,
}) {
  const startupPaths = [...new Set(parseStartupScripts(outputHtml)
    .map((script) => script.path)
    .filter((scriptPath) => scriptPath && !/^(?:https?:)?\/\//i.test(scriptPath)))];
  const assetContents = new Map();

  await Promise.all(startupPaths.map(async (scriptPath) => {
    const filePath = path.join(publicRoot, scriptPath.replace(/^\/+/, ""));
    try {
      assetContents.set(scriptPath, await readFile(filePath, "utf8"));
    } catch {
      assetContents.set(scriptPath, null);
    }
  }));

  const result = analyzeDesktopPerformance({
    sourceHtml,
    outputHtml,
    coreCode,
    agentsCode,
    runtimeLoaderSource,
    assetContents,
    budgets,
  });

  if (!result.ok) {
    throw new Error(`Performance-Budget verletzt:\n- ${result.errors.join("\n- ")}`);
  }

  return result;
}
