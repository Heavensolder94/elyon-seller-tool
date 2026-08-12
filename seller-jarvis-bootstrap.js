(() => {
  "use strict";

  const FILES = [
    "/seller-jarvis-client.js",
    "/seller-jarvis-ui.js",
    "/seller-jarvis-command-center.js",
    "/seller-jarvis-companion-handoff.js",
  ];
  const VERSION = "phase-d3-v1";

  function existing(path) {
    return [...document.scripts].some((script) => {
      try { return new URL(script.src, window.location.href).pathname === path; }
      catch { return false; }
    });
  }

  function load(path) {
    if (existing(path)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${path}?v=${VERSION}`;
      script.defer = true;
      script.dataset.elyonJarvisModule = path;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error(`Jarvis-Modul konnte nicht geladen werden: ${path}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function boot() {
    try {
      for (const file of FILES) await load(file);
      window.ElyonJarvisUI?.refresh?.();
      window.ElyonJarvisCommandCenter?.refresh?.();
    } catch (error) {
      console.warn("[Elyon Jarvis] D3 Bootstrap fehlgeschlagen", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
