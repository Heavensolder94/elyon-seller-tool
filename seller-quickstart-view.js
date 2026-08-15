import {
  QUICKSTART_PRIMARY_WORKFLOW,
  QUICKSTART_SECONDARY_LINKS,
  escapeHtml,
  routeById,
  selectQuickstartRecommendation,
} from "./seller-quickstart-core.js";

export const PANEL_ID = "elyonModernQuickstartPanel";
export const STYLE_ID = "elyonModernQuickstartStyles";

function statusFromBadges(snapshot, prefix, fallback) {
  return snapshot.badges.find((badge) => badge.toLowerCase().startsWith(prefix.toLowerCase())) || fallback;
}

function metricForRoute(route, snapshot) {
  const pipeline = snapshot.pipeline || {};
  if (route.id === "companyOs" || route.id === "productMaster") return `${pipeline.products || 0} Produkte`;
  if (route.id === "listingPackage") return `${pipeline.readyProducts || 0} bereit`;
  if (route.id === "ebay") return `${pipeline.liveProducts || 0} live`;
  if (route.id === "orders" || route.id === "shipping") return `${pipeline.openOrders || 0} offen`;
  return "Öffnen";
}

export function installQuickstartStyles(documentRef) {
  if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID}{max-width:1120px;width:min(96vw,1120px);display:grid;gap:16px}
    #${PANEL_ID} .eq-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
    #${PANEL_ID} .eq-head h2{margin:5px 0 8px;font-size:clamp(27px,4vw,39px);letter-spacing:-.045em}
    #${PANEL_ID} .eq-head p{margin:0;max-width:780px;color:#cbd5e1;line-height:1.55;font-size:13px}
    #${PANEL_ID} .eq-close{min-width:44px;padding:11px 13px}
    #${PANEL_ID} .eq-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    #${PANEL_ID} .eq-status-card{padding:13px 14px;border-radius:17px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.14)}
    #${PANEL_ID} .eq-status-card small{display:block;margin-bottom:6px;color:#94a3b8;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
    #${PANEL_ID} .eq-status-card strong{display:block;font-size:13px;line-height:1.4;color:#e2e8f0;overflow-wrap:anywhere}
    #${PANEL_ID} .eq-focus{display:grid;grid-template-columns:minmax(0,1.3fr) auto;gap:14px;align-items:center;padding:18px;border-radius:22px;background:linear-gradient(145deg,rgba(37,99,235,.18),rgba(124,58,237,.12));border:1px solid rgba(96,165,250,.24)}
    #${PANEL_ID} .eq-focus small{display:block;color:#bfdbfe;font-size:10px;letter-spacing:.07em;text-transform:uppercase}
    #${PANEL_ID} .eq-focus h3{margin:6px 0;font-size:20px;letter-spacing:-.025em}
    #${PANEL_ID} .eq-focus p{margin:0;color:#cbd5e1;font-size:12px;line-height:1.5}
    #${PANEL_ID} .eq-workflow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
    #${PANEL_ID} .eq-route{min-height:164px;padding:16px;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:10px;background:rgba(255,255,255,.055);border:1px solid rgba(148,163,184,.14);border-radius:20px}
    #${PANEL_ID} .eq-route:hover{border-color:rgba(96,165,250,.32)}
    #${PANEL_ID} .eq-route-top{width:100%;display:flex;justify-content:space-between;gap:10px;align-items:center}
    #${PANEL_ID} .eq-step{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:10px;background:rgba(59,130,246,.14);color:#bfdbfe;font-size:11px;font-weight:950}
    #${PANEL_ID} .eq-route-icon{font-size:22px}
    #${PANEL_ID} .eq-route strong{font-size:15px;line-height:1.3}
    #${PANEL_ID} .eq-route span{color:#cbd5e1;font-size:11px;line-height:1.45;font-weight:600}
    #${PANEL_ID} .eq-route em{margin-top:auto;font-style:normal;color:#93c5fd;font-size:11px;font-weight:850}
    #${PANEL_ID} .eq-secondary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
    #${PANEL_ID} .eq-secondary button{display:flex;justify-content:space-between;align-items:center;gap:14px;text-align:left;padding:15px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.13)}
    #${PANEL_ID} .eq-secondary-copy{display:grid;gap:4px}
    #${PANEL_ID} .eq-secondary-copy strong{font-size:14px}
    #${PANEL_ID} .eq-secondary-copy span{font-size:11px;color:#cbd5e1;line-height:1.4}
    #${PANEL_ID} .eq-footer{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;padding-top:4px}
    #${PANEL_ID} .eq-footer .checkrow{margin:0}
    #${PANEL_ID} .eq-note{padding:11px 13px;border-radius:15px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.17);color:#dbeafe;font-size:12px;line-height:1.45}
    @media(max-width:900px){#${PANEL_ID} .eq-workflow{grid-template-columns:repeat(2,minmax(0,1fr))}#${PANEL_ID} .eq-status{grid-template-columns:repeat(2,minmax(0,1fr))}#${PANEL_ID} .eq-secondary{grid-template-columns:1fr}}
    @media(max-width:620px){#${PANEL_ID} .eq-workflow,#${PANEL_ID} .eq-secondary,#${PANEL_ID} .eq-status{grid-template-columns:1fr}#${PANEL_ID} .eq-focus{grid-template-columns:1fr}#${PANEL_ID} .eq-route{min-height:auto}}
  `;
  documentRef.head.appendChild(style);
}

export function quickstartPanelMarkup(snapshot) {
  const recommendation = selectQuickstartRecommendation(snapshot.tasks, snapshot.pipeline);
  const recommendedRoute = routeById(recommendation.routeId) || QUICKSTART_PRIMARY_WORKFLOW[0];
  const ebayStatus = statusFromBadges(snapshot, "eBay ", "eBay Status wird geladen");
  const productStatus = statusFromBadges(snapshot, "Product Master ", "Product Master wird geladen");
  const orderStatus = `${snapshot.pipeline.openOrders || 0} offen · ${snapshot.pipeline.fulfilledOrders || 0} abgeschlossen`;
  const note = snapshot.ready
    ? "Datenbasis: aktueller Seller-Dashboard-Snapshot aus Product Master und eBay Orders API."
    : "Seller-Dashboard wird vorbereitet. Das Menü zeigt keine lokalen Altdaten und startet keine eigene API-Abfrage.";

  return `
    <div class="eq-head"><div><div class="badge">🚀 Elyon Seller Schnellstart</div><h2 id="elyonQuickstartTitle">Wo geht dein Seller-Workflow weiter?</h2><p>Company OS → Seller Product Master → Listing-Paket → eBay → Bestellungen → Versand → Rechnungen → Retouren</p></div><button type="button" class="secondary eq-close" data-quickstart-close aria-label="Schnellstartmenü schließen">✕</button></div>
    <div class="eq-status" aria-label="Seller-Systemstatus"><div class="eq-status-card"><small>Product Master</small><strong>${escapeHtml(productStatus)}</strong></div><div class="eq-status-card"><small>eBay</small><strong>${escapeHtml(ebayStatus)}</strong></div><div class="eq-status-card"><small>Bestellungen</small><strong>${escapeHtml(orderStatus)}</strong></div><div class="eq-status-card"><small>Aktualisiert</small><strong>${escapeHtml(snapshot.updatedLabel)}</strong></div></div>
    <section class="eq-focus"><div><small>${escapeHtml(recommendation.eyebrow)}</small><h3>${escapeHtml(recommendation.title)}</h3><p>${escapeHtml(recommendation.detail)}</p></div><button type="button" data-quickstart-route="${escapeHtml(recommendedRoute.id)}">${escapeHtml(recommendedRoute.label)} öffnen</button></section>
    <div class="eq-workflow">${QUICKSTART_PRIMARY_WORKFLOW.map((route) => `<button type="button" class="secondary eq-route" data-quickstart-route="${escapeHtml(route.id)}"><span class="eq-route-top"><span class="eq-step">${route.step}</span><span class="eq-route-icon">${route.icon}</span></span><strong>${escapeHtml(route.label)}</strong><span>${escapeHtml(route.description)}</span><em>${escapeHtml(metricForRoute(route, snapshot))}</em></button>`).join("")}</div>
    <div class="eq-secondary">${QUICKSTART_SECONDARY_LINKS.map((route) => `<button type="button" class="secondary" data-quickstart-route="${escapeHtml(route.id)}"><span style="font-size:22px">${route.icon}</span><span class="eq-secondary-copy"><strong>${escapeHtml(route.label)}</strong><span>${escapeHtml(route.description)}</span></span><span>→</span></button>`).join("")}</div>
    <div class="eq-note">${escapeHtml(note)}</div>
    <div class="eq-footer"><label class="checkrow"><input type="checkbox" id="showStartLauncherAgain"> <span>Beim Start anzeigen</span></label><button type="button" class="secondary" data-quickstart-refresh>${snapshot.loading ? "Dashboard lädt …" : "Seller-Daten aktualisieren"}</button></div>
  `;
}
