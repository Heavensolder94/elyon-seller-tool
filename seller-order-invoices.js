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
      if (!Object.keys(serverState.orderOperations).length) serverState.orderOperations = readJson(OPS_KEY, {});
      if (!Object.keys(serverState.invoiceMeta).length) serverState.invoiceMeta = readJson(META_KEY, {});
      try { localStorage.setItem(OPS_KEY, JSON.stringify(serverState.orderOperations)); localStorage.setItem(META_KEY, JSON.stringify(serverState.invoiceMeta)); } catch {}
    } catch (error) {
      serverLoaded = false;
      notify('Server-Sync nicht verfügbar. Lokale Sicherung bleibt erhalten.', 'Synchronisierung');
    }
  }
  const settings = () => readJson(SETTINGS_KEY, {}).settings || {};
  const notify = (message, eyebrow) => { if (typeof window.toast === 'function') window.toast(message, eyebrow || 'Bestellzentrale'); };

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
      lines: lines.map((line) => ({ title: text(line && line.title || 'Artikel'), quantity: Math.max(1, num(line && line.quantity)), total: num(line && line.lineItemCost && line.lineItemCost.value), currency })),
      total,
      currency,
    };
  }

  function defaultOperation(order) {
    const paid = order.ebayStatus.includes('PAID');
    const shipped = order.ebayStatus.includes('FULFILLED') || order.ebayStatus.includes('SHIPPED');
    return { status: shipped ? 'SHIPPED' : paid ? 'PAID' : 'NEW', carrier: '', trackingNumber: '', trackingUrl: '', updatedAt: '' };
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
      updatedAt: new Date().toISOString(),
    };
    saveJson(OPS_KEY, ops);
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

  function invoiceNumber(meta) {
    const rawPrefix = text(settings().invoicePrefix || 'ELYON').replace(/[^A-Za-z0-9_-]/g, '');
    const prefix = rawPrefix || 'ELYON';
    const used = Object.values(meta).map((item) => { const match = String(item && item.invoiceNumber || '').match(/(\\d+)$/); return num(match && match[1]); }).filter(Boolean);
    const configured = Math.max(1, num(settings().nextInvoiceNumber || 1));
    const next = Math.max(configured, used.length ? Math.max.apply(null, used) + 1 : 1);
    return prefix + '-' + new Date().getFullYear() + '-' + String(next).padStart(5, '0');
  }

  function linesMarkup(order) {
    const lines = order.lines.length ? order.lines : [{ title: 'eBay-Bestellung', quantity: 1, total: order.total, currency: order.currency }];
    return lines.map((line) => '<tr><td>' + esc(line.title) + '</td><td class="num">' + line.quantity + '</td><td class="num">' + money(line.total, line.currency || order.currency) + '</td></tr>').join('');
  }

  function printInvoice(order, meta) {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) { notify('Pop-up blockiert. Bitte Pop-ups für das Seller Tool erlauben.', 'Rechnung'); return; }
    const address = order.address.length ? order.address.map(esc).join('<br>') : 'Keine Käuferadresse von eBay übermittelt';
    const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ' + esc(meta.invoiceNumber) + '</title><style>' +
      'body{font-family:Arial,sans-serif;color:#111;max-width:850px;margin:40px auto;padding:0 28px}header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:20px;margin-bottom:26px}h1{margin:0 0 8px}h2{font-size:16px;margin:24px 0 8px}.muted{color:#666}.grid{display:grid;grid-template-columns:1fr 1fr;gap:36px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd}.num{text-align:right}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}.print{padding:10px 14px;margin-bottom:22px}@media print{.print{display:none}body{margin:0;padding:0}}' +
      '</style></head><body><button class="print" onclick="window.print()">Drucken / als PDF speichern</button><header><div><h1>Rechnung</h1><div class="muted">' + esc(meta.invoiceNumber) + '</div></div><div class="muted">Ausgestellt: ' + esc(dateTime.format(new Date(meta.createdAt))) + '</div></header>' +
      '<div class="grid"><section><h2>Rechnungsempfänger</h2>' + address + '</section><section><h2>Bestellung</h2>eBay-Bestellnummer: <strong>' + esc(order.id) + '</strong><br>Bestelldatum: ' + esc(order.createdAt ? dateTime.format(new Date(order.createdAt)) : '–') + '<br>Status: ' + esc(order.ebayStatus) + '</section></div>' +
      '<h2>Leistungen</h2><table><thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Gesamt</th></tr></thead><tbody>' + linesMarkup(order) + '</tbody></table><div class="total">Gesamtbetrag: ' + money(order.total, order.currency) + '</div><p class="muted">Erstellt aus den von eBay übermittelten Bestelldaten. Käuferbenachrichtigung wurde nicht automatisch versendet.</p></body></html>';
    popup.document.write(html); popup.document.close(); popup.focus();
  }

  function createInvoice(order) {
    const meta = readMeta();
    if (!meta[order.id]) {
      meta[order.id] = { orderId: order.id, invoiceNumber: invoiceNumber(meta), createdAt: new Date().toISOString(), status: 'erstellt', total: order.total, currency: order.currency };
      saveJson(META_KEY, meta);
      notify('Rechnung ' + meta[order.id].invoiceNumber + ' erstellt. Keine automatische Nachricht versendet.');
    }
    printInvoice(order, meta[order.id]); render();
  }

  function statusLabel(value) { const hit = STATUS_OPTIONS.find((item) => item[0] === value); return hit ? hit[1] : value; }

  function styles() {
    if (document.getElementById('elyonOrderInvoiceStyles')) return;
    const style = document.createElement('style'); style.id = 'elyonOrderInvoiceStyles';
    style.textContent = '#' + ROOT_ID + '{margin:18px 0}.eoi-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.eoi-head h3{margin:0 0 6px}.eoi-muted{color:#94a3b8;font-size:12px}.eoi-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:14px}.eoi-card{padding:12px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.5)}.eoi-card strong{display:block;font-size:18px}.eoi-table{width:100%;border-collapse:collapse;margin-top:14px}.eoi-table th,.eoi-table td{padding:10px 8px;text-align:left;border-bottom:1px solid rgba(148,163,184,.18);vertical-align:top}.eoi-table th{color:#94a3b8;font-size:11px;text-transform:uppercase}.eoi-btn{border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.65);color:inherit;border-radius:10px;padding:8px 11px;cursor:pointer}.eoi-btn.primary{background:#2563eb;border-color:#2563eb}.eoi-status{font-size:11px;color:#86efac}.eoi-error{color:#fecaca;padding:10px;border-radius:10px;background:rgba(127,29,29,.24)}.eoi-controls{display:grid;grid-template-columns:140px 130px minmax(140px,1fr) minmax(160px,1fr) auto;gap:7px;align-items:center}.eoi-controls select,.eoi-controls input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.25);background:#0f172a;color:inherit;border-radius:8px;padding:7px}.eoi-total{font-size:12px;color:#86efac}.eoi-note{margin-top:10px;color:#cbd5e1;font-size:12px}@media(max-width:800px){.eoi-controls{grid-template-columns:1fr 1fr}.eoi-controls .eoi-save{grid-column:span 2}}';
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
    if (!orders.length) html += '<div class="eoi-muted" style="margin-top:14px">Noch keine Bestellungen geladen.</div>';
    else {
      html += '<div style="overflow:auto"><table class="eoi-table"><thead><tr><th>Bestellung</th><th>eBay</th><th>Betrag</th><th>Prozess & Versand</th><th>Rechnung</th></tr></thead><tbody>';
      html += orders.map((order) => {
        const invoice = meta[order.id]; const op = operationFor(order);
        const options = STATUS_OPTIONS.map((item) => '<option value="' + item[0] + '"' + (item[0] === op.status ? ' selected' : '') + '>' + item[1] + '</option>').join('');
        return '<tr><td><strong>' + esc(order.id) + '</strong><div class="eoi-muted">' + esc(order.buyerName || 'Käuferdaten nicht übermittelt') + '</div></td><td>' + esc(order.ebayStatus) + '</td><td>' + money(order.total, order.currency) + '</td><td><div class="eoi-controls"><select data-eoi-status="' + esc(order.id) + '">' + options + '</select><input data-eoi-carrier="' + esc(order.id) + '" placeholder="Versanddienst" value="' + esc(op.carrier) + '"><input data-eoi-tracking="' + esc(order.id) + '" placeholder="Trackingnummer" value="' + esc(op.trackingNumber) + '"><input data-eoi-url="' + esc(order.id) + '" placeholder="Tracking-URL (optional)" value="' + esc(op.trackingUrl) + '"><button type="button" class="eoi-btn eoi-save" data-eoi-save="' + esc(order.id) + '">Speichern</button></div><div class="eoi-note">' + (op.updatedAt ? 'Zuletzt gespeichert: ' + esc(dateTime.format(new Date(op.updatedAt))) : 'Noch nicht intern erfasst') + '</div></td><td>' + (invoice ? '<span class="eoi-status">' + esc(invoice.invoiceNumber) + '</span><br>' : '') + '<button type="button" class="eoi-btn" data-eoi-invoice="' + esc(order.id) + '">' + (invoice ? 'Rechnung öffnen' : 'Rechnung erstellen') + '</button></td></tr>';
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
      });
    }
  });

  window.ElyonOrderInvoices = { mount, load: loadOrders, create: createInvoice };
})();