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
    '      if (listingResult.status !== "fulfilled") throw listingResult.reason;\n      window.__elyonSellerState = listingResult.value;\n      window.__elyonSellerStateLoadedAt = Date.now();\n\n      const items = Array.isArray(listingResult.value?.items) ? listingResult.value.items : [];',
    "runtime seller-state capture marker missing",
  );
  output = replaceRequired(
    output,
    '      message = `${draftProducts.length} eBay-Entwurf${draftProducts.length === 1 ? "" : "e"} · ${activeProducts.length} aktive${activeProducts.length === 1 ? "s" : ""} eBay-Listing${activeProducts.length === 1 ? "" : "s"}.${enrichmentNote}`;',
    '      const draftStatus = listingResult.value?.draftsAvailable === false\n        ? `Entwürfe konnten nicht geprüft werden: ${text(listingResult.value?.draftError) || "eBay-Status nicht verfügbar"}`\n        : `${draftProducts.length} Entwurf${draftProducts.length === 1 ? "" : "e"}`;\n      message = `${draftStatus} · ${activeProducts.length} aktive${activeProducts.length === 1 ? "s" : ""} eBay-Listing${activeProducts.length === 1 ? "" : "s"}.${enrichmentNote}`;',
    "runtime listing status message marker missing",
  );
  output = replaceRequired(
    output,
    ': \'<div class="elyon-listings-empty">eBay meldet aktuell 0 UNPUBLISHED-Angebote. Deshalb zeigt Elyon 0 Listing-Entwürfe.</div>\'',
    ': window.__elyonSellerState?.draftsAvailable === false || message.startsWith("Fehler:")\n' +
    '              ? \'<div class="elyon-listings-empty">Entwurfsbestand derzeit nicht prüfbar. Bitte die Verbindung prüfen und neu laden.</div>\'\n' +
    '              : \'<div class="elyon-listings-empty">eBay meldet aktuell 0 UNPUBLISHED-Angebote. Deshalb zeigt Elyon 0 Listing-Entwürfe.</div>\'',
    "runtime draft empty-state marker missing",
  );

  output = output
    .replaceAll("📝 eBay · UNPUBLISHED", "📝 eBay · Entwürfe")
    .replaceAll(
      "Diese Liste kommt direkt aus der eBay Inventory API. Angezeigt werden ausschließlich eBay-Angebote mit Status UNPUBLISHED. Der Product Master liefert nur zusätzliche Daten wie Lieferant, EK, Gewinn und Marge und bestimmt niemals, ob ein Entwurf existiert.",
      "Hier siehst du die von Elyon erstellten eBay-Entwürfe. Wenn keine vorhanden sind, steht der Zähler auf 0. Product Master ergänzt nur Lieferant, EK, Gewinn und Marge.",
    )
    .replaceAll('<div class="metric"><small>eBay-Entwürfe</small><strong>${draftProducts.length}</strong></div>', '<div class="metric"><small>Entwürfe</small><strong>${window.__elyonSellerState?.draftsAvailable === false ? "!" : draftProducts.length}</strong></div>')
    .replaceAll('<div class="metric"><small>Datenquelle</small><strong style="font-size:14px">eBay Inventory API</strong></div>', '<div class="metric"><small>Datenquelle</small><strong style="font-size:14px">Elyon + eBay</strong></div>')
    .replaceAll("Echte eBay-Entwürfe werden geladen …", "eBay-Entwürfe werden geladen …")
    .replaceAll("eBay meldet aktuell 0 UNPUBLISHED-Angebote. Deshalb zeigt Elyon 0 Listing-Entwürfe.", "Aktuell sind keine von Elyon erstellten eBay-Entwürfe vorhanden.")
    .replaceAll("🟢 eBay · PUBLISHED", "🟢 eBay · Aktiv")
    .replaceAll(
      "Diese Liste kommt direkt aus der eBay Inventory API. Angezeigt werden ausschließlich eBay-Angebote mit Status PUBLISHED. Product-Master-Daten werden nur ergänzend zugespielt; auch eBay-Angebote ohne Match bleiben sichtbar.",
      "Aktive Listings werden direkt aus dem authentifizierten eBay-Verkäuferkonto geladen. Product Master dient nur zur Anreicherung.",
    )
    .replaceAll("Aktive eBay-Listings werden geladen …", "Aktive eBay-Listings werden geladen …")
    .replaceAll("eBay meldet aktuell 0 PUBLISHED-Angebote. Deshalb zeigt Elyon 0 aktive Listings.", "Aktuell sind keine aktiven eBay-Listings vorhanden.");


  // Keep two different eBay states separate: Inventory API offers and Seller Hub
  // feed tasks. Neither is proof that a normal Seller Hub draft is currently visible.
  output = replaceRequired(
    output,
    '    const unmatchedCount = draftProducts.length - matchedCount;',
    '    const unmatchedCount = draftProducts.length - matchedCount;\n' +
    '    const apiOfferCount = draftProducts.filter((item) => item?.source === "elyon_inventory_draft").length;\n' +
    '    const processedFeedCount = draftProducts.filter((item) => item?.source === "elyon_seller_hub_feed" && item?.feedVerification === "feed_processed_not_live_checked").length;',
    "draft evidence counters missing",
  );
  output = replaceRequired(
    output,
    '<div class="metric"><small>Entwürfe</small><strong>${window.__elyonSellerState?.draftsAvailable === false ? "!" : draftProducts.length}</strong></div>',
    '<div class="metric"><small>eBay-API-Angebote</small><strong>${window.__elyonSellerState?.draftsAvailable === false ? "!" : apiOfferCount}</strong></div>',
    "draft API count marker missing",
  );
  output = replaceRequired(
    output,
    '<div class="metric"><small>Ohne Match</small><strong>${unmatchedCount}</strong></div>',
    '<div class="metric"><small>Verarbeitete Feed-Aufträge</small><strong>${window.__elyonSellerState?.draftsAvailable === false ? "!" : processedFeedCount}</strong></div>',
    "draft feed count marker missing",
  );
  output = replaceRequired(
    output,
    '<div class="metric"><small>Datenquelle</small><strong style="font-size:14px">Elyon + eBay</strong></div>',
    '<div class="metric"><small>Seller-Hub-Entwürfe</small><strong style="font-size:14px">Nicht live prüfbar</strong></div>',
    "Seller Hub verification label missing",
  );
  output = replaceRequired(
    output,
    '    const status = listingStatus(product);',
    '    const status = listingStatus(product);\n' +
    '    const draftEvidence = mode !== "draft" ? "" : product?.source === "elyon_seller_hub_feed"\n' +
    '      ? "Feed verarbeitet · Seller Hub nicht live bestätigt"\n' +
    '      : product?.source === "elyon_inventory_draft"\n' +
    '        ? "eBay-API-Angebot · nicht veröffentlicht"\n' +
    '        : "Entwurfseintrag · Quelle prüfen";',
    "draft card evidence marker missing",
  );
  output = replaceRequired(
    output,
    '<span class="elyon-listing-pill ${mode === "active" ? "live" : ""}">${escapeHtml(status)}</span>',
    '<span class="elyon-listing-pill ${mode === "active" ? "live" : ""}">${escapeHtml(status)}</span>\n' +
    '            ${mode === "draft" ? `<span class="elyon-listing-pill">${escapeHtml(draftEvidence)}</span>` : ""}',
    "draft evidence pill marker missing",
  );
  output = replaceRequired(
    output,
    '        : `${draftProducts.length} Entwurf${draftProducts.length === 1 ? "" : "e"}`;',
    '        : `${draftProducts.filter((item) => item?.source === "elyon_inventory_draft").length} unveröffentlichte API-Angebote · ${draftProducts.filter((item) => item?.source === "elyon_seller_hub_feed").length} verarbeitete Feed-Aufträge (Seller Hub nicht live geprüft)`;',
    "draft message count marker missing",
  );
  output = output
    .replaceAll('📝 eBay · Entwürfe', '📝 Elyon · Unveröffentlicht')
    .replaceAll('<h2>Listing-Entwürfe</h2>', '<h2>Unveröffentlichte Angebote & Feed-Aufträge</h2>')
    .replaceAll(
      'Hier siehst du die von Elyon erstellten eBay-Entwürfe. Wenn keine vorhanden sind, steht der Zähler auf 0. Product Master ergänzt nur Lieferant, EK, Gewinn und Marge.',
      'Die eBay Inventory API und verarbeitete Seller-Hub-Feed-Aufträge sind getrennte Quellen. Keiner dieser Einträge beweist einen aktuell sichtbaren Seller-Hub-Entwurf. Ein Product-Master-Match bestätigt nur die Zuordnung zu Company OS.',
    )
    .replaceAll(
      'Feed-Entwürfe aus dem Amazon Importer werden nach bestätigter Verarbeitung zusätzlich angezeigt. Ihr aktueller Bestand im eBay Seller Hub kann über die Inventory API nicht live geprüft werden. Product-Master-Zuordnung und Company-OS-Gewinnprognosen werden bei jedem Öffnen oder Klick auf „Neu laden“ aus der kanonischen Quelle aktualisiert; unbestätigte Kosten bleiben offen.',
      'Ein verarbeiteter Amazon-Importer-Feed ist kein bestätigter Seller-Hub-Entwurf. Unveröffentlichte Inventory-API-Angebote können im Seller Hub fehlen. Die Seller-Hub-Entwürfe sind hier nicht live abrufbar. Product-Master-Daten werden nur ergänzend geladen.',
    )
    .replaceAll(
      'Aktuell sind keine von Elyon erstellten eBay-Entwürfe vorhanden.',
      'Aktuell sind weder unveröffentlichte API-Angebote noch verarbeitete Feed-Aufträge vorhanden.',
    )
    .replaceAll(
      'Feed verarbeitet · Seller Hub bitte prüfen',
      'Feed verarbeitet · Seller Hub nicht live bestätigt',
    );

  return output;
}

