(() => {
  "use strict";

  const CARD_ID = "elyonEbayListingSync";
  const API_URL = "/api/ebay/seller-state?environment=production";
  let request = null;

  const text = (value) => String(value ?? "").trim();
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

  async function load() {
    if (request) return request;
    request = fetch(API_URL, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
        window.__elyonSellerState = data;
        return data;
      })
      .then(render)
      .catch((error) => renderError(error))
      .finally(() => { request = null; });
    return request;
  }

  function ensureCard() {
    let card = document.getElementById(CARD_ID);
    if (card) return card;
    const dashboard = document.querySelector("#dashboardTab > .card");
    if (!dashboard) return null;
    card = document.createElement("section");
    card.id = CARD_ID;
    card.className = "card";
    card.style.marginTop = "20px";
    dashboard.insertAdjacentElement("afterend", card);
    return card;
  }

  function render(data) {
    const card = ensureCard();
    if (!card) return data;
    const counts = data?.counts || {};
    const active = number(counts.active);
    const drafts = number(counts.drafts);
    const draftsAvailable = data?.draftsAvailable !== false;
    const syncedAt = data?.syncedAt ? new Date(data.syncedAt).toLocaleString("de-DE") : "gerade eben";
    const draftHint = draftsAvailable
      ? "Entwürfe sind von Elyon erstellte eBay-Entwürfe, die noch nicht veröffentlicht wurden. Wird ein Entwurf veröffentlicht oder entfernt, verschwindet er hier automatisch."
      : `Entwürfe konnten gerade nicht geprüft werden: ${text(data?.draftError || "Unbekannter Fehler")}`;

    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h2>🛒 eBay Listing-Status</h2><p class="hint">Einfacher Live-Überblick über Elyon-Entwürfe und aktive eBay-Listings.</p></div><button type="button" class="secondary" id="elyonEbayListingSyncRefresh">Jetzt aktualisieren</button></div><div class="dashboard" style="margin-bottom:0"><div class="metric"><small>Entwürfe</small><strong>${draftsAvailable ? drafts : "!"}</strong></div><div class="metric"><small>Aktive Listings</small><strong>${active}</strong></div><div class="metric"><small>Letzte Synchronisation</small><strong style="font-size:14px">${syncedAt}</strong></div></div><p class="hint" style="margin-top:12px;margin-bottom:0">${draftHint}</p>`;
    card.querySelector("#elyonEbayListingSyncRefresh")?.addEventListener("click", load, { once: true });
    return data;
  }

  function renderError(error) {
    const card = ensureCard();
    if (!card) return null;
    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2>🛒 eBay Listing-Status</h2><p class="hint">eBay-Status derzeit nicht verfügbar: ${text(error?.message || "Unbekannter Fehler")}</p></div><button type="button" class="secondary" id="elyonEbayListingSyncRetry">Erneut prüfen</button></div>`;
    card.querySelector("#elyonEbayListingSyncRetry")?.addEventListener("click", load, { once: true });
    return null;
  }

  function install() {
    load();
    window.addEventListener("elyon:seller-authenticated", load);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
    window.ElyonEbayListingSync = { refresh: load };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
