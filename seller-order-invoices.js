(() => {
  "use strict";

  const ROOT_ID = "elyonOrderInvoicePanel";
  const META_KEY = "elyon_order_invoice_meta_v1";
  const SETTINGS_KEY = "elyon_finance_v1";
  const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
  let orders = [];
  let loading = false;
  let mounted = false;

  const text = function (value) { return String(value == null ? "" : value).trim(); };
  const esc = function (value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); };
  const num = function (value) { return Number.isFinite(Number(value)) ? Number(value) : 0; };
  const money = function (value, currency) {
    try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(num(value)); }
    catch { return num(value).toFixed(2) + " " + (currency || "EUR"); }
  };
  const readMeta = function () { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch { return {}; } };
  const saveMeta = function (value) { localStorage.setItem(META_KEY, JSON.stringify(value)); };
  const settings = function () { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").settings || {}; } catch { return {}; } };
  const notify = function (message, eyebrow) { if (typeof window.toast === "function") window.toast(message, eyebrow || "Rechnungen"); };

  function normalizeOrder(order) {
    const id = text(order && (order.orderId || order.legacyOrderId));
    const ship = order && order.fulfillmentStartInstructions && order.fulfillmentStartInstructions[0] && order.fulfillmentStartInstructions[0].shippingStep && order.fulfillmentStartInstructions[0].shippingStep.shipTo || {};
    const address = ship.contactAddress || {};
    const lines = Array.isArray(order && order.lineItems) ? order.lineItems : [];
    const currency = text(order && order.pricingSummary && order.pricingSummary.total && order.pricingSummary.total.currency || lines[0] && lines[0].lineItemCost && lines[0].lineItemCost.currency || "EUR");
    const total = num(order && order.pricingSummary && order.pricingSummary.total && order.pricingSummary.total.value) || lines.reduce(function (sum, line) { return sum + num(line && line.lineItemCost && line.lineItemCost.value); }, 0);
    return {
      id: id,
      createdAt: order && (order.creationDate || order.lastModifiedDate) || "",
      status: text(order && (order.orderFulfillmentStatus || order.orderPaymentStatus) || "UNBEKANNT"),
      buyerName: text(ship.fullName || order && order.buyer && order.buyer.username),
      address: [address.addressLine1, address.addressLine2, [address.postalCode, address.city].filter(Boolean).join(" "), address.countryCode].filter(Boolean),
      lines: lines.map(function (line) { return { title: text(line && line.title || "Artikel"), quantity: Math.max(1, num(line && line.quantity)), total: num(line && line.lineItemCost && line.lineItemCost.value), currency: currency }; }),
      total: total,
      currency: currency
    };
  }

  async function loadOrders() {
    if (loading) return;
    loading = true; render();
    try {
      const response = await fetch("/api/ebay?action=orders&environment=production&days=90&status=all", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || data.ok === false) throw new Error(data.error || data.message || "HTTP " + response.status);
      orders = (Array.isArray(data.orders) ? data.orders : []).map(normalizeOrder).filter(function (order) { return order.id; });
      notify(orders.length ? orders.length + " eBay-Bestellung(en) geladen." : "Keine eBay-Bestellungen im Zeitraum.");
    } catch (error) {
      orders = []; render("Bestellungen konnten nicht geladen werden: " + error.message);
    } finally { loading = false; render(); }
  }

  function invoiceNumber(meta) {
    const rawPrefix = text(settings().invoicePrefix || "ELYON").replace(/[^A-Za-z0-9_-]/g, "");
    const prefix = rawPrefix || "ELYON";
    const used = Object.values(meta).map(function (item) { const match = String(item && item.invoiceNumber || "").match(/(\\d+)$/); return num(match && match[1]); }).filter(Boolean);
    const configured = Math.max(1, num(settings().nextInvoiceNumber || 1));
    const next = Math.max(configured, used.length ? Math.max.apply(null, used) + 1 : 1);
    return prefix + "-" + new Date().getFullYear() + "-" + String(next).padStart(5, "0");
  }

  function linesMarkup(order) {
    const lines = order.lines.length ? order.lines : [{ title: "eBay-Bestellung", quantity: 1, total: order.total, currency: order.currency }];
    return lines.map(function (line) {
      return "<tr><td>" + esc(line.title) + "</td><td class='num'>" + line.quantity + "</td><td class='num'>" + money(line.total, line.currency || order.currency) + "</td></tr>";
    }).join("");
  }

  function printInvoice(order, meta) {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) { notify("Pop-up blockiert. Bitte Pop-ups für das Seller Tool erlauben.", "Rechnung"); return; }
    const address = order.address.length ? order.address.map(esc).join("<br>") : "Keine Käuferadresse von eBay übermittelt";
    const html = "<!doctype html><html lang='de'><head><meta charset='utf-8'><title>Rechnung " + esc(meta.invoiceNumber) + "</title><style>" +
      "body{font-family:Arial,sans-serif;color:#111;max-width:850px;margin:40px auto;padding:0 28px}" +
      "header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:20px;margin-bottom:26px}" +
      "h1{margin:0 0 8px}h2{font-size:16px;margin:24px 0 8px}.muted{color:#666}.grid{display:grid;grid-template-columns:1fr 1fr;gap:36px}" +
      "table{width:100%;border-collapse:collapse;margin-top:14px}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd}.num{text-align:right}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}.print{padding:10px 14px;margin-bottom:22px}@media print{.print{display:none}body{margin:0;padding:0}}" +
      "</style></head><body><button class='print' onclick='window.print()'>Drucken / als PDF speichern</button>" +
      "<header><div><h1>Rechnung</h1><div class='muted'>" + esc(meta.invoiceNumber) + "</div></div><div class='muted'>Ausgestellt: " + esc(dateTime.format(new Date(meta.createdAt))) + "</div></header>" +
      "<div class='grid'><section><h2>Rechnungsempfänger</h2>" + address + "</section><section><h2>Bestellung</h2>eBay-Bestellnummer: <strong>" + esc(order.id) + "</strong><br>Bestelldatum: " + esc(order.createdAt ? dateTime.format(new Date(order.createdAt)) : "–") + "<br>Status: " + esc(order.status) + "</section></div>" +
      "<h2>Leistungen</h2><table><thead><tr><th>Artikel</th><th class='num'>Menge</th><th class='num'>Gesamt</th></tr></thead><tbody>" + linesMarkup(order) + "</tbody></table>" +
      "<div class='total'>Gesamtbetrag: " + money(order.total, order.currency) + "</div><p class='muted'>Erstellt aus den von eBay übermittelten Bestelldaten. Käuferbenachrichtigung wurde nicht automatisch versendet.</p></body></html>";
    popup.document.write(html); popup.document.close(); popup.focus();
  }

  function createInvoice(order) {
    const meta = readMeta();
    if (!meta[order.id]) {
      meta[order.id] = { orderId: order.id, invoiceNumber: invoiceNumber(meta), createdAt: new Date().toISOString(), status: "erstellt", total: order.total, currency: order.currency };
      saveMeta(meta);
      notify("Rechnung " + meta[order.id].invoiceNumber + " erstellt. Keine automatische Nachricht versendet.");
    }
    printInvoice(order, meta[order.id]); render();
  }

  function styles() {
    if (document.getElementById("elyonOrderInvoiceStyles")) return;
    const style = document.createElement("style"); style.id = "elyonOrderInvoiceStyles";
    style.textContent = "#" + ROOT_ID + "{margin:18px 0}.eoi-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.eoi-head h3{margin:0 0 6px}.eoi-muted{color:#94a3b8;font-size:12px}.eoi-table{width:100%;border-collapse:collapse;margin-top:14px}.eoi-table th,.eoi-table td{padding:10px 8px;text-align:left;border-bottom:1px solid rgba(148,163,184,.18)}.eoi-table th{color:#94a3b8;font-size:11px;text-transform:uppercase}.eoi-btn{border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.65);color:inherit;border-radius:10px;padding:8px 11px;cursor:pointer}.eoi-btn.primary{background:#2563eb;border-color:#2563eb}.eoi-status{font-size:11px;color:#86efac}.eoi-error{color:#fecaca;padding:10px;border-radius:10px;background:rgba(127,29,29,.24)}";
    document.head.appendChild(style);
  }

  function render(error) {
    if (!mounted) return;
    const root = document.getElementById(ROOT_ID); if (!root) return;
    const meta = readMeta();
    let html = "<div class='eoi-head'><div><h3>Rechnungen aus eBay-Bestellungen</h3><div class='eoi-muted'>Rechnung je Bestellung · eBay-Daten · keine automatische Käufernachricht</div></div><button type='button' class='eoi-btn primary' data-eoi-load>" + (loading ? "Lade…" : "Bestellungen laden") + "</button></div>";
    if (error) html += "<div class='eoi-error'>" + esc(error) + "</div>";
    if (!orders.length) html += "<div class='eoi-muted' style='margin-top:14px'>Noch keine Bestellungen geladen.</div>";
    else {
      html += "<div style='overflow:auto'><table class='eoi-table'><thead><tr><th>Bestellung</th><th>Datum</th><th>Betrag</th><th>Rechnung</th><th>Aktion</th></tr></thead><tbody>";
      html += orders.map(function (order) {
        const invoice = meta[order.id];
        return "<tr><td><strong>" + esc(order.id) + "</strong><div class='eoi-muted'>" + esc(order.buyerName || "Käuferdaten nicht übermittelt") + "</div></td><td>" + esc(order.createdAt ? dateTime.format(new Date(order.createdAt)) : "–") + "</td><td>" + money(order.total, order.currency) + "</td><td>" + (invoice ? "<span class='eoi-status'>" + esc(invoice.invoiceNumber) + " · erstellt</span>" : "offen") + "</td><td><button type='button' class='eoi-btn' data-eoi-invoice='" + esc(order.id) + "'>" + (invoice ? "Rechnung öffnen" : "Rechnung erstellen") + "</button></td></tr>";
      }).join("");
      html += "</tbody></table></div>";
    }
    root.innerHTML = html;
  }

  function mount() {
    const tab = document.getElementById("financeTab"); if (!tab) return;
    styles();
    let root = document.getElementById(ROOT_ID);
    if (!root) { root = document.createElement("section"); root.id = ROOT_ID; root.className = "ef-panel"; tab.appendChild(root); }
    mounted = true; render();
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest && event.target.closest("[data-eoi-load]")) return loadOrders();
    const button = event.target.closest && event.target.closest("[data-eoi-invoice]");
    if (button) { const order = orders.find(function (item) { return item.id === button.dataset.eoiInvoice; }); if (order) createInvoice(order); }
  });

  window.ElyonOrderInvoices = { mount: mount, load: loadOrders, create: createInvoice };
})();
