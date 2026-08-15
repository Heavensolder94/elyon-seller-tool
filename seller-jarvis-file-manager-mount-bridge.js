(() => {
  "use strict";

  const TAB_ID = "jarvisCommandCenterTab";
  const ROOT_ID = "jarvisFileManagerPanel";
  const HOST_ID = "jarvisBrainControlPersistentHost";
  const HOST_STYLE_ID = "jarvisBrainControlPersistentHostStyles";
  const HOST_FALLBACK_ATTR = "data-jarvis-brain-host-fallback";
  const DETAIL_MODAL_ID = "jarvisFileManagerModal";
  const ACTIONS_PATH = "/seller-jarvis-file-manager-actions.js";
  const VERSION = "v1.2-persistent-host-2";

  let tabObserver = null;
  let bodyObserver = null;
  let modalObserver = null;
  let observedModal = null;
  let scheduled = false;
  let actionsPromise = null;

  function hostState() {
    const tab = document.getElementById(TAB_ID);
    const shell = tab?.querySelector(".jarvis-cc") || null;
    const panel = document.getElementById(ROOT_ID);
    const host = document.getElementById(HOST_ID);
    return { tab, shell, panel, host };
  }

  function installHostStyles() {
    if (document.getElementById(HOST_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HOST_STYLE_ID;
    style.textContent = `
      #${HOST_ID}{display:none;min-width:0;margin-top:16px;margin-bottom:34px}
      #${TAB_ID}.active + #${HOST_ID},#${HOST_ID}.active{display:block!important}
      #${HOST_ID} > #${ROOT_ID}{margin:0}
      #${HOST_ID} [${HOST_FALLBACK_ATTR}]{display:block;padding:18px;border-radius:24px;background:linear-gradient(145deg,rgba(15,23,42,.72),rgba(8,17,31,.82));border:1px solid rgba(96,165,250,.22);color:#dbeafe;box-shadow:0 18px 50px rgba(2,6,23,.18)}
      #${HOST_ID} [${HOST_FALLBACK_ATTR}] strong{display:block;font-size:16px;margin-bottom:5px}
      #${HOST_ID} [${HOST_FALLBACK_ATTR}] span{font-size:10px;color:#93a4b8}
    `;
    document.head.appendChild(style);
  }

  function ensureFallback(host) {
    if (!host || document.getElementById(ROOT_ID) || host.querySelector(`[${HOST_FALLBACK_ATTR}]`)) return false;
    const fallback = document.createElement("div");
    fallback.setAttribute(HOST_FALLBACK_ATTR, "1");
    fallback.innerHTML = "<strong>◉ Jarvis Brain Control</strong><span>Brain Control wird geladen …</span>";
    host.appendChild(fallback);
    return true;
  }

  function ensurePersistentHost(tab) {
    if (!tab?.parentNode) return null;
    installHostStyles();
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("section");
      host.id = HOST_ID;
      host.dataset.jarvisBrainPersistentHost = "1";
      tab.insertAdjacentElement("afterend", host);
    } else if (host.previousElementSibling !== tab) {
      tab.insertAdjacentElement("afterend", host);
    }
    ensureFallback(host);
    return host;
  }

  function syncHostVisibility(tab, host) {
    if (!tab || !host) return false;
    const menu = document.getElementById("mainMenu");
    const active = tab.classList.contains("active") || menu?.value === TAB_ID;
    host.classList.toggle("active", Boolean(active));
    host.setAttribute("aria-hidden", active ? "false" : "true");
    host.style.display = active ? "block" : "";
    return active;
  }

  function existingScript(path) {
    return [...document.scripts].find((script) => {
      try { return new URL(script.src, window.location.href).pathname === path; }
      catch { return false; }
    }) || null;
  }

  function loadActions() {
    if (window.ElyonJarvisFileManagerActions?.openEditor) {
      window.ElyonJarvisFileManagerActions.mount?.();
      window.ElyonJarvisFileManagerActions.bindRoot?.();
      return Promise.resolve(window.ElyonJarvisFileManagerActions);
    }
    if (actionsPromise) return actionsPromise;

    actionsPromise = new Promise((resolve, reject) => {
      const already = existingScript(ACTIONS_PATH);
      if (already) {
        const finish = () => {
          if (!window.ElyonJarvisFileManagerActions?.openEditor) {
            reject(new Error("jarvis_file_manager_actions_not_initialized"));
            return;
          }
          window.ElyonJarvisFileManagerActions.mount?.();
          window.ElyonJarvisFileManagerActions.bindRoot?.();
          resolve(window.ElyonJarvisFileManagerActions);
        };
        if (already.dataset.elyonJarvisActionsLoaded === "1") finish();
        else {
          already.addEventListener("load", finish, { once: true });
          already.addEventListener("error", () => reject(new Error("jarvis_file_manager_actions_load_failed")), { once: true });
          queueMicrotask(() => {
            if (window.ElyonJarvisFileManagerActions?.openEditor) finish();
          });
        }
        return;
      }

      const script = document.createElement("script");
      script.src = `${ACTIONS_PATH}?v=${encodeURIComponent(VERSION)}`;
      script.defer = true;
      script.dataset.elyonJarvisActionsFallback = "1";
      script.addEventListener("load", () => {
        script.dataset.elyonJarvisActionsLoaded = "1";
        if (!window.ElyonJarvisFileManagerActions?.openEditor) {
          reject(new Error("jarvis_file_manager_actions_not_initialized"));
          return;
        }
        window.ElyonJarvisFileManagerActions.mount?.();
        window.ElyonJarvisFileManagerActions.bindRoot?.();
        resolve(window.ElyonJarvisFileManagerActions);
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("jarvis_file_manager_actions_load_failed")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      actionsPromise = null;
      throw error;
    });

    return actionsPromise;
  }

  async function openEditor(key, button) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) return false;
    const previous = button?.textContent || "Bearbeiten";
    if (button) {
      button.disabled = true;
      button.textContent = "Lade Editor …";
    }
    try {
      const actions = await loadActions();
      await actions.openEditor(cleanKey);
      return true;
    } catch (error) {
      console.error("[Jarvis Brain Control] Edit Workflow konnte nicht geladen werden", error);
      window.alert?.("Der Jarvis Edit-Workflow konnte nicht geladen werden. Bitte Seite einmal neu laden. Wenn der Fehler bleibt, ist das Preview-Asset nicht verfügbar.");
      return false;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previous;
      }
    }
  }

  function ensureEditButtons(panel) {
    if (!panel) return false;
    panel.querySelectorAll("[data-jarvis-file-key]").forEach((card) => {
      const key = String(card.dataset.jarvisFileKey || "").trim();
      const actions = card.querySelector(".jarvis-fm-file-actions");
      if (!key || !actions) return;
      let button = actions.querySelector("[data-jarvis-file-edit]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "jarvis-fm-btn jarvis-fm-edit-btn";
        button.dataset.jarvisFileEdit = key;
        button.textContent = "Bearbeiten";
        const review = actions.querySelector("[data-jarvis-file-open]");
        if (review) actions.insertBefore(button, review);
        else actions.prepend(button);
      }
      button.onclick = () => openEditor(key, button);
    });
    return true;
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

    ensureEditButtons(panel);
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

  function movePanelToPersistentHost(panel, host) {
    if (!panel || !host) return false;
    if (panel.parentElement !== host) host.appendChild(panel);
    host.querySelector(`[${HOST_FALLBACK_ATTR}]`)?.remove();
    return panel.parentElement === host;
  }

  function reconcile() {
    scheduled = false;
    const current = hostState();
    if (!current.tab) return false;

    const host = ensurePersistentHost(current.tab);
    if (!host) return false;
    syncHostVisibility(current.tab, host);

    let panel = document.getElementById(ROOT_ID);
    if (!panel) {
      window.ElyonJarvisFileManager?.refresh?.();
      panel = document.getElementById(ROOT_ID);
      if (!panel) {
        ensureFallback(host);
        queueMicrotask(() => schedule());
        return false;
      }
    }

    movePanelToPersistentHost(panel, host);
    patchPanel(panel);
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
    tabObserver.observe(tab, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  function bind() {
    const { tab } = hostState();
    if (tab) {
      bodyObserver?.disconnect();
      bodyObserver = null;
      const host = ensurePersistentHost(tab);
      if (host) syncHostVisibility(tab, host);
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
        const host = ensurePersistentHost(nextTab);
        if (host) syncHostVisibility(nextTab, host);
        observeTab(nextTab);
        observeDetailModal();
        schedule();
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
    return false;
  }

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mainMenu") schedule();
  }, true);
  window.addEventListener("elyon:tab-changed", schedule);
  window.addEventListener("elyon:seller-authenticated", schedule);
  window.addEventListener("elyon:jarvis-ui-result", schedule);
  window.addEventListener("elyon:jarvis-command-center-result", schedule);
  window.addEventListener("elyon:jarvis-command-center-rendered", schedule);

  window.ElyonJarvisFileManagerMountBridge = Object.freeze({
    version: VERSION,
    bind,
    reconcile,
    schedule,
    patchPanel,
    patchDetailModal,
    ensureEditButtons,
    ensurePersistentHost,
    ensureFallback,
    syncHostVisibility,
    movePanelToPersistentHost,
    loadActions,
    openEditor,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
