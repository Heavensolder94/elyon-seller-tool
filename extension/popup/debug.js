(function () {
  function bindDebugButton() {
    const button = document.getElementById("sendToElyon");
    if (!button || button.dataset.debugBound === "true") return;
    button.dataset.debugBound = "true";
    button.addEventListener("click", () => {
      const activeTabLabel = (() => {
        const el = document.getElementById("activeTab");
        return el?.textContent?.trim() || "-";
      })();
      alert(`Elyon Popup Debug\n\nDer Klick auf "Produkt an Elyon senden" kommt an.\n\nAktiver Tab:\n${activeTabLabel}`);
      const log = document.getElementById("actionLog");
      if (log) log.textContent = "Debug: Klick auf Produkt an Elyon senden erkannt.";
    }, { capture: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindDebugButton, { once: true });
  } else {
    bindDebugButton();
  }
})();