export function transformSellerDashboard(source) {
  let output = String(source || "");
  output = replaceRequired(
    output,
    'export const FOCUS_REFRESH_COOLDOWN_MS = 60 * 1000;',
    'export const FOCUS_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;',
    "dashboard focus cooldown marker missing",
  );
  output = replaceRequired(
    output,
    'getJson("/api/ebay/listings?environment=production")',
    'getSellerStateCached()',
    "dashboard seller-state endpoint marker missing",
  );
  output = replaceRequired(
    output,
    'function isDashboardVisible() {\n  return typeof document === "undefined" || document.visibilityState !== "hidden";\n}',
    `async function getSellerStateCached() {
  if (typeof window !== "undefined") {
    const cached = window.__elyonSellerState;
    const loadedAt = Number(window.__elyonSellerStateLoadedAt) || 0;
    if (cached && loadedAt && Date.now() - loadedAt < FOCUS_REFRESH_COOLDOWN_MS) return cached;
  }
  const data = await getJson("/api/ebay/seller-state?environment=production");
  if (typeof window !== "undefined") {
    window.__elyonSellerState = data;
    window.__elyonSellerStateLoadedAt = Date.now();
  }
  return data;
}

function isDashboardVisible() {
  if (typeof document === "undefined") return true;
  if (document.visibilityState === "hidden") return false;
  const dashboard = document.getElementById("dashboardTab");
  if (dashboard?.classList.contains("active")) return true;
  return document.getElementById("mainMenu")?.value === "dashboardTab";
}`,
    "dashboard active visibility marker missing",
  );
  output = output
    .replaceAll(
      "Company OS liefert geprüfte Produkte und Listing-Pakete. Entwürfe und aktive Listings kommen direkt aus der eBay Inventory API; der Product Master dient dort nur zur Anreicherung. Bestellungen und Umsatz stammen aus der eBay Orders API.",
      "Company OS liefert geprüfte Produkte und Listing-Pakete. Elyon zeigt eigene noch unveröffentlichte eBay-Entwürfe und die aktiven Listings des verbundenen eBay-Kontos. Product Master dient nur zur Anreicherung.",
    )
    .replaceAll('<article class="sd-kpi ${metrics.draftProducts.length ? "warn" : ""}"><small>Entwürfe</small><strong>${count(metrics.draftProducts.length)}</strong><span>eBay Inventory API · UNPUBLISHED</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="draftsTab">Entwürfe öffnen</button></article>', '<article class="sd-kpi ${metrics.draftProducts.length ? "warn" : ""}"><small>Entwürfe</small><strong>${runtime.listingPayload?.draftsAvailable === false ? "!" : count(metrics.draftProducts.length)}</strong><span>Von Elyon erstellte eBay-Entwürfe</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="draftsTab">Entwürfe öffnen</button></article>')
    .replaceAll('<article class="sd-kpi ${metrics.liveProducts.length ? "good" : ""}"><small>Aktive Listings</small><strong>${count(metrics.liveProducts.length)}</strong><span>eBay Inventory API · PUBLISHED</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="activeListingsTab">Aktive öffnen</button></article>', '<article class="sd-kpi ${metrics.liveProducts.length ? "good" : ""}"><small>Aktive Listings</small><strong>${count(metrics.liveProducts.length)}</strong><span>Direkt aus dem eBay-Verkäuferkonto</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="activeListingsTab">Aktive öffnen</button></article>')
    .replaceAll('<div class="sd-step"><strong>${count(metrics.draftProducts.length)}</strong><span>eBay UNPUBLISHED</span></div>', '<div class="sd-step"><strong>${runtime.listingPayload?.draftsAvailable === false ? "!" : count(metrics.draftProducts.length)}</strong><span>Entwürfe</span></div>')
    .replaceAll('<div class="sd-step"><strong>${count(metrics.liveProducts.length)}</strong><span>eBay PUBLISHED</span></div>', '<div class="sd-step"><strong>${count(metrics.liveProducts.length)}</strong><span>eBay aktiv</span></div>')
    .replaceAll("Product Master für Vorbereitung, eBay als Quelle für den echten Listing-Bestand.", "Product Master für Vorbereitung; Elyon-Entwürfe und eBay-Aktivbestand für den Listing-Status.")
    .replaceAll("eBay Inventory API · Listings", "eBay Listings");

  output = output
    .replaceAll('<small>Entwürfe</small><strong>${runtime.listingPayload?.draftsAvailable === false ? "!" : count(metrics.draftProducts.length)}</strong>', '<small>Elyon-Entwurfseinträge</small><strong>${runtime.listingPayload?.draftsAvailable === false ? "!" : count(metrics.draftProducts.length)}</strong>')
    .replaceAll('<span>Von Elyon erstellte eBay-Entwürfe</span>', '<span>API-Angebote + verarbeitete Feeds; Seller Hub nicht live geprüft</span>');
  return output;
}
