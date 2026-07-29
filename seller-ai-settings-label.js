(() => {
  "use strict";

  const SETTINGS_MODAL_SELECTOR = "#settingsModal";
  const TARGET_LABEL = "🤖 KI & Modelle";
  let observer = null;
  let scheduled = false;

  function normalizedLabel(value) {
    return String(value ?? "")
      .replace(/^🤖\s*/u, "")
      .trim()
      .toLocaleLowerCase("de-DE");
  }

  function applyLabel() {
    scheduled = false;
    const modal = document.querySelector(SETTINGS_MODAL_SELECTOR);
    if (!modal) return false;

    const candidates = modal.querySelectorAll("h3, summary");
    for (const candidate of candidates) {
      const label = normalizedLabel(candidate.textContent);
      if (label !== "ki" && label !== "ki & modelle") continue;
      if (candidate.textContent.trim() !== TARGET_LABEL) candidate.textContent = TARGET_LABEL;
      candidate.dataset.elyonAiSettingsLabel = "1";
      return true;
    }
    return false;
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyLabel);
  }

  function install() {
    applyLabel();
    const modal = document.querySelector(SETTINGS_MODAL_SELECTOR);
    if (modal && !observer) {
      observer = new MutationObserver(scheduleApply);
      observer.observe(modal, { childList: true, subtree: true });
    }
    [120, 400, 900].forEach((delay) => setTimeout(scheduleApply, delay));
  }

  window.ElyonAiSettingsLabel = {
    apply: applyLabel,
    install,
    label: TARGET_LABEL,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
