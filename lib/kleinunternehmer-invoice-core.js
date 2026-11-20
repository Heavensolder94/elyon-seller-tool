// Kleinunternehmer invoice payloads. The legal minimum is § 34a UStDV.
// This is intentionally independent of the browser and requires explicit,
// verified seller settings plus a current, server-fetched eBay order.
export const KLEINUNTERNEHMER_NOTE =
  'Für diesen Umsatz gilt die Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG. Es wird keine Umsatzsteuer ausgewiesen.';

const txt = (v, max = 350) => typeof v === 'string' || typeof v === 'number'
  ? String(v).trim().slice(0, max) : '';
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const list = v => Array.isArray(v) ? v : [];
const euroCents = v => {
  const raw = typeof v === 'number' ? String(v) : txt(v, 60).replace(',', '.');
  if (!/^-?\d{1,10}(?:\.\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const euro = c => c / 100;
const money = value => {
  const entry = obj(value);
  // Missing currency is not evidence that an eBay amount is in euros.
  if (txt(entry.currency, 10) !== 'EUR') return null;
  return euroCents(entry.value);
};
const validDate = v => /^\d{4}-\d{2}-\d{2}T/.test(txt(v, 60))
  && !Number.isNaN(Date.parse(v));

export function validateKleinunternehmerSeller(settings = {}) {
  const s = obj(settings);
  const errors = [];
  if (s.taxMode !== 'small_business') errors.push('Kleinunternehmer-Steuerstatus in Finanzen → Einstellungen bestätigen.');
  const seller = {
    name: txt(s.sellerLegalName, 180),
    addressLine1: txt(s.sellerStreet, 180),
    postalCode: txt(s.sellerPostalCode, 16),
    city: txt(s.sellerCity, 100),
    country: txt(s.sellerCountry || 'DE', 2).toUpperCase(),
    taxId: txt(s.sellerTaxId, 50),
    brand: txt(s.sellerBrand || 'ELYON', 100),
  };
  if (!seller.name) errors.push('Vollständiger rechtlicher Verkäufername fehlt.');
  if (!seller.addressLine1) errors.push('Geschäftsstraße mit Hausnummer fehlt.');
  if (!seller.postalCode) errors.push('Geschäfts-PLZ fehlt.');
  if (!seller.city) errors.push('Geschäftsort fehlt.');
  if (seller.country !== 'DE') errors.push('In dieser Vorlage ist nur ein deutscher Verkäufer freigegeben.');
  if (!seller.taxId) errors.push('Steuernummer, USt-IdNr. oder Kleinunternehmer-Identifikationsnummer fehlt.');
  return { ok: errors.length === 0, seller, errors };
}

export function buildKleinunternehmerInvoiceDraft(order = {}, settings = {}) {
  const errors = [];
  const validated = validateKleinunternehmerSeller(settings);
  errors.push(...validated.errors);
  const raw = obj(order);
  const id = txt(raw.orderId || raw.legacyOrderId, 100);
  if (!/^[A-Za-z0-9_-]{6,70}$/.test(id)) errors.push('Gültige eBay-Bestellnummer fehlt.');
  // Automatic issuance is limited to the eBay-confirmed paid state. This is a
  // safety limitation, not a claim that unpaid invoices are legally invalid.
  if (txt(raw.orderPaymentStatus).toUpperCase() !== 'PAID') errors.push('eBay-Zahlungsstatus ist nicht eindeutig vollständig bezahlt. Automatische Rechnung gesperrt; Bestellung prüfen.');
  const cancellation = txt(raw.cancelStatus?.cancelState).toUpperCase();
  if (cancellation && !['NONE_REQUESTED', 'NONE'].includes(cancellation)) errors.push('Stornierung bei eBay offen; Rechnungsstellung prüfen.');

  const instruction = list(raw.fulfillmentStartInstructions)[0] || {};
  const shipTo = obj(instruction?.shippingStep?.shipTo);
  const addr = obj(shipTo.contactAddress);
  const buyer = {
    name: txt(shipTo.fullName, 200),
    addressLine1: txt(addr.addressLine1, 180),
    addressLine2: txt(addr.addressLine2, 180),
    postalCode: txt(addr.postalCode, 25),
    city: txt(addr.city, 100),
    country: txt(addr.countryCode, 2).toUpperCase()
  };
  if (!buyer.name) errors.push('Vollständiger Käufername fehlt (eBay-Kennung reicht nicht).');
  if (!buyer.addressLine1 || !buyer.postalCode || !buyer.city) errors.push('Vollständige Käuferanschrift fehlt.');
  if (buyer.country !== 'DE') errors.push('Auslandsbestellung muss steuerlich manuell geprüft werden.');

  const summary = obj(raw.pricingSummary);
  const currency = txt(summary.total?.currency, 10);
  if (currency !== 'EUR') errors.push('Derzeit sind nur bestätigte EUR-Bestellungen zulässig.');
  const totalCents = money(summary.total);
  if (totalCents === null || totalCents <= 0) errors.push('eBay-Gesamtbetrag fehlt oder ist ungültig.');

  const lineItems = [];
  let linesCents = 0;
  for (const line of list(raw.lineItems)) {
    const name = txt(line?.title, 300);
    const quantity = Number(line?.quantity);
    const lineTotal = money(line?.lineItemCost);
    if (!name || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000 ||
        lineTotal === null || lineTotal < 0) {
      errors.push('Mindestens eine Artikelposition ist unvollständig (Menge, Name oder EUR-Betrag).');
      continue;
    }
    lineItems.push({ title: name, quantity, total: euro(lineTotal), sku: txt(line?.sku, 90) });
    linesCents += lineTotal;
  }
  if (!lineItems.length) errors.push('Keine abrechenbare eBay-Artikelposition vorhanden.');

  const shippingCents = summary.deliveryCost ? money(summary.deliveryCost) : 0;
  if (shippingCents === null || shippingCents < 0) errors.push('Lieferkosten in eBay-Bestellung nicht eindeutig.');
  const discounts = [
    summary.priceDiscount, summary.priceDiscountSubtotal,
  ].filter(Boolean);
  if (discounts.length > 1) errors.push('Mehrere Rabattfelder: Bitte Bestellbetrag manuell prüfen.');
  const discountCents = discounts.length ? money(discounts[0]) : 0;
  if (discountCents === null) errors.push('Rabattbetrag in eBay-Bestellung nicht eindeutig.');
  const discountAbs = Math.abs(discountCents || 0);

  // Marketplace-collected taxes, cross-border charges or unresolved adjustments
  // must not silently become a German §19 invoice.
  for (const field of ['tax', 'fee', 'adjustment', 'importCharges', 'additionalSavings']) {
    if (!summary[field]) continue;
    const cents = money(summary[field]);
    if (cents === null || cents !== 0) errors.push('eBay enthält gesonderte ' + field + '-Beträge: manuelle Prüfung erforderlich.');
  }
  const calculated = linesCents + (shippingCents || 0) - discountAbs;
  if (totalCents !== null && totalCents !== calculated)
    errors.push('eBay-Gesamtsumme weicht von Artikel-/Versand-/Rabattbeträgen ab. Keine automatische Rechnung.');
  if (!validDate(raw.creationDate)) errors.push('Eindeutiges eBay-Bestelldatum fehlt.');

  return {
    ok: errors.length === 0,
    errors,
    draft: errors.length ? null : {
      version: 1, taxMode: 'small_business', source: 'ebay_fulfillment_verified',
      orderId: id, orderedAt: new Date(raw.creationDate).toISOString(),
      seller: validated.seller, buyer, currency: 'EUR',
      lineItems, shipping: euro(shippingCents), discount: euro(discountAbs),
      total: euro(totalCents), note: KLEINUNTERNEHMER_NOTE,
    },
  };
}
