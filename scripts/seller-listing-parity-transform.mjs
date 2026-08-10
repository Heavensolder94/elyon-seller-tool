function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Seller listing parity transform failed: ${label}`);
  return source.replace(marker, replacement);
}

export function transformSellerRuntimeLoader(source) {
  let output = String(source || "");
  output = replaceRequired(
    output,
    'getJson("/api/ebay/listings?environment=production")',
    'getJson("/api/ebay/seller-state?environment=production")',
    "runtime seller-state endpoint marker missing",
  );
  output = replaceRequired(
    output,
    '      if (listingResult.status !== "fulfilled") throw listingResult.reason;\n\n      const items = Array.isArray(listingResult.value?.items) ? listingResult.value.items : [];',
    '      if (listingResult.status !== "fulfilled") throw listingResult.reason;\n      window.__elyonSellerState = listingResult.value;\n\n      const items = Array.isArray(listingResult.value?.items) ? listingResult.value.items : [];',
    "runtime seller-state capture marker missing",
  );
  output = replaceRequired(
    output,
    '      draftProducts = enriched.filter((item) => listingStatus(item) === "UNPUBLISHED");',
    '      draftProducts = [];',
    "runtime draft classification marker missing",
  );
  output = replaceRequired(
    output,
    '      message = `${draftProducts.length} eBay-Entwurf${draftProducts.length === 1 ? "" : "e"} · ${activeProducts.length} aktive${activeProducts.length === 1 ? "s" : ""} eBay-Listing${activeProducts.length === 1 ? "" : "s"}.${enrichmentNote}`;',
    '      message = `Seller-Hub-Entwürfe: nicht per öffentlicher eBay API auslesbar · ${activeProducts.length} aktive${activeProducts.length === 1 ? "s" : ""} Seller-Hub-Listing${activeProducts.length === 1 ? "" : "s"} · ${numberValue(listingResult.value?.counts?.inventoryUnpublished)} Inventory-API UNPUBLISHED (separat).${enrichmentNote}`;',
    "runtime listing status message marker missing",
  );

  output = output
    .replaceAll("📝 eBay · UNPUBLISHED", "📝 Seller Hub · Entwürfe")
    .replaceAll(
      "Diese Liste kommt direkt aus der eBay Inventory API. Angezeigt werden ausschließlich eBay-Angebote mit Status UNPUBLISHED. Der Product Master liefert nur zusätzliche Daten wie Lieferant, EK, Gewinn und Marge und bestimmt niemals, ob ein Entwurf existiert.",
      "Seller-Hub-Entwürfe werden von keiner öffentlichen eBay-Read-API als Liste bereitgestellt. Deshalb zeigt Elyon hier bewusst keinen erfundenen Zähler. UNPUBLISHED Inventory Offers werden separat diagnostisch ausgewiesen und niemals als Seller-Hub-Entwurf gezählt.",
    )
    .replaceAll('<div class="metric"><small>eBay-Entwürfe</small><strong>${draftProducts.length}</strong></div>', '<div class="metric"><small>Seller-Hub-Entwürfe</small><strong>—</strong></div>')
    .replaceAll('<div class="metric"><small>Mit Product-Master-Match</small><strong>${matchedCount}</strong></div>\n            <div class="metric"><small>Ohne Match</small><strong>${unmatchedCount}</strong></div>\n            <div class="metric"><small>Datenquelle</small><strong style="font-size:14px">eBay Inventory API</strong></div>', '<div class="metric"><small>API-Lesestatus</small><strong style="font-size:14px">Nicht verfügbar</strong></div>\n            <div class="metric"><small>Inventory API · UNPUBLISHED</small><strong>${numberValue(window.__elyonSellerState?.counts?.inventoryUnpublished)}</strong></div>\n            <div class="metric"><small>Datenquelle</small><strong style="font-size:14px">Seller Hub / eBay API</strong></div>')
    .replaceAll("Echte eBay-Entwürfe werden geladen …", "Seller-Hub-Status wird geladen …")
    .replaceAll("eBay meldet aktuell 0 UNPUBLISHED-Angebote. Deshalb zeigt Elyon 0 Listing-Entwürfe.", "Die öffentliche eBay API stellt keine Seller-Hub-Draft-Liste bereit. Der separate UNPUBLISHED-Offer-Zähler ist kein Seller-Hub-Draft-Zähler.")
    .replaceAll("🟢 eBay · PUBLISHED", "🟢 Seller Hub · Aktiv")
    .replaceAll(
      "Diese Liste kommt direkt aus der eBay Inventory API. Angezeigt werden ausschließlich eBay-Angebote mit Status PUBLISHED. Product-Master-Daten werden nur ergänzend zugespielt; auch eBay-Angebote ohne Match bleiben sichtbar.",
      "Aktive Listings werden aus GetMyeBaySelling/ActiveList des authentifizierten eBay-Kontos geladen. Dadurch bildet Elyon auch Listings ab, die nicht über die Inventory API erstellt wurden. Product Master dient nur zur Anreicherung.",
    )
    .replaceAll('<div class="metric"><small>Datenquelle</small><strong style="font-size:14px">eBay Inventory API</strong></div>', '<div class="metric"><small>Datenquelle</small><strong style="font-size:14px">eBay Trading API</strong></div>')
    .replaceAll("Aktive eBay-Listings werden geladen …", "Aktive Seller-Hub-Listings werden geladen …")
    .replaceAll("eBay meldet aktuell 0 PUBLISHED-Angebote. Deshalb zeigt Elyon 0 aktive Listings.", "Seller Hub meldet aktuell 0 aktive Listings.");

  return output;
}

export function transformSellerDashboard(source) {
  let output = String(source || "");
  output = replaceRequired(
    output,
    'getJson("/api/ebay/listings?environment=production")',
    'getJson("/api/ebay/seller-state?environment=production")',
    "dashboard seller-state endpoint marker missing",
  );
  output = output
    .replaceAll(
      "Company OS liefert geprüfte Produkte und Listing-Pakete. Entwürfe und aktive Listings kommen direkt aus der eBay Inventory API; der Product Master dient dort nur zur Anreicherung. Bestellungen und Umsatz stammen aus der eBay Orders API.",
      "Company OS liefert geprüfte Produkte und Listing-Pakete. Aktive Listings kommen aus der eBay Trading API und entsprechen der ActiveList des authentifizierten Verkäuferkontos. Seller-Hub-Entwürfe sind über keine öffentliche eBay-Read-API als Liste verfügbar; UNPUBLISHED Inventory Offers werden deshalb separat behandelt.",
    )
    .replaceAll('<article class="sd-kpi ${metrics.draftProducts.length ? "warn" : ""}"><small>Entwürfe</small><strong>${count(metrics.draftProducts.length)}</strong><span>eBay Inventory API · UNPUBLISHED</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="draftsTab">Entwürfe öffnen</button></article>', '<article class="sd-kpi"><small>Seller-Hub-Entwürfe</small><strong>—</strong><span>Nicht per öffentlicher eBay API auslesbar</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="draftsTab">Status öffnen</button></article>')
    .replaceAll('<article class="sd-kpi ${metrics.liveProducts.length ? "good" : ""}"><small>Aktive Listings</small><strong>${count(metrics.liveProducts.length)}</strong><span>eBay Inventory API · PUBLISHED</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="activeListingsTab">Aktive öffnen</button></article>', '<article class="sd-kpi ${metrics.liveProducts.length ? "good" : ""}"><small>Aktive Listings</small><strong>${count(metrics.liveProducts.length)}</strong><span>Seller Hub · Trading API ActiveList</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="activeListingsTab">Aktive öffnen</button></article>')
    .replaceAll('<div class="sd-step"><strong>${count(metrics.draftProducts.length)}</strong><span>eBay UNPUBLISHED</span></div>', '<div class="sd-step"><strong>—</strong><span>Seller-Hub-Entwürfe</span></div>')
    .replaceAll('<div class="sd-step"><strong>${count(metrics.liveProducts.length)}</strong><span>eBay PUBLISHED</span></div>', '<div class="sd-step"><strong>${count(metrics.liveProducts.length)}</strong><span>Seller Hub aktiv</span></div>')
    .replaceAll("Product Master für Vorbereitung, eBay als Quelle für den echten Listing-Bestand.", "Product Master für Vorbereitung; Seller Hub/Trading API für den echten aktiven Listing-Bestand.")
    .replaceAll("eBay Inventory API · Listings", "eBay Seller Hub · aktive Listings");
  return output;
}
