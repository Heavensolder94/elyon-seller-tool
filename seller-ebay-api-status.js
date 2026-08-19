(() => {
  "use strict";

  const BUTTON_ID = "setEbayConnectPlanBtn";
  const DETAIL_RESULT_ID = "setIntEbayStatus";
  const OVERVIEW_RESULT_ID = "intEbayStatus";
  const TAXONOMY_STATUS_URL = "/api/ebay-taxonomy?action=status";
  const OAUTH_STATUS_URL = "/api/ebay/status?environment=production";
  const MAX_AGE_MS = 2 * 60 * 1000;
  let request = null;
  let lastResult = null;
  let checkedAt = 0;
  let scheduled = false;

  const text = (value) => String(value ?? "").trim();
  const normalized = (value) => text(value).toLocaleLowerCase("de-DE").replace(/\s+/g, " ");

  function settingsIsActive() {
    const settings = document.getElementById("settingsTab");
    if (!settings) return false;
    if (settings.classList.contains("active")) return true;
    return document.getElementById("mainMenu")?.value === "settingsTab";
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function detailResultNode() {
    return document.getElementById(DETAIL_RESULT_ID);
  }

  function overviewResultNode() {
    return document.getElementById(OVERVIEW_RESULT_ID);
  }

  function buttonNode() {
    return document.getElementById(BUTTON_ID);
  }

  function ebayStatusRows() {
    return [...document.querySelectorAll(".sd-status")].filter((row) =>
      normalized(row.querySelector("span")?.textContent) === "ebay oauth",
    );
  }

  function ebayHeroBadges() {
    return [...document.querySelectorAll(".sd-badge")].filter((badge) =>
      normalized(badge.textContent).startsWith("ebay "),
    );
  }

  function overviewCopy(state) {
    if (state.status === "checking") return { label: "Wird geprüft …", tone: "warn", status: "checking" };
    if (state.oauthConnected === true) return { label: "Verbunden", tone: "good", status: "connected" };
    if (state.oauthConnected === false) return { label: "Nicht verbunden", tone: "bad", status: "disconnected" };
    return { label: "Status nicht abrufbar", tone: "warn", status: "unknown" };
  }

  function applyOverviewState(state, detailLabel) {
    const overview = overviewCopy(state);
    const overviewNode = overviewResultNode();
    if (overviewNode) {
      overviewNode.textContent = overview.label;
      overviewNode.dataset.ebayStatus = overview.status;
      overviewNode.classList.remove("good", "warn", "bad", "success", "warning", "error");
      overviewNode.classList.add(overview.tone);
      overviewNode.title = detailLabel || overview.label;
    }

    ebayStatusRows().forEach((row) => {
      const value = row.querySelector("strong");
      if (!value) return;
      value.classList.remove("sd-good", "sd-warn", "sd-bad");
      value.classList.add(overview.tone === "good" ? "sd-good" : overview.tone === "bad" ? "sd-bad" : "sd-warn");
      value.textContent = overview.status === "checking" ? "wird geprüft …" : overview.label.toLocaleLowerCase("de-DE");
      value.title = detailLabel || overview.label;
      row.dataset.ebayStatusVerified = overview.status === "checking" ? "checking" : "1";
    });

    ebayHeroBadges().forEach((badge) => {
      badge.classList.remove("good", "warn", "bad");
      badge.classList.add(overview.tone);
      badge.textContent = `eBay ${overview.status === "checking" ? "wird geprüft …" : overview.label.toLocaleLowerCase("de-DE")}`;
      badge.title = detailLabel || overview.label;
    });
  }

  function applyResult(state) {
    lastResult = state;
    const node = detailResultNode();
    const checking = state.status === "checking";
    const apiReachable = state.apiReachable === true;
    const oauthConnected = state.oauthConnected === true;
    const apiUnknown = state.apiReachable === null;

    let label = "eBay API wird geprüft …";
    let tone = "warning";
    if (!checking && apiReachable && oauthConnected) {
      label = "eBay API erreichbar · OAuth verbunden";
      tone = "success";
    } else if (!checking && apiReachable && !oauthConnected) {
      label = "eBay API erreichbar · OAuth nicht verbunden";
      tone = "warning";
    } else if (!checking && apiUnknown && oauthConnected) {
      label = "eBay API-Status nicht abrufbar · OAuth verbunden";
      tone = "warning";
    } else if (!checking && apiUnknown) {
      label = "eBay API-Status nicht abrufbar";
      tone = "warning";
    } else if (!checking) {
      label = "eBay API derzeit nicht erreichbar";
      tone = "error";
    }

    if (node) {
      node.textContent = label;
      node.dataset.ebayApiStatus = checking ? "checking" : apiReachable ? "reachable" : apiUnknown ? "unknown" : "unreachable";
      node.dataset.ebayOauthStatus = checking ? "checking" : oauthConnected ? "connected" : "disconnected";
      node.classList.remove("success", "warning", "error", "ok", "bad", "warn");
      node.classList.add(tone);
      node.title = text(state.detail) || label;
    }

    applyOverviewState(state, text(state.detail) || label);
  }

  async function checkEbayApiStatus({ force = false } = {}) {
    if (!force && lastResult && checkedAt && Date.now() - checkedAt < MAX_AGE_MS) {
      applyResult(lastResult);
      return lastResult;
    }
    if (request) return request;

    const button = buttonNode();
    const previousLabel = text(button?.textContent) || "eBay API prüfen";
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "eBay wird geprüft …";
    }
    applyResult({ status: "checking", apiReachable: null, oauthConnected: null, detail: "Offizielle eBay-API und OAuth-Verbindung werden gemeinsam geprüft." });

    request = Promise.allSettled([
      fetchJson(TAXONOMY_STATUS_URL),
      fetchJson(OAUTH_STATUS_URL),
    ]).then(([apiResult, oauthResult]) => {
      const apiReachable = apiResult.status === "fulfilled"
        ? apiResult.value?.ok === true && apiResult.value?.configured !== false
        : null;
      const oauthConnected = oauthResult.status === "fulfilled" && oauthResult.value?.connected === true;
      const details = [];
      if (apiResult.status === "fulfilled") details.push("eBay-Taxonomy-Endpunkt antwortet erfolgreich.");
      else details.push(`API-Prüfung fehlgeschlagen: ${apiResult.reason?.message || apiResult.reason || "unbekannter Fehler"}`);
      if (oauthResult.status === "fulfilled") details.push(oauthConnected ? "OAuth-Refresh-Token ist vorhanden." : "Kein OAuth-Refresh-Token erkannt.");
      else details.push(`OAuth-Status nicht abrufbar: ${oauthResult.reason?.message || oauthResult.reason || "unbekannter Fehler"}`);

      const state = {
        status: "ready",
        apiReachable,
        oauthConnected,
        detail: details.join(" "),
        checkedAt: new Date().toISOString(),
      };
      checkedAt = Date.now();
      applyResult(state);
      window.dispatchEvent(new CustomEvent("elyon:ebay-api-status", { detail: state }));
      return state;
    }).finally(() => {
      request = null;
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = previousLabel;
      }
    });

    return request;
  }

  function captureClick(event) {
    const button = event.target?.closest?.(`#${BUTTON_ID}`);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    checkEbayApiStatus({ force: true });
  }

  function decorate() {
    scheduled = false;
    const button = buttonNode();
    if (!button) return;
    button.type = "button";
    button.title = "Offizielle eBay-API und OAuth-Verbindung gemeinsam prüfen";
    if (!button.dataset.elyonEbayStatusReady) {
      button.dataset.elyonEbayStatusReady = "1";
      setTimeout(() => checkEbayApiStatus(), 0);
    } else if (lastResult) {
      applyResult(lastResult);
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(decorate);
    else setTimeout(decorate, 0);
  }

  function scheduleBoundedDecorates() {
    [120, 450, 1000, 1800].forEach((delay) => setTimeout(() => {
      if (settingsIsActive()) scheduleDecorate();
    }, delay));
  }

  function install() {
    document.addEventListener("click", captureClick, true);
    scheduleDecorate();
    scheduleBoundedDecorates();

    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu" && event.target.value === "settingsTab") scheduleDecorate();
    }, true);
    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (tabId === "settingsTab") scheduleDecorate();
    });
    window.addEventListener("focus", () => {
      if (settingsIsActive()) checkEbayApiStatus();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && settingsIsActive()) checkEbayApiStatus();
    });
    window.ElyonEbayApiStatus = {
      refresh: () => checkEbayApiStatus({ force: true }),
      status: () => lastResult,
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
