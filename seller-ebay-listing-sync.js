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
    const inventoryUnpublished = number(counts.inventoryUnpublished);
    const inventoryPublished = number(counts.inventoryPublished);
    const syncedAt = data?.syncedAt ? new Date(data.syncedAt).toLocaleString("de-DE") : "gerade eben";
    const inventoryError = text(data?.inventoryOffers?.error);

    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h2>🛒 eBay Listing-Status</h2><p class="hint">Aktive Listings kommen aus GetMyeBaySelling/ActiveList. Inventory-API-Offers werden nur separat diagnostisch angezeigt und nicht mehr als Seller-Hub-Entwürfe ausgegeben.</p></div><button type="button" class="secondary" id="elyonEbayListingSyncRefresh">Jetzt aktualisieren</button></div><div class="dashboard" style="margin-bottom:0"><div class="metric"><small>Seller Hub · aktiv</small><strong>${active}</strong></div><div class="metric"><small>Seller Hub · Entwürfe</small><strong>—</strong></div><div class="metric"><small>Inventory API · UNPUBLISHED</small><strong>${inventoryUnpublished}</strong></div><div class="metric"><small>Inventory API · PUBLISHED</small><strong>${inventoryPublished}</strong></div><div class="metric"><small>Letzte Synchronisation</small><strong style="font-size:14px">${syncedAt}</strong></div></div><p class="hint" style="margin-top:12px;margin-bottom:0">Die öffentliche eBay API bietet keine lesbare Seller-Hub-Draft-Liste. Deshalb wird hier bewusst kein erfundener Draft-Zähler angezeigt. Ein UNPUBLISHED Inventory Offer ist nicht automatisch ein Seller-Hub-Entwurf.${inventoryError ? ` Inventory-Diagnose: ${text(inventoryError)}` : ""}</p>`;
    card.querySelector("#elyonEbayListingSyncRefresh")?.addEventListener("click", load, { once: true });
    return data;
  }

  function renderError(error) {
    const card = ensureCard();
    if (!card) return null;
    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2>🛒 eBay Listing-Status</h2><p class="hint">Seller-Status derzeit nicht verfügbar: ${text(error?.message || "Unbekannter Fehler")}</p></div><button type="button" class="secondary" id="elyonEbayListingSyncRetry">Erneut prüfen</button></div>`;
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
