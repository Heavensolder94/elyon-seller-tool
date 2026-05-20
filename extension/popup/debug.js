(function () {
  window.__elyonSendButtonDebug = function () {
    const activeTabLabel = (() => {
      const el = document.getElementById("activeTab");
      return el?.textContent?.trim() || "-";
    })();
    const log = document.getElementById("actionLog");
    if (log) log.textContent = `Debug: Popup bereit. Aktiver Tab: ${activeTabLabel}`;
  };

  function bindDebugButton() {
    const button = document.getElementById("sendToElyon");
    if (!button || button.dataset.debugBound === "true") return;
    button.dataset.debugBound = "true";
    button.addEventListener("click", () => {
      if (typeof window.__elyonSendButtonDebug === "function") {
        window.__elyonSendButtonDebug();
      }
    }, { capture: true });
    setTimeout(() => {
      const log = document.getElementById("actionLog");
      if (log && log.textContent === "Bereit.") {
        log.textContent = "Popup geladen - Debug bereit.";
      }
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindDebugButton, { once: true });
  } else {
    bindDebugButton();
  }
})();
