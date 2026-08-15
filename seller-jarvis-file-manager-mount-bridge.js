(() => {
  "use strict";

  const TAB_ID = "jarvisCommandCenterTab";
  const ROOT_ID = "jarvisFileManagerPanel";
  const VERSION = "v1.1-stable-mount";

  let tabObserver = null;
  let bodyObserver = null;
  let scheduled = false;

  function hostState() {
    const tab = document.getElementById(TAB_ID);
    const shell = tab?.querySelector(".jarvis-cc") || null;
    const panel = document.getElementById(ROOT_ID);
    return { tab, shell, panel };
  }

  function reconcile() {
    scheduled = false;
    const { shell, panel } = hostState();
    if (!shell) return false;
    if (!panel || !shell.contains(panel)) {
      window.ElyonJarvisFileManager?.refresh?.();
    }
    const next = hostState();
    return Boolean(next.panel && next.shell?.contains(next.panel));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => requestAnimationFrame(reconcile));
  }

  function observeTab(tab) {
    tabObserver?.disconnect();
    tabObserver = new MutationObserver(() => {
      const { shell, panel } = hostState();
      if (shell && (!panel || !shell.contains(panel))) schedule();
    });
    tabObserver.observe(tab, { childList: true, subtree: true });
  }

  function bind() {
    const { tab } = hostState();
    if (tab) {
      bodyObserver?.disconnect();
      bodyObserver = null;
      observeTab(tab);
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
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
