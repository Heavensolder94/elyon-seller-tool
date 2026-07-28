import test from "node:test";
import assert from "node:assert/strict";
import {
  PERFORMANCE_BUDGETS,
  analyzeDesktopPerformance,
  parseLazyScriptPaths,
  parseStartupScripts,
} from "../scripts/performance-budget.mjs";

const relaxedBudgets = {
  ...PERFORMANCE_BUDGETS,
  sourceHtmlBytes: 1_000_000,
  outputHtmlBytes: 1_000_000,
  coreBytes: 1_000_000,
  lazyAgentsBytes: 1_000_000,
  maxInlineScriptBytes: 1_000_000,
  startupScriptCount: 100,
  startupLocalScriptBytes: 1_000_000,
  startupMutationObserverOccurrences: 100,
  startupPollingOccurrences: 100,
};

function analyze({
  outputHtml = '<script src="/seller-app-core.js"></script><script defer src="/seller-runtime-loader.js"></script>',
  runtimeLoaderSource = 'const GROUPS={feature:[{src:"/feature.js"}]};',
  assetContents = new Map([
    ["/seller-app-core.js", "console.log('core');"],
    ["/seller-runtime-loader.js", "console.log('loader');"],
  ]),
  budgets = relaxedBudgets,
} = {}) {
  return analyzeDesktopPerformance({
    sourceHtml: "<!doctype html><html></html>",
    outputHtml,
    coreCode: "console.log('core');",
    agentsCode: "console.log('agents');",
    runtimeLoaderSource,
    assetContents,
    budgets,
  });
}

test("parses startup and lazy module paths without cache query strings", () => {
  const startup = parseStartupScripts('<script defer src="/a.js?v=1"></script><script>small()</script>');
  const lazy = parseLazyScriptPaths('const x=[{src:"/b.js"},{src:"/c.js?v=2"}];');

  assert.equal(startup[0].path, "/a.js");
  assert.ok(startup[1].inlineBytes > 0);
  assert.deepEqual(lazy, ["/b.js", "/c.js"]);
});

test("accepts a lean startup path with separated lazy modules", () => {
  const result = analyze();

  assert.equal(result.ok, true);
  assert.equal(result.metrics.startupScriptCount, 2);
  assert.equal(result.metrics.lazyScriptCount, 1);
  assert.deepEqual(result.errors, []);
});

test("blocks large inline JavaScript from returning to production HTML", () => {
  const result = analyze({
    outputHtml: `<script>${"x".repeat(2_000)}</script>`,
    assetContents: new Map(),
    budgets: { ...relaxedBudgets, maxInlineScriptBytes: 500 },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Größtes Inline-Skript/);
});

test("blocks duplicate modules and startup/lazy overlap", () => {
  const result = analyze({
    outputHtml: '<script src="/duplicate.js?v=1"></script><script defer src="/duplicate.js?v=2"></script>',
    runtimeLoaderSource: 'const x=[{src:"/duplicate.js"},{src:"/duplicate.js"}];',
    assetContents: new Map([["/duplicate.js", "console.log('duplicate');"]]),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Doppelte Start-Skripte/);
  assert.match(result.errors.join("\n"), /Doppelte Lazy-Module/);
  assert.match(result.errors.join("\n"), /gleichzeitig im Start- und Lazy-Pfad/);
});

test("blocks external startup libraries", () => {
  const result = analyze({
    outputHtml: '<script src="https://cdn.example.com/heavy-library.js"></script>',
    assetContents: new Map(),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Externe Start-Skripte/);
});

test("blocks observer and polling accumulation in startup modules", () => {
  const result = analyze({
    outputHtml: '<script src="/busy.js"></script>',
    runtimeLoaderSource: "const GROUPS={};",
    assetContents: new Map([["/busy.js", "new MutationObserver(()=>{});setInterval(()=>{},1000);"]]),
    budgets: {
      ...relaxedBudgets,
      startupMutationObserverOccurrences: 0,
      startupPollingOccurrences: 0,
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /MutationObserver im Startpfad/);
  assert.match(result.errors.join("\n"), /Polling-Schleifen im Startpfad/);
});
