const XLSX_CDN_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const XLSX_TAG_PATTERN = /\s*<script\s+src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js["']><\/script>\s*/;
const INLINE_APP_PATTERN = /<script>\s*'use strict';[\s\S]*?<\/script>/g;

function scriptBody(block) {
  return block
    .replace(/^<script>\s*/, "")
    .replace(/\s*<\/script>$/, "")
    .trimStart();
}

function addLazyXlsxLoader(coreCode) {
  const helper = `'use strict';\nlet elyonXlsxLibraryPromise = null;\nfunction ensureXlsxLibrary(){\n  if(window.XLSX) return Promise.resolve(window.XLSX);\n  if(elyonXlsxLibraryPromise) return elyonXlsxLibraryPromise;\n  elyonXlsxLibraryPromise = new Promise(function(resolve,reject){\n    const existing = document.querySelector('script[data-elyon-xlsx-loader]');\n    if(existing){\n      existing.addEventListener('load',function(){ resolve(window.XLSX); },{once:true});\n      existing.addEventListener('error',function(){ reject(new Error('XLSX-Bibliothek konnte nicht geladen werden.')); },{once:true});\n      return;\n    }\n    const script = document.createElement('script');\n    script.src = '${XLSX_CDN_URL}';\n    script.async = true;\n    script.dataset.elyonXlsxLoader = 'true';\n    script.onload = function(){ resolve(window.XLSX); };\n    script.onerror = function(){\n      elyonXlsxLibraryPromise = null;\n      reject(new Error('XLSX-Bibliothek konnte nicht geladen werden.'));\n    };\n    document.head.appendChild(script);\n  });\n  return elyonXlsxLibraryPromise;\n}\n`;

  let optimized = coreCode.replace(/^'use strict';\s*/, helper);
  const originalImport = `function importCSV(e){\n  const file=e.target.files[0];\n  if(!file) return;\n  const name = String(file.name || '').toLowerCase();\n  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');\n  const reader=new FileReader();`;
  const lazyImport = `async function importCSV(e){\n  const file=e.target.files[0];\n  if(!file) return;\n  const name = String(file.name || '').toLowerCase();\n  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');\n  if(isExcel){\n    try{\n      await ensureXlsxLibrary();\n    }catch(err){\n      alert(err.message || 'XLSX-Bibliothek konnte nicht geladen werden.');\n      safe('csvImport',function(el){ el.value=''; });\n      return;\n    }\n  }\n  const reader=new FileReader();`;

  if (!optimized.includes(originalImport)) {
    throw new Error("Desktop core importCSV signature was not found; lazy XLSX transformation aborted.");
  }
  optimized = optimized.replace(originalImport, lazyImport);
  return optimized;
}

export function extractDesktopRuntime(html, { version = Date.now() } = {}) {
  const matches = [...html.matchAll(INLINE_APP_PATTERN)];
  if (matches.length !== 2) {
    throw new Error(`Expected exactly 2 desktop inline application scripts, found ${matches.length}.`);
  }

  const [coreMatch, agentsMatch] = matches;
  const coreBlock = coreMatch[0];
  const agentsBlock = agentsMatch[0];
  const coreCode = addLazyXlsxLoader(scriptBody(coreBlock));
  const agentsCode = scriptBody(agentsBlock);

  let optimizedHtml = html.replace(XLSX_TAG_PATTERN, "\n");
  optimizedHtml = optimizedHtml.replace(coreBlock, `<script src="/seller-app-core.js?v=${version}"></script>`);
  optimizedHtml = optimizedHtml.replace(agentsBlock, "");

  return {
    html: optimizedHtml,
    coreCode,
    agentsCode,
    metrics: {
      sourceBytes: Buffer.byteLength(html, "utf8"),
      htmlBytes: Buffer.byteLength(optimizedHtml, "utf8"),
      coreBytes: Buffer.byteLength(coreCode, "utf8"),
      agentsBytes: Buffer.byteLength(agentsCode, "utf8"),
    },
  };
}
