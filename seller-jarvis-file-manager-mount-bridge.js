(() => {
  "use strict";

  const TAB_ID = "jarvisCommandCenterTab";
  const ROOT_ID = "jarvisFileManagerPanel";
  const DETAIL_MODAL_ID = "jarvisFileManagerModal";
  const VERSION = "v1.2-ui-reconcile";

  let tabObserver = null;
  let bodyObserver = null;
  let modalObserver = null;
  let observedModal = null;
  let scheduled = false;

  function hostState() {
    const tab = document.getElementById(TAB_ID);
    const shell = tab?.querySelector(".jarvis-cc") || null;
    const panel = document.getElementById(ROOT_ID);
    return { tab, shell, panel };
  }

  function patchPanel(panel) {
    if (!panel) return false;

    const subtitle = panel.querySelector(".jarvis-fm-sub");
    if (subtitle && subtitle.textContent.includes("zentral prüfen")) {
      subtitle.textContent = "Core Brain, Rules & Safety und Execution zentral prüfen und kontrolliert ändern – mit Health, Diff, Freigabe und Versionshistorie.";
    }

    panel.querySelectorAll(".jarvis-fm-statusline .jarvis-fm-pill").forEach((pill) => {
      const label = String(pill.textContent || "").trim();
      if (label === "READ ONLY") {
        pill.textContent = "EDIT WORKFLOW V1.2";
        pill.classList.remove("ok");
        pill.classList.add("info");
      }
      if (label === "AKTIVIERUNG GESPERRT") {
        pill.textContent = "APPROVAL ERFORDERLICH";
        pill.classList.add("lock");
      }
    });

    const foot = panel.querySelector(".jarvis-fm-foot span:first-child");
    if (foot && !foot.textContent.includes("Draft → Review")) {
      foot.textContent = "Änderungen laufen kontrolliert über Draft → Review → Freigabe → Aktivierung. Geschützte Core-Dateien verlangen eine zusätzliche Bestätigung.";
    }

    window.ElyonJarvisFileManagerActions?.bindRoot?.();
    return true;
  }

  function patchDetailModal() {
    const modal = document.getElementById(DETAIL_MODAL_ID);
    if (!modal) return false;
    const safety = modal.querySelector(".jarvis-fm-safety");
    if (safety && safety.textContent.includes("V1.1-Ansicht")) {
      safety.innerHTML = "<strong>Sicherheitsmodus V1.2:</strong> Diese Ansicht bleibt die reine Review-/Diff-Ansicht. Änderungen erfolgen ausschließlich über <strong>Bearbeiten</strong> und den kontrollierten Workflow Draft → Freigabe → Aktivieren. Protected Files benötigen zusätzliche Bestätigung.";
    }
    return true;
  }

  function observeDetailModal() {
    const modal = document.getElementById(DETAIL_MODAL_ID);
    if (!modal || modal === observedModal) return;
    modalObserver?.disconnect();
    observedModal = modal;
    modalObserver = new MutationObserver(() => schedule());
    modalObserver.observe(modal, { childList: true, subtree: true });
  }

  function reconcile() {
    scheduled = false;
    const { shell, panel } = hostState();
    if (!shell) return false;

    if (!panel || !shell.contains(panel)) {
      window.ElyonJarvisFileManager?.refresh?.();
    }

    const next = hostState();
    if (!next.panel || !next.shell?.contains(next.panel)) return false;

    patchPanel(next.panel);
    observeDetailModal();
    patchDetailModal();
    return true;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => requestAnimationFrame(reconcile));
  }

  function observeTab(tab) {
    tabObserver?.disconnect();
    tabObserver = new MutationObserver(schedule);
    tabObserver.observe(tab, { childList: true, subtree: true });
  }

  function bind() {
    const { tab } = hostState();
    if (tab) {
      bodyObserver?.disconnect();
      bodyObserver = null;
      observeTab(tab);
      observeDetailModal();
      schedule();
      return true;
    }

    if (!bodyObserver) {
      bodyObserver = new MutationObserver(() => {
        const nextTab = document.getElementById(TAB_ID);
        if (!nextTab) return;
        bodyObserver?.disconnect();
        bodyObserver = null;
        observeTab(nextTab);
        observeDetailModal();
        schedule();
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
    return false;
  }

  window.addEventListener("elyon:tab-changed", schedule);
  window.addEventListener("elyon:seller-authenticated", schedule);
  window.addEventListener("elyon:jarvis-ui-result", schedule);
  window.addEventListener("elyon:jarvis-command-center-result", schedule);

  window.ElyonJarvisFileManagerMountBridge = Object.freeze({
    version: VERSION,
    bind,
    reconcile,
    schedule,
    patchPanel,
    patchDetailModal,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
