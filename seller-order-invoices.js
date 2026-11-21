import { DEFAULT_ORDER_THANK_YOU,renderOrderThankYou } from "./seller-order-message-core.js";

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
  let messageTemplate = DEFAULT_ORDER_THANK_YOU;
  let messageRevision = null;
  let messageReady = false;
  let messageLoading = false;
  let messageBusy = false;
  let messageSelectedId = "";
  let messageDraft = "";
  let messageDispatch = null;
  let messageError = "";
  let messageNotice = "";
  let messageIsDemo = false;
  let invoicePreviewId = "";
  const invoicePreflight = new Map();
  const invoicePreflightBusy = new Set();
  let messageEditorOpen = false;
  let messageEditorDraft = DEFAULT_ORDER_THANK_YOU;
  let messageEditorPreview = false;
  let messageModalReturnFocus = null;
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
      const localInvoiceMeta = readJson(META_KEY, {});
      const serverInvoiceMeta = incoming.invoiceMeta || {};
      serverState = { ...serverState, ...incoming, orderOperations: incoming.orderOperations || {}, invoiceMeta: { ...localInvoiceMeta, ...serverInvoiceMeta }, inventory: incoming.inventory || {}, returns: incoming.returns || {}, safety: incoming.safety || {} };
      serverLoaded = true;
      const hadLocalOps = !Object.keys(serverState.orderOperations).length && Object.keys(readJson(OPS_KEY, {})).length;
      const hadLocalMeta = Object.keys(localInvoiceMeta).some(orderId => !Object.hasOwn(serverInvoiceMeta, orderId));
      if (hadLocalOps) serverState.orderOperations = readJson(OPS_KEY, {});
      // Legacy entries missing on server are merged without replacing issued snapshots.
      try { localStorage.setItem(OPS_KEY, JSON.stringify(serverState.orderOperations)); localStorage.setItem(META_KEY, JSON.stringify(serverState.invoiceMeta)); } catch {}
      if (hadLocalOps || hadLocalMeta) persistServerState();
    } catch (error) {
      serverLoaded = false;
      notify('Server-Sync nicht verfügbar. Lokale Sicherung bleibt erhalten.', 'Synchronisierung');
    }
  }
  async function messageApi(url, options = {}) {
    const response = await fetch(url, { credentials:'same-origin',cache:'no-store',...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'HTTP '+response.status);
    return data;
  }
  async function loadMessageSettings(orderId = "") {
    if (messageLoading) return;
    messageLoading = true;
    try {
      const q = orderId ? '?orderId='+encodeURIComponent(orderId) : '';
      const data = await messageApi('/api/orders/customer-message'+q);
      messageRevision = data.revision;
      messageReady = data.sendReady === true;
      messageTemplate = data.template || DEFAULT_ORDER_THANK_YOU;
      if (orderId) messageDispatch = data.delivery || null;
      messageError = '';
    } catch(error) {
      messageError = 'Nachrichteneinstellungen nicht geladen: '+error.message;
      messageRevision = null;
      messageReady = false;
    } finally { messageLoading=false;render(); }
  }
  function messageContext(id) {
    const meta = readMeta()[id] || {};
    const entry = orders.find(item => item.id === id);
    const invoice = meta.immutable === true ? meta.invoice : null;
    return {
      buyerName: invoice?.buyer?.name || entry?.buyerName || 'liebe Kundin, lieber Kunde',
      orderId:id,
      invoiceNumber:meta.immutable===true ? meta.invoiceNumber : 'MUSTER-RECHNUNG',
      shopName: invoice?.seller?.brand || serverState.settings?.sellerBrand || 'ELYON',
    };
  }
  async function saveMessageTemplate() {
    if(messageBusy || !Number.isSafeInteger(messageRevision)) return;
    const template = messageEditorDraft;
    messageBusy=true;messageError='';messageNotice='';render();
    try {
      const data = await messageApi('/api/orders/customer-message',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'save-template',expectedRevision:messageRevision,template})
      });
      messageTemplate=data.template;messageEditorDraft=data.template;messageRevision=data.revision;
      messageNotice='Dankesnachricht als Vorlage gespeichert. Kein Kunde wurde kontaktiert.';
    } catch(error) {
      messageError='Vorlage nicht gespeichert: '+error.message;
      await loadMessageSettings().catch(()=>{});
    } finally {messageBusy=false;render();}
  }
  function openMessageSettings(trigger) {
    if (messageBusy) return;
    messageModalReturnFocus = trigger || document.activeElement;
    messageEditorOpen = true;
    messageEditorDraft = messageTemplate;
    messageEditorPreview = false;
    messageSelectedId = '';
    messageIsDemo = false;
    messageError = '';
    messageNotice = '';
    render();
    document.querySelector('#'+ROOT_ID+' [data-eoi-template]')?.focus();
  }
  function closeMessageDialog() {
    if (!messageEditorOpen || messageBusy) return;
    const unsaved = messageSelectedId
      ? messageDraft !== renderOrderThankYou(messageTemplate,messageContext(messageSelectedId)).text
      : messageEditorDraft !== messageTemplate;
    if (unsaved && !window.confirm('Ungespeicherte Änderungen verwerfen und Fenster schließen?')) return;
    const trigger = messageModalReturnFocus;
    messageEditorOpen = false;
    messageEditorPreview = false;
    messageSelectedId = '';
    messageDraft = '';
    messageIsDemo = false;
    messageError = '';
    messageNotice = '';
    render();
    if (trigger?.isConnected) trigger.focus();
    else document.querySelector('#'+ROOT_ID+' [data-eoi-message-settings]')?.focus();
  }
  async function prepareInvoiceMessage(id, demo = false, trigger = null) {
    if (messageBusy) return;
    messageModalReturnFocus = trigger || document.activeElement;
    messageEditorOpen = true;
    messageSelectedId = id;
    messageIsDemo = demo;
    messageDispatch = null;
    messageError = '';
    messageNotice = '';
    messageDraft = '';
    render();
    if (!demo) await loadMessageSettings(id);
    if (!messageEditorOpen || messageSelectedId !== id) return;
    messageDraft = renderOrderThankYou(messageTemplate,messageContext(id)).text;
    if (!demo) void checkInvoiceSend(id);
    render();
    document.querySelector('#'+ROOT_ID+' [data-eoi-draft]')?.focus();
  }
  async function sendInvoiceMessage() {
    const orderId=messageSelectedId;
    if(messageBusy||messageIsDemo||!messageReady||!orderId||messageDispatch?.status||invoicePreflight.get(orderId)?.ready!==true) return;
    const preview=renderOrderThankYou(messageDraft,messageContext(orderId));
    if(!preview.ok){messageError=preview.errors.join(' · ');render();return;}
    if(!window.confirm('ECHTE eBay-Nachricht mit Rechnungs-PDF an den Käufer der Bestellung '+
      orderId+' senden?\\n\\nBitte Empfänger, Rechnung und Text geprüft haben. Kein automatischer Wiederholungsversand.'))return;
    messageBusy=true;messageError='';messageNotice='';render();
    try {
      const data=await messageApi('/api/orders/customer-message',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'send-invoice',orderId,expectedRevision:messageRevision,
          messageText:preview.text,confirmation:'SEND_ORDER_INVOICE_MESSAGE'})
      });
      messageDispatch={status:'sent',messageId:data.messageId};
      messageNotice=data.message||'eBay hat den Versand bestätigt.';
    } catch(error) {
      messageError='Versand nicht bestätigt: '+error.message;
      messageDispatch={status:'unknown'};
    } finally {messageBusy=false;await loadMessageSettings(orderId);render();}
  }
  async function checkInvoiceSend(id) {
    if (!id || invoicePreflightBusy.has(id) || !/^[A-Za-z0-9_-]{6,70}$/.test(id)) return;
    invoicePreflightBusy.add(id);
    invoicePreflight.delete(id);
    render();
    try {
      const data = await messageApi('/api/orders/invoice-send-check?orderId='+encodeURIComponent(id));
      invoicePreflight.set(id,{ready:data.readyToSend===true,blockers:data.blockers||[],
        checks:data.checks||{},checkedAt:new Date().toISOString()});
    } catch (error) {
      invoicePreflight.set(id,{ready:false,blockers:['Vorprüfung fehlgeschlagen: '+error.message],checks:{}});
    } finally { invoicePreflightBusy.delete(id); render(); }
  }

  const PRECHECK_LABELS = {
    finance_store_unavailable:'Finanzspeicher nicht verfügbar',
    attachment_base_invalid:'PDF-Hosting nicht erreichbar',
    send_feature_disabled:'Echter Nachrichtenversand noch nicht freigeschaltet',
    invoice_not_issued:'Rechnung muss erst verbindlich ausgestellt werden',
    prior_send_attempt:'Früheren Nachrichtenversuch zuerst prüfen',
    invoice_integrity_failed:'Rechnungsarchiv konnte nicht verifiziert werden',
    ebay_order_mismatch:'Bestellnummer bei eBay nicht bestätigt',
    payment_not_confirmed:'Zahlung nicht bestätigt',
    order_cancelled_or_unknown:'Stornierung oder Bestellstatus unklar',
    recipient_unavailable:'eBay-Empfänger nicht eindeutig',
    message_scope_not_verified:'eBay-Nachrichtenberechtigung noch nicht bestätigt',
    ebay_order_lookup_failed:'eBay-Bestellabfrage nicht verfügbar',
    attachment_delivery_failed:'PDF-Anhang nicht vollständig abrufbar',
  };
  function preflightMarkup(id) {
    const result=invoicePreflight.get(id);
    if (invoicePreflightBusy.has(id)) return '<div class="eoi-note" role="status">Versandprüfung läuft …</div>';
    if (!result) return '<div class="eoi-muted">Versandbereitschaft noch nicht geprüft.</div>';
    const notes=(result.blockers||[]).map(k=>PRECHECK_LABELS[k]||k).map(esc);
    return '<div class="eoi-note" role="status"><strong>'+(result.ready?'Alle Versandprüfungen bestanden':'Noch nicht versandbereit')+
      '</strong>'+(notes.length?'<ul><li>'+notes.join('</li><li>')+'</li></ul>':'')+
      '<span class="eoi-muted">Prüfung ist nur eine Momentaufnahme; keine Nachricht gesendet.</span></div>';
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
  const pdfUrl = (orderId, download = false) =>
    '/api/finance/invoice-pdf?orderId=' + encodeURIComponent(orderId) + (download ? '&download=1' : '');

  function printInvoice(invoice, preopenedWindow = null) {
    // Only an issued immutable snapshot can be downloaded from the protected server.
    // Never synthesize a new invoice or number from the browser.
    if (!invoice?.invoiceNumber || !invoice?.orderId ||
        !invoice?.seller?.taxId || invoice.taxMode !== 'small_business') {
      try { preopenedWindow?.close(); } catch {}
      notify('Keine vollständig ausgestellte Kleinunternehmer-Rechnung vorhanden.', 'Rechnung');
      return;
    }
    const popup = preopenedWindow || window.open('', '_blank');
    if (!popup) {
      notify('Bitte Pop-ups für das Seller Tool erlauben. Alternativ PDF herunterladen.', 'Rechnung');
      return;
    }
    popup.location.replace(pdfUrl(invoice.orderId));
  }
  async function downloadInvoice(orderId) {
    if (!/^[A-Za-z0-9_-]{6,70}$/.test(String(orderId || ''))) return;
    try {
      const response = await fetch(pdfUrl(orderId,true), {
        credentials:'same-origin',cache:'no-store',headers:{Accept:'application/pdf'}
      });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('application/pdf')) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || 'HTTP ' + response.status);
      }
      const blob = await response.blob();
      const ref = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = ref;
      a.download = 'ELYON-Rechnung-' + orderId.replace(/[^A-Za-z0-9_-]/g,'') + '.pdf';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(ref), 60_000);
    } catch(error) {
      notify('PDF konnte nicht heruntergeladen werden: ' + error.message, 'Rechnungsarchiv');
    }
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
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write('<!doctype html><html lang="de"><meta charset="utf-8"><title>ELYON Rechnung</title><body><p>ELYON prüft die Bestellung und Rechnungsdaten…</p></body></html>');
      printWindow.document.close();
    }
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
      printInvoice(data.invoice, printWindow);
      notify('Rechnung ' + data.invoiceNumber + (data.existing ? ' erneut geöffnet.' : ' ausgestellt und serverseitig gesichert.') +
        ' Versand an den Kunden erfolgt nicht automatisch.', 'Rechnung');
    } catch (error) {
      try { printWindow?.close(); } catch {}
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
    // Keep the PDF example action neat next to the existing refresh button.
    style.textContent = '#' + ROOT_ID + '{margin:18px 0}.eoi-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.eoi-head h3{margin:0 0 6px}.eoi-muted{color:#94a3b8;font-size:12px}.eoi-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:14px}.eoi-card{padding:12px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.5)}.eoi-card strong{display:block;font-size:18px}.eoi-table{width:100%;border-collapse:collapse;margin-top:14px}.eoi-table th,.eoi-table td{padding:10px 8px;text-align:left;border-bottom:1px solid rgba(148,163,184,.18);vertical-align:top}.eoi-table th{color:#94a3b8;font-size:11px;text-transform:uppercase}.eoi-btn{border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.65);color:inherit;border-radius:10px;padding:8px 11px;cursor:pointer}.eoi-btn.primary{background:#2563eb;border-color:#2563eb}.eoi-status{font-size:11px;color:#86efac}.eoi-error{color:#fecaca;padding:10px;border-radius:10px;background:rgba(127,29,29,.24)}.eoi-controls{display:grid;grid-template-columns:140px 130px minmax(140px,1fr) minmax(160px,1fr) 90px 130px auto;gap:7px;align-items:center}.eoi-controls select,.eoi-controls input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.25);background:#0f172a;color:inherit;border-radius:8px;padding:7px}.eoi-total{font-size:12px;color:#86efac}.eoi-note{margin-top:10px;color:#cbd5e1;font-size:12px}@media(max-width:800px){.eoi-controls{grid-template-columns:1fr 1fr}.eoi-controls .eoi-save{grid-column:span 2}}';
    style.textContent += '.eoi-template-box{border:1px solid rgba(148,163,184,.22);background:rgba(148,163,184,.045);border-radius:7px;padding:14px;margin:14px 0}.eoi-template-heading{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.eoi-template-heading h4{font-size:13px;margin:0}.eoi-template-box textarea{width:100%;resize:vertical;min-height:105px;box-sizing:border-box;background:rgba(15,23,42,.5);border:1px solid rgba(148,163,184,.3);border-radius:5px;color:inherit;padding:11px;font:12px/1.55 inherit}.eoi-template-box p{margin:9px 0}.eoi-template-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}.eoi-template-actions .eoi-btn{border-radius:5px;font-size:11px}.eoi-template-actions .eoi-btn:disabled{opacity:.6;cursor:not-allowed}.eoi-message-preview{border-color:rgba(96,165,250,.3)}';
    style.textContent += '.eoi-actions{display:flex;flex-wrap:wrap;gap:7px}.eoi-dialog-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(8,14,25,.68);display:flex;justify-content:center;align-items:center;overflow-y:auto;padding:18px;box-sizing:border-box;backdrop-filter:blur(3px)}.eoi-dialog{background:var(--surface,#172133);color:var(--text-primary,#e8edf4);border:1px solid rgba(148,163,184,.28);box-shadow:0 20px 60px rgba(0,0,0,.45);border-radius:10px;width:min(610px,100%);max-height:min(88vh,780px);display:flex;flex-direction:column;overflow:hidden;font-size:12px}.eoi-dialog-head{padding:17px 20px 13px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid rgba(148,163,184,.2)}.eoi-dialog-head h3{font-size:15px;line-height:1.4;margin:0}.eoi-dialog-head p{margin:5px 0 0}.eoi-dialog-close{width:28px;height:28px;border:0;background:transparent;color:inherit;border-radius:5px;cursor:pointer;font-size:23px;line-height:1}.eoi-dialog-close:hover{background:rgba(148,163,184,.16)}.eoi-dialog-body{padding:17px 20px;overflow-y:auto;min-height:0;flex:1}.eoi-field-label{display:block;font-weight:600;margin-bottom:8px}.eoi-dialog-body textarea{font:inherit;line-height:1.6;width:100%;min-height:172px;max-height:340px;resize:vertical;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(148,163,184,.32);border-radius:6px;background:var(--input-bg,#10192a);color:inherit;outline-offset:2px}.eoi-dialog-body p{margin:9px 0}.eoi-dialog-foot{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px;padding:12px 20px;border-top:1px solid rgba(148,163,184,.2)}.eoi-dialog-foot .eoi-btn{border-radius:5px;font-size:12px}.eoi-dialog-foot .eoi-btn:disabled{opacity:.55;cursor:not-allowed}.eoi-dialog-preview{border:1px solid rgba(148,163,184,.25);border-radius:6px;padding:13px;margin-top:15px;background:rgba(148,163,184,.06)}.eoi-dialog-preview p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin-bottom:0}.eoi-dialog>.eoi-error,.eoi-dialog>.eoi-note{margin:8px 20px}.eoi-dialog :focus-visible{outline:2px solid #60a5fa;outline-offset:2px}@media(max-width:600px){.eoi-dialog-backdrop{padding:9px;align-items:center}.eoi-dialog{max-height:94vh}.eoi-dialog-head{padding:13px 15px}.eoi-dialog-body{padding:14px 15px}.eoi-dialog-foot{padding:10px 15px}}';
    document.head.appendChild(style);
  }

  function render(error) {
    if (!mounted) return;
    const root = document.getElementById(ROOT_ID); if (!root) return;
    const meta = readMeta(); const ops = readOps();
    const total = orders.reduce((sum, order) => sum + order.total, 0);
    const count = (status) => orders.filter((order) => operationFor(order).status === status).length;
    let html = '<div class="eoi-head"><div><h3>Bestellzentrale · Rechnung · Versand</h3><div class="eoi-muted">eBay-Bestellungen, interne Statusführung und verifizierte DIN-A4-PDF-Rechnungen.</div></div><div class="eoi-actions"><button type="button" class="eoi-btn" data-eoi-pdf-demo>Muster-PDF ansehen</button> <button type="button" class="eoi-btn" data-eoi-message-settings>Dankesnachricht verwalten</button> <button type="button" class="eoi-btn primary" data-eoi-load>' + (loading ? 'Lade…' : 'Bestellungen laden') + '</button></div></div>';
    html += '<div class="eoi-summary"><div class="eoi-card"><span class="eoi-muted">Bestellungen</span><strong>' + orders.length + '</strong></div><div class="eoi-card"><span class="eoi-muted">Offen</span><strong>' + (count('NEW') + count('PAID') + count('TO_BE_SHIPPED')) + '</strong></div><div class="eoi-card"><span class="eoi-muted">Versendet</span><strong>' + count('SHIPPED') + '</strong></div><div class="eoi-card"><span class="eoi-muted">Umsatz</span><strong>' + money(total, 'EUR') + '</strong><span class="eoi-muted">Kosten/Gewinn noch nicht zugeordnet</span></div></div>';
    if (error || errorMessage) html += '<div class="eoi-error">' + esc(error || errorMessage) + '</div>';
    const archived = Object.values(meta).filter(entry => entry?.immutable === true && entry.invoice);
    if (archived.length) {
      html += '<div class="eoi-note" style="margin-top:15px"><strong>Ausgestellte Rechnungen (serverseitige Momentaufnahme)</strong></div>';
      html += '<div style="overflow:auto"><table class="eoi-table"><thead><tr><th>Rechnung</th><th>eBay-Bestellung</th><th>Betrag</th><th>Dokument</th></tr></thead><tbody>' +
        archived.sort((a,b)=>String(b.invoice?.issuedAt||'').localeCompare(String(a.invoice?.issuedAt||'')))
          .map(entry=>'<tr><td>' + esc(entry.invoiceNumber) + '</td><td>' + esc(entry.invoice.orderId) +
            '</td><td>' + money(entry.invoice.total,'EUR') + '</td><td><button type="button" class="eoi-btn" data-eoi-archive="' +
            esc(entry.invoice.orderId) + '">PDF öffnen</button> <button type="button" class="eoi-btn" data-eoi-download="' +
            esc(entry.invoice.orderId) + '">PDF herunterladen</button> <button type="button" class="eoi-btn" data-eoi-message-compose="' +
            esc(entry.invoice.orderId) + '">Nachricht vorbereiten</button></td></tr>').join('') + '</tbody></table></div>';
    }
    const legacyCount = Object.values(meta).filter(entry => entry && !entry.immutable).length;
    if (legacyCount) html += '<div class="eoi-error" style="margin-top:10px">' +
      legacyCount + ' frühere Rechnungseinträge erkannt. Nicht erneut ausstellen; historische Belege manuell abgleichen.</div>';
    if (!orders.length) html += '<div class="eoi-muted" style="margin-top:14px">Noch keine Bestellungen geladen.</div>';
    else {
      html += '<div style="overflow:auto"><table class="eoi-table"><thead><tr><th>Bestellung</th><th>eBay</th><th>Betrag</th><th>Prozess & Versand</th><th>Rechnung</th></tr></thead><tbody>';
      html += orders.map((order) => {
        const invoice = meta[order.id]; const op = operationFor(order);
        const previewOpen = invoicePreviewId === order.id;
        const options = STATUS_OPTIONS.map((item) => '<option value="' + item[0] + '"' + (item[0] === op.status ? ' selected' : '') + '>' + item[1] + '</option>').join('');
        return '<tr><td><strong>' + esc(order.id) + '</strong><div class="eoi-muted">' + esc(order.buyerName || 'Käuferdaten nicht übermittelt') + '</div></td><td>' + esc(order.ebayStatus) + '</td><td>' + money(order.total, order.currency) + '</td><td><div class="eoi-controls"><select data-eoi-status="' + esc(order.id) + '">' + options + '</select><input data-eoi-carrier="' + esc(order.id) + '" placeholder="Versanddienst" value="' + esc(op.carrier) + '"><input data-eoi-tracking="' + esc(order.id) + '" placeholder="Trackingnummer" value="' + esc(op.trackingNumber) + '"><input data-eoi-url="' + esc(order.id) + '" placeholder="Tracking-URL (optional)" value="' + esc(op.trackingUrl) + '"><input data-eoi-stock="' + esc(order.id) + '" placeholder="Bestand" value="' + esc(op.stockQuantity || (serverState.inventory?.[order.lines[0]?.itemId]?.quantity ?? '')) + '"><select data-eoi-return="' + esc(order.id) + '"><option value="NONE"' + (op.returnStatus === "NONE" ? " selected" : "") + '>Keine Retoure</option><option value="REQUESTED"' + (op.returnStatus === "REQUESTED" ? " selected" : "") + '>Angefragt</option><option value="APPROVED"' + (op.returnStatus === "APPROVED" ? " selected" : "") + '>Genehmigt</option><option value="RECEIVED"' + (op.returnStatus === "RECEIVED" ? " selected" : "") + '>Eingegangen</option><option value="REFUNDED"' + (op.returnStatus === "REFUNDED" ? " selected" : "") + '>Erstattet</option></select><button type="button" class="eoi-btn eoi-save" data-eoi-save="' + esc(order.id) + '">Speichern</button></div><div class="eoi-note">' + (op.updatedAt ? 'Zuletzt gespeichert: ' + esc(dateTime.format(new Date(op.updatedAt))) : 'Noch nicht intern erfasst') + '</div></td><td>' + (invoice ? '<span class="eoi-status">' + esc(invoice.invoiceNumber) + '</span><br>' : '') + '<button type="button" class="eoi-btn" data-eoi-invoice="' + esc(order.id) + '">' + (issueBusy.has(order.id) ? 'Wird geprüft…' : invoice ? (invoice.immutable ? 'Rechnung öffnen' : 'Altrechnung prüfen') : 'Rechnung ausstellen') + '</button>' +
        (invoice?.immutable===true ? ' <button type="button" class="eoi-btn" data-eoi-message-compose="'+esc(order.id)+'">Dankesnachricht</button>' : '') +
        ' <button type="button" class="eoi-btn" data-eoi-preview="'+esc(order.id)+'">'+(previewOpen?'Vorschau schließen':'Rechnungsvorschau')+'</button>'+
        (invoice?.immutable===true ? ' <button type="button" class="eoi-btn" data-eoi-preflight="'+esc(order.id)+'">Versand prüfen</button>'+preflightMarkup(order.id) : '')+
        (previewOpen?'<div class="eoi-template-box" role="region" aria-label="Unverbindliche Rechnungsvorschau"><strong>Unverbindliche Rechnungsvorschau</strong>'+
          '<p class="eoi-muted">Noch keine Rechnung ausgestellt, keine Rechnungsnummer reserviert und kein Kundenversand. Verbindliche Daten werden ausschließlich bei der Ausstellung serverseitig geprüft.</p>'+
          '<p>eBay-Bestellung: '+esc(order.id)+' · Käufer: '+esc(order.buyerName||'Nicht übermittelt')+
          ' · Gesamtbetrag: '+money(order.total,order.currency)+'</p>'+
          '<table class="eoi-table"><thead><tr><th>Artikel</th><th>Menge</th><th>Betrag</th></tr></thead><tbody>'+linesMarkup(order)+'</tbody></table>'+
          '<p class="eoi-muted">Kleinunternehmer nach § 19 UStG – kein Umsatzsteuerausweis. Absenderdaten werden aus den gespeicherten Geschäftseinstellungen bezogen.</p></div>':'')+
        '</td></tr>';
      }).join('');
      html += '</tbody></table></div><div class="eoi-note">Die Versanddaten werden im Seller Tool gespeichert. Es wird keine Bestellung ausgelöst und keine eBay-Nachricht automatisch versendet.</div>';
    }

    if (messageEditorOpen) {
      const settingsMode = !messageSelectedId;
      const currentId = messageSelectedId;
      const ctx = settingsMode
        ? {buyerName:'Erika Beispiel',orderId:'DEMO-1001',invoiceNumber:'MUSTER-RECHNUNG',shopName:'ELYON'}
        : messageIsDemo
          ? {buyerName:'Erika Beispiel',orderId:'DEMO-1001',invoiceNumber:'MUSTER-RECHNUNG',shopName:'ELYON'}
          : messageContext(currentId);
      const invoice = settingsMode || messageIsDemo ? null : readMeta()[currentId];
      const preview = renderOrderThankYou(settingsMode ? messageEditorDraft : messageDraft || messageTemplate,ctx);
      const canSend = !settingsMode && !messageIsDemo && messageReady &&
        invoicePreflight.get(currentId)?.ready===true &&
        invoice?.immutable===true && !messageDispatch?.status && preview.ok && !messageBusy;
      html += '<div class="eoi-dialog-backdrop" data-eoi-dialog-backdrop>' +
        '<section class="eoi-dialog" role="dialog" aria-modal="true" aria-labelledby="eoiDialogTitle" tabindex="-1">' +
        '<div class="eoi-dialog-head"><div><h3 id="eoiDialogTitle">' +
        (settingsMode?'Dankesnachricht verwalten':'Rechnung an eBay-Käufer senden') + '</h3>' +
        '<p class="eoi-muted">'+(settingsMode?
          'Die Vorlage gilt für neue Rechnungsnachrichten.':'Bestellung '+esc(ctx.orderId)+' · Rechnung '+esc(ctx.invoiceNumber))+
        '</p></div><button type="button" class="eoi-dialog-close" data-eoi-dialog-close aria-label="Fenster schließen" title="Schließen">×</button></div>';
      if (settingsMode) {
        html += '<div class="eoi-dialog-body"><label class="eoi-field-label" for="eoiTemplateEditor">Nachrichtenvorlage</label>'+
          '<textarea id="eoiTemplateEditor" data-eoi-template rows="8" maxlength="1700" spellcheck="true">'+esc(messageEditorDraft)+'</textarea>'+
          '<p class="eoi-muted">Platzhalter: {Kundenname} · {Bestellnummer} · {Rechnungsnummer} · {Shopname}</p>';
        if (messageEditorPreview) {
          html += '<div class="eoi-dialog-preview"><strong>Muster-Vorschau · kein echter Versand</strong>' +
            (preview.ok?'<p>'+esc(preview.text)+'</p>':
            '<p class="eoi-error">'+esc(preview.errors.join(' · '))+'</p>')+'</div>';
        }
        html += '<p class="eoi-muted">Kein automatischer Kundenversand. Die Nachricht wird erst bei einer bestätigten Rechnungsübermittlung verwendet.</p></div>';
      } else {
        html += '<div class="eoi-dialog-body"><label class="eoi-field-label" for="eoiMessageDraft">Nachricht für diesen Käufer</label>'+
          '<textarea id="eoiMessageDraft" data-eoi-draft rows="8" maxlength="2000" spellcheck="true">'+esc(messageDraft)+'</textarea>'+
          (preview.ok?'':'<p class="eoi-error">'+esc(preview.errors.join(' · '))+'</p>')+
          '<p class="eoi-muted">PDF: '+(invoice?.immutable===true?
            'Ausgestellte Rechnung ist automatisch zugeordnet':messageIsDemo?
            'Nur Muster – kein echter Beleg':'Noch keine Rechnung ausgestellt')+'</p>'+
          (!messageIsDemo?preflightMarkup(currentId):'')+
          '<button type="button" class="eoi-btn" data-eoi-preflight="'+esc(currentId)+'" '+(messageIsDemo?'disabled':'')+'>Versandstatus neu prüfen</button>'+
          (messageDispatch?.status?'<p class="eoi-note">Nachrichtenstatus: '+esc(messageDispatch.status)+
            (messageDispatch.messageId?' · '+esc(messageDispatch.messageId):'')+'</p>':'')+
          '<p class="eoi-muted">'+(messageIsDemo?'Demo: Kein Versand und keine echte Rechnung.':
            !messageReady?'Versand noch gesperrt: eBay-Nachrichtenberechtigung und PDF-Abruf müssen geprüft werden.':
            'Versand erst nach Bestätigung. Doppelte Versuche sind gesperrt.')+'</p></div>';
      }
      if (messageError) html += '<p class="eoi-error" role="alert">'+esc(messageError)+'</p>';
      if (messageNotice) html += '<p class="eoi-note" role="status">'+esc(messageNotice)+'</p>';
      html += '<div class="eoi-dialog-foot">';
      if (settingsMode) {
        html += '<button type="button" class="eoi-btn" data-eoi-message-demo>'+
          (messageEditorPreview?'Vorschau ausblenden':'Muster-Vorschau')+'</button>'+
          '<button type="button" class="eoi-btn primary" data-eoi-template-save '+
          (messageBusy || !Number.isSafeInteger(messageRevision)?'disabled':'')+
          '>'+(messageBusy?'Speichert…':'Vorlage speichern')+'</button>';
      } else {
        html += '<button type="button" class="eoi-btn primary" data-eoi-message-send '+
          (canSend?'':'disabled')+'>Rechnung mit Dankesnachricht senden</button>';
      }
      html += '<button type="button" class="eoi-btn" data-eoi-dialog-close>Schließen</button></div>'+
        '</section></div>';
    }
    const focusTarget = messageEditorOpen && root.contains(document.activeElement)
      ? (document.activeElement?.matches?.('[data-eoi-template]') ? '[data-eoi-template]' :
        document.activeElement?.matches?.('[data-eoi-draft]') ? '[data-eoi-draft]' : null)
      : null;
    root.innerHTML = html;
    if (focusTarget) root.querySelector(focusTarget)?.focus();
  }

  function mount() {
    const tab = document.getElementById('financeTab'); if (!tab) return;
    styles();
    let root = document.getElementById(ROOT_ID);
    if (!root) { root = document.createElement('section'); root.id = ROOT_ID; root.className = 'ef-panel'; tab.appendChild(root); }
    mounted = true; render();
    if (!serverLoaded) loadServerState().then(() => render());
    void loadMessageSettings();
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest && event.target.closest('[data-eoi-pdf-demo]')) {
      const popup = window.open('/api/finance/invoice-pdf?demo=1','_blank');
      if (!popup) notify('Bitte Pop-ups für die Muster-PDF erlauben.','Musterrechnung');
      return;
    }
    const backdrop = event.target.closest && event.target.closest('[data-eoi-dialog-backdrop]');
    if (event.target === backdrop) { closeMessageDialog();return; }
    if (event.target.closest && event.target.closest('[data-eoi-dialog-close]')) {
      closeMessageDialog();return;
    }
    if (event.target.closest && event.target.closest('[data-eoi-message-settings]')) {
      openMessageSettings(event.target.closest('[data-eoi-message-settings]'));return;
    }
    if (event.target.closest && event.target.closest('[data-eoi-template-save]')) {
      void saveMessageTemplate();return;
    }
    if (event.target.closest && event.target.closest('[data-eoi-message-demo]')) {
      messageEditorPreview=!messageEditorPreview;
      render();
      document.querySelector('#'+ROOT_ID+' [data-eoi-template]')?.focus();
      return;
    }
    const previewButton = event.target.closest && event.target.closest('[data-eoi-preview]');
    if (previewButton) {
      invoicePreviewId = invoicePreviewId === previewButton.dataset.eoiPreview ? '' : previewButton.dataset.eoiPreview;
      render(); return;
    }
    const preflightButton = event.target.closest && event.target.closest('[data-eoi-preflight]');
    if (preflightButton) { void checkInvoiceSend(preflightButton.dataset.eoiPreflight); return; }
    if (event.target.closest && event.target.closest('[data-eoi-message-compose]')) {
      void prepareInvoiceMessage(event.target.closest('[data-eoi-message-compose]').dataset.eoiMessageCompose,
        false,event.target.closest('[data-eoi-message-compose]'));
      return;
    }
    if (event.target.closest && event.target.closest('[data-eoi-message-send]')) {
      void sendInvoiceMessage();return;
    }
    if (event.target.closest && event.target.closest('[data-eoi-load]')) return loadOrders();
    const pdfDownloadButton = event.target.closest && event.target.closest('[data-eoi-download]');
    if (pdfDownloadButton) { void downloadInvoice(pdfDownloadButton.dataset.eoiDownload); return; }
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

  document.addEventListener('input', event => {
    if (event.target?.matches?.('[data-eoi-draft]')) messageDraft=event.target.value;
    if (event.target?.matches?.('[data-eoi-template]')) messageEditorDraft=event.target.value;
  });
  document.addEventListener('keydown', event => {
    if (!messageEditorOpen) return;
    const modal = document.querySelector('#'+ROOT_ID+' [data-eoi-dialog-backdrop]');
    if (!modal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMessageDialog();
    } else if (event.key === 'Tab') {
      const controls = Array.from(modal.querySelectorAll(
        'button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled)'
      )).filter(element => element.getClientRects().length);
      if (!controls.length) return;
      const first=controls[0],last=controls[controls.length-1];
      if (event.shiftKey && (document.activeElement===first || !modal.contains(document.activeElement))) {
        event.preventDefault();last.focus();
      } else if (!event.shiftKey && (document.activeElement===last || !modal.contains(document.activeElement))) {
        event.preventDefault();first.focus();
      }
    }
  });
  window.ElyonOrderInvoices = { mount, load: loadOrders, create: createInvoice, download: downloadInvoice };
})();
