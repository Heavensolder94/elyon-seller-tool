(() => {
  'use strict';

  const ROOT_ID = 'elyonOrderInvoicePanel';
  const META_KEY = 'elyon_order_invoice_meta_v1';
  const OPS_KEY = 'elyon_order_operations_v1';
  const SETTINGS_KEY = 'elyon_finance_v1';
  const STATUS_OPTIONS = [
    ['NEW', 'Neu'],
    ['PAID', 'Bezahlt'],
    ['TO_BE_SHIPPED', 'Zu versenden'],
    ['SHIPPED', 'Versendet'],
    ['COMPLETED', 'Abgeschlossen'],
    ['CANCELLED', 'Storniert'],
  ];
  const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  let orders = [];
  let loading = false;
  let mounted = false;
  let errorMessage = '';
  let serverLoaded = false;
  let serverSyncBusy = false;
  let serverState = { orderOperations: {}, invoiceMeta: {}, inventory: {}, returns: {}, safety: {} };

  const text = (value) => String(value == null ? '' : value).trim();
  const esc = (value) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = (value, currency) => {
    try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(num(value)); }
    catch { return num(value).toFixed(2) + ' ' + (currency || 'EUR'); }
  };
  const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; } };
  const readMeta = () => serverLoaded && Object.keys(serverState.invoiceMeta || {}).length ? serverState.invoiceMeta : readJson(META_KEY, {});
  const readOps = () => serverLoaded && Object.keys(serverState.orderOperations || {}).length ? serverState.orderOperations : readJson(OPS_KEY, {});
  const saveJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { notify(error.message, 'Speicherfehler'); }
    if (key === META_KEY) serverState.invoiceMeta = value;
    if (key === OPS_KEY) serverState.orderOperations = value;
    persistServerState();
  };
  async function persistServerState() {
    if (!serverLoaded || serverSyncBusy) return;
    serverSyncBusy = true;
    try {
      const response = await fetch('/api/finance?action=save', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ state: {
          orderOperations: serverState.orderOperations || {},
          invoiceMeta: serverState.invoiceMeta || {},
          inventory: serverState.inventory || {},
          returns: serverState.returns || {},
          safety: serverState.safety || {},
        }, action: 'seller_order_operations_sync', source: 'seller_order_center' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Finance-Sync HTTP ' + response.status);
      serverState = { ...serverState, ...(data.state || {}) };
    } catch (error) {
      notify('Server-Sync nicht verfügbar: ' + error.message + '. Lokale Sicherung bleibt erhalten.', 'Synchronisierung');
    } finally { serverSyncBusy = false; }
  }
  async function loadServerState() {
    try {
      const response = await fetch('/api/finance?action=load', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Finance-Sync HTTP ' + response.status);
      const incoming = data.state || {};
      serverState = { ...serverState, ...incoming, orderOperations: incoming.orderOperations || {}, invoiceMeta: incoming.invoiceMeta || {}, inventory: incoming.inventory || {}, returns: incoming.returns || {}, safety: incoming.safety || {} };
      serverLoaded = true;
      const hadLocalOps = !Object.keys(serverState.orderOperations).length && Object.keys(readJson(OPS_KEY, {})).length;
      const hadLocalMeta = !Object.keys(serverState.invoiceMeta).length && Object.keys(readJson(META_KEY, {})).length;
      if (hadLocalOps) serverState.orderOperations = readJson(OPS_KEY, {});
      if (hadLocalMeta) serverState.invoiceMeta = readJson(META_KEY, {});
      try { localStorage.setItem(OPS_KEY, JSON.stringify(serverState.orderOperations)); localStorage.setItem(META_KEY, JSON.stringify(serverState.invoiceMeta)); } catch {}
      if (hadLocalOps || hadLocalMeta) persistServerState();
    } catch (error) {
      serverLoaded = false;
      notify('Server-Sync nicht verfügbar. Lokale Sicherung bleibt erhalten.', 'Synchronisierung');
    }
  }
  const settings = () => readJson(SETTINGS_KEY, {}).settings || {};
  const notify = (message, eyebrow) => { if (typeof window.toast === 'function') window.toast(message, eyebrow || 'Bestellzentrale'); };
  const ELYON_SKU_PATTERN = /^ELY-\d{6,}(?:-\d{2,})?$/i;

  function productReferenceFromLine(line) {
    const sku = text(line && line.sku);
    const listingId = text(line && (line.listingId || line.legacyItemId || line.itemId));
    const articleMatch = sku.match(/^ELY-(\d{6,})(?:-\d{2,})?$/i);
    return {
      articleNumber: articleMatch ? `ELY-${articleMatch[1]}`.toUpperCase() : '',
      sku,
      supplierSku: sku && !ELYON_SKU_PATTERN.test(sku) ? sku : '',
      offerId: text(line && (line.offerId || line.offer && line.offer.offerId)),
      listingId,
      productId: text(line && (line.productId || line.companyOsProductId)),
      source: 'ebay_order_product_reference',
    };
  }

  function normalizeOrder(order) {
    const id = text(order && (order.orderId || order.legacyOrderId || order.id));
    const instruction = order && order.fulfillmentStartInstructions && order.fulfillmentStartInstructions[0];
    const ship = instruction && instruction.shippingStep && instruction.shippingStep.shipTo || {};
    const address = ship.contactAddress || {};
    const lines = Array.isArray(order && order.lineItems) ? order.lineItems : [];
    const currency = text(order && order.pricingSummary && order.pricingSummary.total && order.pricingSummary.total.currency || 'EUR');
    const total = num(order && order.pricingSummary && order.pricingSummary.total && order.pricingSummary.total.value) || lines.reduce((sum, line) => sum + num(line && line.lineItemCost && line.lineItemCost.value), 0);
    return {
      id,
      createdAt: order && (order.creationDate || order.lastModifiedDate) || '',
      ebayStatus: text(order && (order.orderFulfillmentStatus || order.orderPaymentStatus) || 'UNKNOWN').toUpperCase(),
      buyerName: text(ship.fullName || order && order.buyer && order.buyer.username),
      address: [address.addressLine1, address.addressLine2, [address.postalCode, address.city].filter(Boolean).join(' '), address.countryCode].filter(Boolean),
      lines: lines.map((line) => ({ itemId: text(line && (line.legacyItemId || line.itemId || line.sku || line.lineItemId || line.title)), productReference: productReferenceFromLine(line), title: text(line && line.title || 'Artikel'), quantity: Math.max(1, num(line && line.quantity)), total: num(line && line.lineItemCost && line.lineItemCost.value), currency })),
      total,
      currency,
    };
  }

  function defaultOperation(order) {
    const paid = order.ebayStatus.includes('PAID');
    const shipped = order.ebayStatus.includes('FULFILLED') || order.ebayStatus.includes('SHIPPED');
    return { status: shipped ? 'SHIPPED' : paid ? 'PAID' : 'NEW', carrier: '', trackingNumber: '', trackingUrl: '', stockQuantity: '', returnStatus: 'NONE', updatedAt: '' };
  }

  function operationFor(order) {
    const ops = readOps();
    return { ...defaultOperation(order), ...(ops[order.id] || {}) };
  }

  function saveOperation(order, data) {
    const ops = readOps();
    ops[order.id] = {
      status: STATUS_OPTIONS.some((item) => item[0] === data.status) ? data.status : 'NEW',
      carrier: text(data.carrier).slice(0, 80),
      trackingNumber: text(data.trackingNumber).slice(0, 120),
      trackingUrl: text(data.trackingUrl).slice(0, 500),
      stockQuantity: text(data.stockQuantity).slice(0, 20),
      returnStatus: ['NONE', 'REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED'].includes(data.returnStatus) ? data.returnStatus : 'NONE',
      updatedAt: new Date().toISOString(),
    };
    saveJson(OPS_KEY, ops);
    const itemId = order.lines[0]?.itemId;
    if (itemId) serverState.inventory = { ...(serverState.inventory || {}), [itemId]: { id: itemId, quantity: Math.max(0, Number(data.stockQuantity || 0)), updatedAt: new Date().toISOString() } };
    if (data.returnStatus && data.returnStatus !== 'NONE') serverState.returns = { ...(serverState.returns || {}), [order.id]: { orderId: order.id, status: data.returnStatus, updatedAt: new Date().toISOString() } };
    persistServerState();
    notify('Bestellstatus und Versanddaten gespeichert. eBay wird dadurch nicht automatisch benachrichtigt.', 'Bestellzentrale');
    render();
  }

  async function loadOrders() {
    if (loading) return;
    loading = true; errorMessage = ''; render();
    try {
      const response = await fetch('/api/ebay?action=orders&environment=production&days=90&status=all', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || data.message || 'HTTP ' + response.status);
      orders = (Array.isArray(data.orders) ? data.orders : []).map(normalizeOrder).filter((order) => order.id);
      notify(orders.length ? orders.length + ' eBay-Bestellung(en) geladen.' : 'Keine eBay-Bestellungen im Zeitraum.');
    } catch (error) {
      orders = []; errorMessage = 'Bestellungen konnten nicht geladen werden: ' + error.message;
    } finally { loading = false; render(); }
  }

  function linesMarkup(order) {
    const lines = order.lines.length ? order.lines : [{ title: 'eBay-Bestellung', quantity: 1, total: order.total, currency: order.currency }];
    return lines.map((line) => '<tr><td>' + esc(line.title) + '</td><td class="num">' + line.quantity + '</td><td class="num">' + money(line.total, line.currency || order.currency) + '</td></tr>').join('');
  }

  const issueBusy = new Set();
  function printInvoice(invoice) {
    if (!invoice?.invoiceNumber || !invoice?.seller?.taxId || invoice.taxMode !== 'small_business') {
      notify('Diese Rechnung hat keinen vollständigen, geprüften Ausstellungsstand.', 'Rechnung');
      return;
    }
    const popup = window.open('', '_blank');
    if (!popup) { notify('Bitte Pop-ups für das Seller Tool erlauben.', 'Rechnung'); return; }
    const s = invoice.seller, b = invoice.buyer;
    const addr = person => [
      person.name, person.addressLine1, person.addressLine2,
      [person.postalCode, person.city].filter(Boolean).join(' '),
      person.country === 'DE' ? 'Deutschland' : person.country
    ].filter(Boolean).map(esc).join('<br>');
    const issuedDate = dateTime.format(new Date(invoice.issuedAt));
    const lineRows = (invoice.lineItems || []).map(line =>
      '<tr><td>' + esc(line.title) + '</td><td class="num">' + esc(line.quantity) + '</td>' +
      '<td class="num">' + money(line.total, 'EUR') + '</td></tr>'
    ).join('');
    const shippingRow = invoice.shipping ? '<tr><td>Versand</td><td class="num">1</td><td class="num">' +
      money(invoice.shipping, 'EUR') + '</td></tr>' : '';
    const discountRow = invoice.discount ? '<tr><td>Rabatt</td><td class="num">1</td><td class="num">−' +
      money(invoice.discount, 'EUR') + '</td></tr>' : '';
    const html = [
      '<!doctype html><html lang="de"><head><meta charset="utf-8">',
      '<title>Rechnung ' + esc(invoice.invoiceNumber) + '</title>',
      '<style>body{font:15px/1.5 Arial,sans-serif;max-width:820px;margin:35px auto;padding:0 25px;color:#172033}',
      'header{display:flex;justify-content:space-between;border-bottom:3px solid #1b6b45;padding-bottom:18px}',
      'h1{margin:0;font-size:29px}h2{font-size:16px}.muted{color:#5b6473;font-size:13px}',
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:26px 0}',
      'table{border-collapse:collapse;width:100%;margin:25px 0}th,td{text-align:left;padding:12px 7px;border-bottom:1px solid #ddd}',
      '.num{text-align:right;white-space:nowrap}.sum{text-align:right;font-size:22px;font-weight:bold;margin:16px 0}',
      '.tax{background:#edf8f0;padding:14px;margin:22px 0;border:1px solid #acd3b8}',
      '.print{margin:0 0 18px;padding:10px 14px;background:#176a3d;color:#fff;border:0;border-radius:5px}',
      '@page{size:A4;margin:17mm}@media print{body{padding:0;margin:0}.print{display:none}}',
      '</style></head><body>',
      '<button type="button" class="print" onclick="window.print()">Drucken / als PDF speichern</button>',
      '<header><div><h1>' + esc(s.brand || 'ELYON') + '</h1><p><strong>' + esc(s.name) + '</strong><br>' +
      esc(s.addressLine1) + '<br>' + esc(s.postalCode) + ' ' + esc(s.city) +
      '<br>Deutschland<br>Steuernummer / steuerliche ID: ' + esc(s.taxId) + '</p></div>',
      '<div style="text-align:right"><h2>Rechnung</h2><strong>' + esc(invoice.invoiceNumber) +
      '</strong><br>Ausgestellt am: ' + esc(issuedDate) + '</div></header>',
      '<div class="grid"><section><h2>Rechnungsempfänger</h2>' + addr(b) + '</section>',
      '<section><h2>Bestellung</h2>eBay: ' + esc(invoice.orderId) +
      '<br>Bestelldatum: ' + esc(dateTime.format(new Date(invoice.orderedAt))) + '</section></div>',
      '<h2>Gelieferte Waren / bestellte Artikel</h2>',
      '<table><thead><tr><th>Bezeichnung</th><th class="num">Menge</th><th class="num">Betrag</th></tr></thead><tbody>',
      lineRows + shippingRow + discountRow,
      '</tbody></table><div class="sum">Gesamtbetrag: ' + money(invoice.total, 'EUR') + '</div>',
      '<div class="tax">' + esc(invoice.note) + '</div>',
      '<p class="muted">Ausgestellt auf Grundlage einer geprüften eBay-Bestellung. Keine separate Umsatzsteuer.</p>',
      '</body></html>'
    ].join('');
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }
  function openExistingInvoice(meta) {
    if (!meta?.immutable || !meta.invoice) {
      notify('Ältere Rechnungsdaten gefunden. Bitte im bisherigen Rechnungsarchiv prüfen. Keine neue Rechnung erzeugt.', 'Historischer Beleg');
      return;
    }
    printInvoice(meta.invoice);
  }
  async function createInvoice(order) {
    const meta = readMeta();
    if (meta[order.id]) return openExistingInvoice(meta[order.id]);
    if (issueBusy.has(order.id)) return;
    if (!window.confirm(
      'Rechnung für eBay-Bestellung ' + order.id +
      ' jetzt verbindlich ausstellen? ELYON prüft die Pflichtfelder und sperrt den Rechnungsstand. Keine Kunden-E-Mail wird gesendet.'
    )) return;
    issueBusy.add(order.id);
    render();
    try {
      const response = await fetch('/api/finance?action=issue-kleinunternehmer-invoice', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.invoice) throw new Error(
        data.message || data.error || 'Rechnung wurde nicht ausgestellt (HTTP ' + response.status + ')'
      );
      serverState.invoiceMeta = {
        ...readJson(META_KEY, {}),
        ...(serverState.invoiceMeta || {}),
        [order.id]: {
          immutable: true, status: 'issued', orderId: order.id,
          invoiceNumber: data.invoiceNumber, invoice: data.invoice,
          snapshotHash: data.snapshotHash || ''
        }
      };
      serverLoaded = true;
      try { localStorage.setItem(META_KEY, JSON.stringify(serverState.invoiceMeta)); } catch {}
      printInvoice(data.invoice);
      notify('Rechnung ' + data.invoiceNumber + (data.existing ? ' erneut geöffnet.' : ' ausgestellt und serverseitig gesichert.') +
        ' Versand an den Kunden erfolgt nicht automatisch.', 'Rechnung');
    } catch (error) {
      notify('Keine Rechnung ausgestellt: ' + error.message, 'Pflichtfeldprüfung');
      window.alert('Rechnung blockiert:\n' + error.message +
        '\n\nVerkäuferdaten und Kleinunternehmerstatus bitte unter Finanzen → Einstellungen prüfen.');
    } finally {
      issueBusy.delete(order.id);
      render();
    }
  }

  function statusLabel(value) { const hit = STATUS_OPTIONS.find((item) => item[0] === value); return hit ? hit[1] : value; }

  function styles() {
    if (document.getElementById('elyonOrderInvoiceStyles')) return;
    const style = document.createElement('style'); style.id = 'elyonOrderInvoiceStyles';
    style.textContent = '#' + ROOT_ID + '{margin:18px 0}.eoi-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.eoi-head h3{margin:0 0 6px}.eoi-muted{color:#94a3b8;font-size:12px}.eoi-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:14px}.eoi-card{padding:12px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.5)}.eoi-card strong{display:block;font-size:18px}.eoi-table{width:100%;border-collapse:collapse;margin-top:14px}.eoi-table th,.eoi-table td{padding:10px 8px;text-align:left;border-bottom:1px solid rgba(148,163,184,.18);vertical-align:top}.eoi-table th{color:#94a3b8;font-size:11px;text-transform:uppercase}.eoi-btn{border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.65);color:inherit;border-radius:10px;padding:8px 11px;cursor:pointer}.eoi-btn.primary{background:#2563eb;border-color:#2563eb}.eoi-status{font-size:11px;color:#86efac}.eoi-error{color:#fecaca;padding:10px;border-radius:10px;background:rgba(127,29,29,.24)}.eoi-controls{display:grid;grid-template-columns:140px 130px minmax(140px,1fr) minmax(160px,1fr) 90px 130px auto;gap:7px;align-items:center}.eoi-controls select,.eoi-controls input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.25);background:#0f172a;color:inherit;border-radius:8px;padding:7px}.eoi-total{font-size:12px;color:#86efac}.eoi-note{margin-top:10px;color:#cbd5e1;font-size:12px}@media(max-width:800px){.eoi-controls{grid-template-columns:1fr 1fr}.eoi-controls .eoi-save{grid-column:span 2}}';
    document.head.appendChild(style);
  }

  function render(error) {
    if (!mounted) return;
    const root = document.getElementById(ROOT_ID); if (!root) return;
    const meta = readMeta(); const ops = readOps();
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    const count = (status) => orders.filter((order) => operationFor(order).status === status).length;
    let html = '<div class="eoi-head"><div><h3>Bestellzentrale · Rechnung · Versand</h3><div class="eoi-muted">eBay-Bestellungen, interne Statusführung, Tracking und Rechnungsdruck in einem Ablauf.</div></div><button type="button" class="eoi-btn primary" data-eoi-load>' + (loading ? 'Lade…' : 'Bestellungen laden') + '</button></div>';
    html += '<div class="eoi-summary"><div class="eoi-card"><span class="eoi-muted">Bestellungen</span><strong>' + orders.length + '</strong></div><div class="eoi-card"><span class="eoi-muted">Offen</span><strong>' + (count('NEW') + count('PAID') + count('TO_BE_SHIPPED')) + '</strong></div><div class="eoi-card"><span class="eoi-muted">Versendet</span><strong>' + count('SHIPPED') + '</strong></div><div class="eoi-card"><span class="eoi-muted">Umsatz</span><strong>' + money(total, 'EUR') + '</strong><span class="eoi-muted">Kosten/Gewinn noch nicht zugeordnet</span></div></div>';
    if (error || errorMessage) html += '<div class="eoi-error">' + esc(error || errorMessage) + '</div>';
    const archived = Object.values(meta).filter(entry => entry?.immutable === true && entry.invoice);
    if (archived.length) {
      html += '<div class="eoi-note" style="margin-top:15px"><strong>Ausgestellte Rechnungen (serverseitige Momentaufnahme)</strong></div>';
      html += '<div style="overflow:auto"><table class="eoi-table"><thead><tr><th>Rechnung</th><th>eBay-Bestellung</th><th>Betrag</th><th>Dokument</th></tr></thead><tbody>' +
        archived.sort((a,b)=>String(b.invoice?.issuedAt||'').localeCompare(String(a.invoice?.issuedAt||'')))
          .map(entry=>'<tr><td>' + esc(entry.invoiceNumber) + '</td><td>' + esc(entry.invoice.orderId) +
            '</td><td>' + money(entry.invoice.total,'EUR') + '</td><td><button type="button" class="eoi-btn" data-eoi-archive="' +
            esc(entry.invoice.orderId) + '">Rechnung öffnen / PDF</button></td></tr>').join('') + '</tbody></table></div>';
    }
    const legacyCount = Object.values(meta).filter(entry => entry && !entry.immutable).length;
    if (legacyCount) html += '<div class="eoi-error" style="margin-top:10px">' +
      legacyCount + ' frühere Rechnungseinträge erkannt. Nicht erneut ausstellen; historische Belege manuell abgleichen.</div>';
    if (!orders.length) html += '<div class="eoi-muted" style="margin-top:14px">Noch keine Bestellungen geladen.</div>';
    else {
      html += '<div style="overflow:auto"><table class="eoi-table"><thead><tr><th>Bestellung</th><th>eBay</th><th>Betrag</th><th>Prozess & Versand</th><th>Rechnung</th></tr></thead><tbody>';
      html += orders.map((order) => {
        const invoice = meta[order.id]; const op = operationFor(order);
        const options = STATUS_OPTIONS.map((item) => '<option value="' + item[0] + '"' + (item[0] === op.status ? ' selected' : '') + '>' + item[1] + '</option>').join('');
        return '<tr><td><strong>' + esc(order.id) + '</strong><div class="eoi-muted">' + esc(order.buyerName || 'Käuferdaten nicht übermittelt') + '</div></td><td>' + esc(order.ebayStatus) + '</td><td>' + money(order.total, order.currency) + '</td><td><div class="eoi-controls"><select data-eoi-status="' + esc(order.id) + '">' + options + '</select><input data-eoi-carrier="' + esc(order.id) + '" placeholder="Versanddienst" value="' + esc(op.carrier) + '"><input data-eoi-tracking="' + esc(order.id) + '" placeholder="Trackingnummer" value="' + esc(op.trackingNumber) + '"><input data-eoi-url="' + esc(order.id) + '" placeholder="Tracking-URL (optional)" value="' + esc(op.trackingUrl) + '"><input data-eoi-stock="' + esc(order.id) + '" placeholder="Bestand" value="' + esc(op.stockQuantity || (serverState.inventory?.[order.lines[0]?.itemId]?.quantity ?? '')) + '"><select data-eoi-return="' + esc(order.id) + '"><option value="NONE"' + (op.returnStatus === "NONE" ? " selected" : "") + '>Keine Retoure</option><option value="REQUESTED"' + (op.returnStatus === "REQUESTED" ? " selected" : "") + '>Angefragt</option><option value="APPROVED"' + (op.returnStatus === "APPROVED" ? " selected" : "") + '>Genehmigt</option><option value="RECEIVED"' + (op.returnStatus === "RECEIVED" ? " selected" : "") + '>Eingegangen</option><option value="REFUNDED"' + (op.returnStatus === "REFUNDED" ? " selected" : "") + '>Erstattet</option></select><button type="button" class="eoi-btn eoi-save" data-eoi-save="' + esc(order.id) + '">Speichern</button></div><div class="eoi-note">' + (op.updatedAt ? 'Zuletzt gespeichert: ' + esc(dateTime.format(new Date(op.updatedAt))) : 'Noch nicht intern erfasst') + '</div></td><td>' + (invoice ? '<span class="eoi-status">' + esc(invoice.invoiceNumber) + '</span><br>' : '') + '<button type="button" class="eoi-btn" data-eoi-invoice="' + esc(order.id) + '">' + (issueBusy.has(order.id) ? 'Wird geprüft…' : invoice ? (invoice.immutable ? 'Rechnung öffnen' : 'Altrechnung prüfen') : 'Rechnung ausstellen') + '</button></td></tr>';
      }).join('');
      html += '</tbody></table></div><div class="eoi-note">Die Versanddaten werden im Seller Tool gespeichert. Es wird keine Bestellung ausgelöst und keine eBay-Nachricht automatisch versendet.</div>';
    }
    root.innerHTML = html;
  }

  function mount() {
    const tab = document.getElementById('financeTab'); if (!tab) return;
    styles();
    let root = document.getElementById(ROOT_ID);
    if (!root) { root = document.createElement('section'); root.id = ROOT_ID; root.className = 'ef-panel'; tab.appendChild(root); }
    mounted = true; render();
    if (!serverLoaded) loadServerState().then(() => render());
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest && event.target.closest('[data-eoi-load]')) return loadOrders();
    const archivedButton = event.target.closest && event.target.closest('[data-eoi-archive]');
    if (archivedButton) { openExistingInvoice(readMeta()[archivedButton.dataset.eoiArchive]); return; }
    const invoiceButton = event.target.closest && event.target.closest('[data-eoi-invoice]');
    if (invoiceButton) { const order = orders.find((item) => item.id === invoiceButton.dataset.eoiInvoice); if (order) createInvoice(order); return; }
    const saveButton = event.target.closest && event.target.closest('[data-eoi-save]');
    if (saveButton) {
      const id = saveButton.dataset.eoiSave; const order = orders.find((item) => item.id === id);
      if (!order) return;
      const root = document.getElementById(ROOT_ID);
      saveOperation(order, {
        status: root.querySelector('[data-eoi-status="' + CSS.escape(id) + '"]')?.value,
        carrier: root.querySelector('[data-eoi-carrier="' + CSS.escape(id) + '"]')?.value,
        trackingNumber: root.querySelector('[data-eoi-tracking="' + CSS.escape(id) + '"]')?.value,
        trackingUrl: root.querySelector('[data-eoi-url="' + CSS.escape(id) + '"]')?.value,
        stockQuantity: root.querySelector('[data-eoi-stock="' + CSS.escape(id) + '"]')?.value,
        returnStatus: root.querySelector('[data-eoi-return="' + CSS.escape(id) + '"]')?.value,
      });
    }
  });

  window.ElyonOrderInvoices = { mount, load: loadOrders, create: createInvoice };
})();
