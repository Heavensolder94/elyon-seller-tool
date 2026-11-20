const DEFAULT_CURRENCY = "EUR";

const HEADER_ALIASES = Object.freeze({
  transactionId: ["transaction id", "transaction-id", "transaktions-id", "transaktionsnummer", "transactionid"],
  orderId: ["order id", "order-id", "bestellnummer", "bestell-id", "orderid"],
  payoutId: ["payout id", "payout-id", "auszahlungs-id", "auszahlungsnummer", "payoutid"],
  transactionDate: ["transaction date", "date", "datum", "transaktionsdatum", "buchungsdatum"],
  transactionType: ["transaction type", "type", "typ", "transaktionstyp", "transactiontype"],
  feeType: ["fee type", "gebührentyp", "gebuehrentyp", "feetype"],
  bookingEntry: ["booking entry", "buchung", "soll/haben", "soll haben", "bookingentry"],
  amount: ["amount", "betrag", "bruttobetrag", "transaction amount", "transactionamount"],
  totalFeeAmount: ["total fee amount", "gebühren gesamt", "gebuehren gesamt", "gesamtgebühr", "gesamtgebuehr", "totalfeeamount"],
  netAmount: ["net amount", "nettoauszahlung", "auszahlungsbetrag", "netamount"],
  currency: ["currency", "währung", "waehrung"],
  itemId: ["item id", "artikelnummer", "ebay-artikelnummer", "itemid"],
  title: ["item title", "title", "artikel", "artikeltitel", "produkt"],
  quantity: ["quantity", "menge", "anzahl"],
  memo: ["transaction memo", "memo", "beschreibung", "notiz", "transactionmemo"],
});

const AD_FEE_TYPES = new Set([
  "AD_FEE",
  "PREMIUM_AD_FEES",
  "PROMOTED_LISTINGS_FEE",
  "PROMOTED_OFFSITE_FEE",
]);

const EBAY_FEE_TYPES = new Set([
  "FINAL_VALUE_FEE",
  "FINAL_VALUE_FEE_FIXED_PER_ORDER",
  "FINAL_VALUE_SHIPPING_FEE",
  "PAYMENT_PROCESSING_FEE",
  "INTERNATIONAL_FEE",
  "INSERTION_FEE",
  "BOLD_FEE",
  "CATEGORY_FEATURED_FEE",
  "REGULATORY_OPERATING_FEE",
  "BELOW_STANDARD_FEE",
  "HIGH_ITEM_NOT_AS_DESCRIBED_FEE",
  "PAYMENT_DISPUTE_FEE",
  "EXPRESS_PAYOUT_FEE",
  "OTHER_FEES",
]);

const KNOWN_TRANSACTION_TYPES = new Set([
  "SALE",
  "ORDER",
  "REFUND",
  "CHARGEBACK",
  "DISPUTE",
  "PAYOUT",
  "WITHDRAWAL",
  "TRANSFER",
  "CREDIT",
  "ADJUSTMENT",
  "SHIPPING_LABEL",
  "NON_SALE_CHARGE",
  "SUPPLIER_PURCHASE",
]);

function text(value, max = 10000) {
  const limit = arguments.length >= 3 && Array.isArray(arguments[2]) ? 10000 : max;
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, Number(limit) || 10000);
}

function number(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value).replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!raw) return fallback;
  const normalized = raw.includes(",") && raw.lastIndexOf(",") > raw.lastIndexOf(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoDate(value) {
  const raw = text(value);
  if (!raw) return "";
  const german = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (german) {
    const year = german[3].length === 2 ? Number(`20${german[3]}`) : Number(german[3]);
    const date = new Date(Date.UTC(
      year,
      Number(german[2]) - 1,
      Number(german[1]),
      Number(german[4] || 0),
      Number(german[5] || 0),
      Number(german[6] || 0),
    ));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizedKey(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

function detectDelimiter(source) {
  const first = String(source ?? "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const candidates = [";", "\t", ","];
  return candidates
    .map((delimiter) => ({ delimiter, count: first.split(delimiter).length - 1 }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter || ";";
}

export function parseDelimited(source, explicitDelimiter = "") {
  const input = String(source ?? "").replace(/^\uFEFF/, "");
  const delimiter = explicitDelimiter || detectDelimiter(input);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((entry) => text(entry))) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }

  row.push(field.replace(/\r$/, ""));
  if (row.some((entry) => text(entry))) rows.push(row);
  return { delimiter, rows };
}

function resolveHeaderMap(headers) {
  const normalized = headers.map(normalizedKey);
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const accepted = new Set(aliases.map(normalizedKey));
    const index = normalized.findIndex((header) => accepted.has(header));
    if (index >= 0) map[field] = index;
  }
  return map;
}

function valueAt(row, map, field) {
  const index = map[field];
  return Number.isInteger(index) ? row[index] : "";
}

function inferredTransactionType(row, mappedValue) {
  const mapped = text(mappedValue).toUpperCase();
  if (mapped) return mapped;
  return row.map((entry) => text(entry).toUpperCase()).find((entry) => KNOWN_TRANSACTION_TYPES.has(entry)) || "";
}

function transactionKey(transaction) {
  const type = text(transaction.transactionType || transaction.type).toUpperCase();
  const id = text(transaction.transactionId || transaction.id);
  if (id) return `${type || "UNKNOWN"}:${id}`;
  return [
    type || "UNKNOWN",
    text(transaction.orderId),
    text(transaction.payoutId),
    text(transaction.transactionDate || transaction.date),
    number(transaction.amount).toFixed(2),
    text(transaction.feeType).toUpperCase(),
  ].join(":");
}

function classify({ transactionType, feeType, bookingEntry, memo, amount }) {
  const type = text(transactionType).toUpperCase();
  const fee = text(feeType).toUpperCase();
  const booking = text(bookingEntry).toUpperCase();
  const description = text(memo).toUpperCase();

  if (AD_FEE_TYPES.has(fee) || description.includes("PROMOTED") || description.includes("ANZEIGENGEB")) {
    return "advertising_expense";
  }
  if (EBAY_FEE_TYPES.has(fee) || (type === "NON_SALE_CHARGE" && fee)) {
    return booking === "CREDIT" || number(amount) > 0 ? "fee_credit" : "ebay_fee";
  }
  if (["SALE", "ORDER"].includes(type) || type.includes("VERKAUF")) return "revenue";
  if (["REFUND", "CHARGEBACK", "DISPUTE"].includes(type)) return "refund";
  if (["PAYOUT", "WITHDRAWAL", "TRANSFER"].includes(type)) return "transfer";
  if (["CREDIT", "ADJUSTMENT"].includes(type) && (booking === "CREDIT" || number(amount) > 0)) return "other_income";
  if (type === "SHIPPING_LABEL") return "shipping_expense";
  if (type === "SUPPLIER_PURCHASE") return "supplier_expense";
  if (type === "SUPPLIER_REFUND") return "supplier_refund";
  return number(amount) >= 0 ? "other_income" : "other_expense";
}

function safeOriginal(input = {}) {
  return {
    transactionId: text(input.transactionId || input.id),
    transactionType: text(input.transactionType || input.type),
    transactionDate: text(input.transactionDate || input.date),
    orderId: text(input.orderId),
    payoutId: text(input.payoutId),
    itemId: text(input.itemId),
    feeType: text(input.feeType),
    bookingEntry: text(input.bookingEntry),
    amount: input.amount,
    totalFeeAmount: input.totalFeeAmount,
    netAmount: input.netAmount,
    currency: text(input.currency || input.amount?.currency),
    memo: text(input.memo || input.transactionMemo || input.description),
  };
}

export function normalizeFinanceTransaction(input = {}, source = "manual") {
  const amount = number(input.amount?.value ?? input.amount);
  const totalFeeAmount = Math.abs(number(input.totalFeeAmount?.value ?? input.totalFeeAmount));
  const transactionType = text(input.transactionType || input.type).toUpperCase() || "UNKNOWN";
  const bookingEntry = text(input.bookingEntry).toUpperCase();
  const feeType = text(input.feeType).toUpperCase();
  const record = {
    id: text(input.id || input.transactionId) || `fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    transactionId: text(input.transactionId || input.id),
    orderId: text(input.orderId),
    payoutId: text(input.payoutId),
    itemId: text(input.itemId || input.references?.find?.((entry) => text(entry?.referenceType).toLowerCase().includes("item"))?.referenceId),
    title: text(input.title || input.itemTitle || input.transactionMemo || input.memo) || "eBay-Transaktion",
    transactionDate: isoDate(input.transactionDate || input.date || input.createdAt) || new Date().toISOString(),
    transactionType,
    feeType,
    bookingEntry,
    amount,
    totalFeeAmount,
    netAmount: number(input.netAmount?.value ?? input.netAmount, amount - totalFeeAmount),
    currency: text(input.currency || input.amount?.currency || input.totalFeeAmount?.currency).toUpperCase() || DEFAULT_CURRENCY,
    quantity: Math.max(1, number(input.quantity, 1)),
    memo: text(input.memo || input.transactionMemo || input.description),
    source: text(source || input.source) || "manual",
    status: text(input.status || input.reviewStatus).toLowerCase() || "needs_review",
    documentIds: Array.isArray(input.documentIds) ? [...new Set(input.documentIds.map(text).filter(Boolean))] : [],
    ...(input.supplierReceipt && typeof input.supplierReceipt === "object" ? { supplierReceipt: { ...input.supplierReceipt } } : {}),
    original: input.original && typeof input.original === "object" ? safeOriginal(input.original) : null,
    createdAt: isoDate(input.createdAt) || new Date().toISOString(),
    updatedAt: isoDate(input.updatedAt) || new Date().toISOString(),
    voidedAt: isoDate(input.voidedAt),
    voidReason: text(input.voidReason),
  };
  record.category = transactionType === 'SUPPLIER_REFUND' ? 'supplier_refund' : text(input.category) || classify(record);
  record.dedupeKey = text(input.dedupeKey) || transactionKey(record);
  return record;
}

export function parseEbayCsv(source, options = {}) {
  const parsed = parseDelimited(source, options.delimiter || "");
  if (parsed.rows.length < 2) {
    return { delimiter: parsed.delimiter, headers: [], transactions: [], warnings: ["Die CSV enthält keine Datenzeilen."] };
  }

  const headers = parsed.rows[0].map(text);
  const map = resolveHeaderMap(headers);
  const warnings = [];
  if (map.amount === undefined) warnings.push("Keine Betragsspalte erkannt.");
  if (map.transactionType === undefined && map.feeType === undefined) warnings.push("Kein Transaktions- oder Gebührentyp erkannt.");

  const transactions = parsed.rows.slice(1).map((row, index) => {
    const transactionType = inferredTransactionType(row, valueAt(row, map, "transactionType"));
    const recognized = {
      transactionId: valueAt(row, map, "transactionId") || `csv_${index + 1}`,
      orderId: valueAt(row, map, "orderId"),
      payoutId: valueAt(row, map, "payoutId"),
      transactionDate: valueAt(row, map, "transactionDate"),
      transactionType,
      feeType: valueAt(row, map, "feeType"),
      bookingEntry: valueAt(row, map, "bookingEntry"),
      amount: valueAt(row, map, "amount"),
      totalFeeAmount: valueAt(row, map, "totalFeeAmount"),
      netAmount: valueAt(row, map, "netAmount"),
      currency: valueAt(row, map, "currency"),
      itemId: valueAt(row, map, "itemId"),
      title: valueAt(row, map, "title"),
      quantity: valueAt(row, map, "quantity"),
      memo: valueAt(row, map, "memo"),
    };
    return normalizeFinanceTransaction({ ...recognized, original: recognized }, "ebay_csv");
  });

  return { delimiter: parsed.delimiter, headers, transactions, warnings };
}

function feeRowsFromLineItems(transaction) {
  const rows = [];
  for (const item of Array.isArray(transaction?.orderLineItems) ? transaction.orderLineItems : []) {
    for (const fee of Array.isArray(item?.marketplaceFees) ? item.marketplaceFees : []) {
      rows.push({
        transactionId: `${text(transaction.transactionId)}:${text(item.lineItemId || item.legacyItemId)}:${text(fee.feeType)}`,
        orderId: transaction.orderId,
        payoutId: transaction.payoutId,
        transactionDate: transaction.transactionDate,
        transactionType: "NON_SALE_CHARGE",
        feeType: fee.feeType,
        bookingEntry: "DEBIT",
        amount: -Math.abs(number(fee.amount?.value)),
        currency: fee.amount?.currency,
        itemId: item.legacyItemId || item.lineItemId,
        title: fee.feeMemo || fee.feeType || "eBay-Gebühr",
        memo: fee.feeMemo,
        original: safeOriginal({
          transactionId: transaction.transactionId,
          transactionDate: transaction.transactionDate,
          orderId: transaction.orderId,
          payoutId: transaction.payoutId,
          itemId: item.legacyItemId || item.lineItemId,
          transactionType: "NON_SALE_CHARGE",
          feeType: fee.feeType,
          bookingEntry: "DEBIT",
          amount: -Math.abs(number(fee.amount?.value)),
          currency: fee.amount?.currency,
          memo: fee.feeMemo,
        }),
      });
    }
  }
  return rows;
}

export function normalizeEbayApiTransactions(payload = {}) {
  const output = [];
  for (const transaction of Array.isArray(payload.transactions) ? payload.transactions : []) {
    output.push(normalizeFinanceTransaction({ ...transaction, original: safeOriginal(transaction) }, "ebay_finances_api"));
    for (const fee of feeRowsFromLineItems(transaction)) output.push(normalizeFinanceTransaction(fee, "ebay_finances_api"));
  }
  return mergeTransactions([], output).transactions;
}

export function mergeTransactions(existing = [], incoming = []) {
  const byKey = new Map();
  // Once a refund exists, neither it nor the linked purchase can be silently
  // voided through a stale device. A future explicit reversal must be audited.
  const refundedPurchases = new Set(existing.filter(entry => entry.source === 'supplier_receipt_verified' && entry.category === 'supplier_refund' && entry.supplierReceipt?.kind === 'refund').map(entry => text(entry.supplierReceipt.originalTransactionId)).filter(Boolean));
  for (const entry of existing) {
    const normalized = normalizeFinanceTransaction(entry, entry.source || "existing");
    byKey.set(normalized.dedupeKey, normalized);
  }

  let inserted = 0;
  let updated = 0;
  let duplicates = 0;
  for (const entry of incoming) {
    const normalized = normalizeFinanceTransaction(entry, entry.source || "incoming");
    const previous = byKey.get(normalized.dedupeKey);
    if (!previous) {
      byKey.set(normalized.dedupeKey, normalized);
      inserted += 1;
      continue;
    }
    duplicates += 1;
    // A periodic read must not modify the timestamps of already-known rows.
    if (JSON.stringify(previous) === JSON.stringify(normalized)) continue;
    const next = {
      ...previous,
      ...normalized,
      id: previous.id,
      createdAt: previous.createdAt,
      documentIds: [...new Set([...(previous.documentIds || []), ...(normalized.documentIds || [])])],
      original: previous.original || normalized.original,
      updatedAt: new Date().toISOString(),
    };
    // A receipt-backed cost records a historical allocation. Corrections must
    // use a separate, reviewed process, never a stale browser sync.
    if (previous.source === "supplier_receipt_verified" && previous.supplierReceipt) {
      for (const field of ["transactionId", "dedupeKey", "orderId", "itemId", "transactionDate", "transactionType", "bookingEntry", "amount", "totalFeeAmount", "netAmount", "currency", "quantity", "source", "category", "supplierReceipt"]) next[field] = previous[field];
      if (previous.category === 'supplier_refund' || refundedPurchases.has(previous.transactionId)) {
        next.voidedAt = previous.voidedAt;next.voidReason = previous.voidReason;
        if (normalized.voidedAt || normalized.status === 'voided') next.status = previous.status;
      }
    }
    if (JSON.stringify(previous) !== JSON.stringify(next)) updated += 1;
    byKey.set(normalized.dedupeKey, next);
  }

  return {
    transactions: [...byKey.values()].sort((left, right) => String(right.transactionDate).localeCompare(String(left.transactionDate))),
    inserted,
    updated,
    duplicates,
  };
}

// Pure proposal only. It does not read a supplier, perform a payment or write
// any state. A server handler re-runs the same checks against its revision.
export function buildReceiptCostProposal(doc = {}, allocations = [], transactions = [], documents = [], monthClosures = {}) {
  const errors = [];
  const clean = value => text(value);
  const cents = value => {
    const raw = clean(value).replace(",", ".");
    if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) return null;
    const parts = raw.split(".");
    return Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
  };
  const id = clean(doc.id), sha = clean(doc.sha256).toLowerCase();
  const supplier = clean(doc.supplier), reference = clean(doc.invoiceReference);
  const date = clean(doc.paymentDate);
  const amount = cents(doc.amount);
  if (!id || !/^[a-f0-9]{64}$/.test(sha)) errors.push("Original und SHA-256-Prüfsumme fehlen.");
  if (!clean(doc.cloudFileId)) errors.push("Original zuerst in Drive sichern und Finance synchronisieren.");
  if (!["supplier_invoice", "internal_receipt"].includes(doc.documentType)) errors.push("Nur Lieferantenrechnungen oder gekennzeichnete Eigenbelege können hier Kosten auslösen.");
  if (!supplier || !reference) errors.push("Lieferant und Rechnungs-/Belegreferenz werden für die Dublettenprüfung benötigt.");
  if (clean(doc.currency).toUpperCase() !== "EUR") errors.push("Nur EUR-Beträge; Fremdwährung und Umrechnung müssen gesondert geprüft werden.");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) errors.push("Gültiges tatsächliches Zahlungsdatum erforderlich.");
  if (date && monthClosures?.[date.slice(0, 7)]?.closedAt) errors.push("Der Zahlungsmonat ist abgeschlossen.");
  if (amount === null || amount <= 0) errors.push("Gültiger bezahlter Gesamtbetrag erforderlich.");
  const extraFields = [doc.receiptShippingAmountV1, doc.receiptAdditionalAmountV1].map(value => clean(value) ? cents(value) : 0);
  if (extraFields.some(value => value === null)) errors.push("Versand- oder Zusatzkosten sind ungültig.");
  if (amount !== null && extraFields.every(value => value !== null) && extraFields[0] + extraFields[1] > amount) errors.push("Versand- und Zusatzkosten übersteigen den Gesamtbetrag.");
  if (doc.receiptLineItemsV1 !== undefined && !Array.isArray(doc.receiptLineItemsV1)) errors.push("Ungültige Belegpositionen.");
  if (Array.isArray(doc.receiptLineItemsV1) && doc.receiptLineItemsV1.length) {
    const itemValues = doc.receiptLineItemsV1.map(item => cents(item?.amount));
    if (doc.receiptLineItemsV1.length > 100 || doc.receiptLineItemsV1.some((item, i) => !clean(item?.title) || !Number.isSafeInteger(item?.quantity) || item.quantity < 1 || itemValues[i] === null)) errors.push("Belegpositionen enthalten ungültige Angaben.");
    else if (amount !== null && extraFields.every(value => value !== null) && itemValues.reduce((sum, value) => sum + value, 0) + extraFields[0] + extraFields[1] !== amount) errors.push("Positionen, Versand und Zusatzkosten stimmen nicht mit dem Gesamtbetrag überein.");
  }
  if (!Array.isArray(allocations) || !allocations.length || allocations.length > 50) errors.push("Eine bis 50 Zuordnungen sind erforderlich.");
  const rows = (Array.isArray(allocations) ? allocations.slice(0, 50) : []).map(row => ({ orderId: clean(row.orderId), itemId: clean(row.itemId), cents: cents(row.amount) }));
  if (rows.some(row => !/^[A-Za-z0-9_-]{3,100}$/.test(row.orderId) || row.itemId.length > 200 || row.cents === null || row.cents <= 0)) errors.push("Jede Zuordnung benötigt eine Bestellnummer und einen positiven EUR-Teilbetrag.");
  if (amount !== null && rows.reduce((sum, row) => sum + (row.cents || 0), 0) !== amount) errors.push("Summe der Teilbeträge muss dem bezahlten Gesamtbetrag entsprechen.");
  const comparable = value => clean(value).toLocaleLowerCase("de-DE");
  const duplicate = transactions.some(tx => {
    if (tx.category !== "supplier_expense" && tx.transactionType !== "SUPPLIER_PURCHASE") return false;
    const linked = (Array.isArray(tx.documentIds) ? tx.documentIds : []).map(link => documents.find(item => item.id === link)).filter(Boolean);
    if ((tx.documentIds || []).includes(id)) return true;
    const evidence = [tx.supplierReceipt, ...linked].filter(Boolean);
    return evidence.some(item => (sha && clean(item.sha256).toLowerCase() === sha) || (supplier && reference && comparable(item.supplier) === comparable(supplier) && comparable(item.invoiceReference) === comparable(reference)));
  });
  if (duplicate) errors.push("Zu diesem Beleg oder dieser Lieferanten-/Rechnungsreferenz existieren bereits Lieferantenkosten; Bestandsabgleich nötig.");
  if (errors.length) return { ok: false, errors, allocations: [] };
  return { ok: true, errors: [], allocations: rows.map((row, index) => ({
    transactionId: `receipt_${sha}_${index + 1}`, orderId: row.orderId, itemId: row.itemId,
    transactionDate: date, transactionType: "SUPPLIER_PURCHASE", bookingEntry: "DEBIT", amount: -row.cents / 100,
    currency: "EUR", title: `${supplier} Wareneinkauf`, category: "supplier_expense", status: "needs_review", documentIds: [id],
    supplierReceipt: { documentId: id, sha256: sha, supplier, invoiceReference: reference, documentDate: clean(doc.documentDate), paymentDate: date, totalCents: amount, allocationCents: row.cents },
    source: "supplier_receipt_verified",
  })) };
}

// Records a received supplier refund against one existing purchase allocation.
// It is a reviewable financial event, not a payment or a tax classification.
export function buildSupplierRefundProposal(doc = {}, originalTransactionId = '', transactions = [], monthClosures = {}) {
  const clean = value => String(value ?? '').trim();
  const cents = value => {const s=clean(value).replace(',', '.');if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(s))return null;const [whole,dec='']=s.split('.');return Number(whole)*100+Number((dec+'00').slice(0,2));};
  const errors=[], id=clean(doc.id), sha=clean(doc.sha256).toLowerCase(), supplier=clean(doc.supplier), reference=clean(doc.invoiceReference), date=clean(doc.paymentDate), amount=cents(doc.amount);
  if(!id||!/^[a-f0-9]{64}$/.test(sha)||!clean(doc.cloudFileId))errors.push('Erstattungsnachweis und Cloud-Original mit SHA-256 sind erforderlich.');
  if(doc.documentType!=='refund_proof')errors.push('Nur ein Erstattungsnachweis kann einen Geldzufluss belegen; eine Gutschrift allein reicht nicht.');
  if(!supplier||clean(doc.currency).toUpperCase()!=='EUR'||amount===null||amount<=0)errors.push('Lieferant und ein positiver EUR-Erstattungsbetrag sind erforderlich.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)errors.push('Gültiges tatsächliches Erstattungsdatum erforderlich.');
  if(date&&monthClosures?.[date.slice(0,7)]?.closedAt)errors.push('Der Erstattungsmonat ist abgeschlossen.');
  const originals=transactions.filter(row=>clean(row.transactionId)===clean(originalTransactionId));
  const original=originals.length===1?originals[0]:null;
  const purchase=original?.supplierReceipt;
  if(!original||original.voidedAt||original.source!=='supplier_receipt_verified'||original.category!=='supplier_expense'||!purchase||original.currency!=='EUR'||!Number.isSafeInteger(purchase.allocationCents)||purchase.allocationCents<=0||Number(original.amount)!==-purchase.allocationCents/100||!/^[a-f0-9]{64}$/.test(clean(purchase.sha256))||!clean(purchase.documentId))errors.push('Geprüfte ursprüngliche EUR-Einkaufszuordnung fehlt.');
  if(purchase && (clean(purchase.documentId)===id || clean(purchase.sha256).toLowerCase()===sha))errors.push('Erstattungsnachweis und Einkaufsbeleg müssen getrennte Originale sein.');
  const comparable=value=>clean(value).toLocaleLowerCase('de-DE');
  if(purchase && comparable(purchase.supplier)!==comparable(supplier))errors.push('Lieferant stimmt nicht mit dem ursprünglichen Einkauf überein.');
  if(original && date && clean(original.transactionDate).slice(0,10)>date)errors.push('Erstattung liegt vor dem Zahlungsdatum des Einkaufs.');
  const refundRows=transactions.filter(row=>row.source==='supplier_receipt_verified'&&row.category==='supplier_refund');
  if(refundRows.some(row=>row.supplierReceipt?.kind!=='refund'||!clean(row.supplierReceipt.originalTransactionId)||!clean(row.supplierReceipt.documentId)||!/^[a-f0-9]{64}$/.test(clean(row.supplierReceipt.sha256))))errors.push('Eine frühere Erstattung ist nicht eindeutig nachvollziehbar; manueller Abgleich erforderlich.');
  const previous=refundRows.filter(row=>row.supplierReceipt?.kind==='refund');
  if(previous.some(row=>row.supplierReceipt.documentId===id||clean(row.supplierReceipt.sha256).toLowerCase()===sha||(reference&&comparable(row.supplierReceipt.supplier)===comparable(supplier)&&comparable(row.supplierReceipt.invoiceReference)===comparable(reference))))errors.push('Dieser Erstattungsnachweis oder seine Lieferantenreferenz wurde bereits erfasst.');
  const samePurchase=previous.filter(row=>row.supplierReceipt.originalTransactionId===clean(originalTransactionId));
  if(samePurchase.some(row=>!Number.isSafeInteger(row.supplierReceipt.allocationCents)||row.supplierReceipt.allocationCents<=0||Number(row.amount)!==row.supplierReceipt.allocationCents/100))errors.push('Frühere Erstattung ist widersprüchlich; manueller Abgleich erforderlich.');
  const previousCents=samePurchase.reduce((sum,row)=>sum+(Number.isSafeInteger(row.supplierReceipt.allocationCents)?row.supplierReceipt.allocationCents:0),0);
  if(purchase && amount!==null && previousCents+amount>purchase.allocationCents)errors.push('Erstattungen übersteigen die ursprüngliche Einkaufszuordnung.');
  if(errors.length)return {ok:false,errors,allocations:[]};
  return {ok:true,errors:[],allocations:[{transactionId:`receipt_refund_${sha}`,orderId:original.orderId,itemId:original.itemId,transactionDate:date,transactionType:'SUPPLIER_REFUND',bookingEntry:'CREDIT',amount:amount/100,currency:'EUR',title:`${supplier} Lieferantenerstattung`,category:'supplier_refund',status:'needs_review',documentIds:[id],supplierReceipt:{kind:'refund',documentId:id,sha256:sha,supplier,invoiceReference:reference,documentDate:clean(doc.documentDate),paymentDate:date,originalTransactionId:clean(originalTransactionId),originalDocumentId:purchase.documentId,allocationCents:amount},source:'supplier_receipt_verified'}]};
}

export function bookingProposal(transaction = {}, settings = {}) {
  const item = normalizeFinanceTransaction(transaction, transaction.source || "proposal");
  const templates = {
    revenue: { debit: "eBay-Verrechnung", credit: settings.revenueAccount || "Erlöse", label: "Betriebseinnahme" },
    ebay_fee: { debit: settings.ebayFeeAccount || "eBay-Gebühren", credit: "eBay-Verrechnung", label: "Verkaufsgebühren" },
    advertising_expense: { debit: settings.advertisingAccount || "Werbekosten", credit: "eBay-Verrechnung", label: "eBay-Werbung" },
    refund: { debit: settings.refundAccount || "Erlösminderungen", credit: "eBay-Verrechnung", label: "Kundenrückerstattung" },
    fee_credit: { debit: "eBay-Verrechnung", credit: settings.ebayFeeAccount || "eBay-Gebühren", label: "Gebührengutschrift" },
    shipping_expense: { debit: settings.shippingAccount || "Versandkosten", credit: "eBay-Verrechnung", label: "Versandkosten" },
    supplier_expense: { debit: settings.goodsAccount || "Wareneinkauf", credit: "Lieferanten-Verrechnung", label: "Wareneinkauf" },
    supplier_refund: { debit: "ungeklärt", credit: "ungeklärt", label: "Lieferantenerstattung – steuerlich prüfen" },
    transfer: { debit: "Bank", credit: "eBay-Verrechnung", label: "Auszahlung / Geldtransfer" },
    other_income: { debit: "eBay-Verrechnung", credit: settings.otherIncomeAccount || "Sonstige Erträge", label: "Sonstiger Ertrag" },
    other_expense: { debit: settings.otherExpenseAccount || "Sonstige Kosten", credit: "eBay-Verrechnung", label: "Sonstige Ausgabe" },
  };
  const template = templates[item.category] || templates.other_expense;
  return {
    id: `booking:${item.dedupeKey}`,
    transactionId: item.id,
    date: item.transactionDate,
    orderId: item.orderId,
    category: item.category,
    label: template.label,
    debitAccount: template.debit,
    creditAccount: template.credit,
    amount: Math.abs(item.amount || item.totalFeeAmount),
    currency: item.currency,
    taxCode: item.category === 'supplier_refund' ? '' : text(settings.defaultTaxCode),
    status: item.category === 'supplier_refund' ? 'draft' : item.status === "approved" ? "approved" : "draft",
    note: item.memo || item.title,
    source: item.source,
  };
}

export function calculateMetrics(transactions = []) {
  const active = transactions
    .map((entry) => normalizeFinanceTransaction(entry, entry.source))
    .filter((entry) => !entry.voidedAt);
  const sumCategory = (category) => active
    .filter((entry) => entry.category === category)
    .reduce((sum, entry) => sum + Math.abs(number(entry.amount || entry.totalFeeAmount)), 0);

  const revenue = sumCategory("revenue") + sumCategory("other_income") + sumCategory("fee_credit");
  const refunds = sumCategory("refund");
  const ebayFees = sumCategory("ebay_fee");
  const advertising = sumCategory("advertising_expense");
  const supplierRefund = active.filter(entry => entry.category === 'supplier_refund' && entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const supplier = sumCategory("supplier_expense") - supplierRefund;
  const shipping = sumCategory("shipping_expense");
  const otherExpenses = sumCategory("other_expense");
  const expenses = refunds + ebayFees + advertising + supplier + shipping + otherExpenses;
  const profit = revenue - expenses;

  return {
    revenue,
    refunds,
    ebayFees,
    advertising,
    supplier, supplierRefund,
    shipping,
    otherExpenses,
    expenses,
    profit,
    marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
    payouts: sumCategory("transfer"),
    transactionCount: active.length,
    needsReview: active.filter((entry) => entry.status !== "approved").length,
    documentCoverage: active.length ? active.filter((entry) => entry.documentIds?.length).length / active.length * 100 : 0,
  };
}

function quoteCsv(value, delimiter, numeric = false) {
  const raw = String(value ?? "");
  // Spreadsheet programs may evaluate untrusted CSV cells as formulas, even
  // when the cell is CSV-quoted. Amount columns are generated numbers only.
  const safe = !numeric && /^[\s\u0000-\u001f\ufeff]*[=+@\-\t\r\n]/u.test(raw) ? "'" + raw : raw;
  return safe.includes(delimiter) || /["\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function exportTransactionsCsv(transactions = [], delimiter = ";") {
  const headers = ["Datum", "Transaktions-ID", "Bestellnummer", "Kategorie", "Beschreibung", "Betrag", "Währung", "Status", "Quelle"];
  const rows = transactions.map((entry) => {
    const item = normalizeFinanceTransaction(entry, entry.source);
    return [
      item.transactionDate.slice(0, 10),
      item.transactionId,
      item.orderId,
      item.category,
      item.memo || item.title,
      item.amount.toFixed(2).replace(".", ","),
      item.currency,
      item.status,
      item.source,
    ];
  });
  return [headers, ...rows].map((row, rowIndex) => row.map((value, index) => quoteCsv(value, delimiter, rowIndex > 0 && index === 5)).join(delimiter)).join("\r\n");
}

export function exportDatevPreparation(transactions = [], settings = {}) {
  if (transactions.some(entry => !entry.voidedAt && (entry.category === 'supplier_refund' || text(entry.transactionType).toUpperCase()==='SUPPLIER_REFUND'))) throw new Error('Lieferantenerstattungen benötigen vor dem DATEV-Export eine steuerliche Zuordnung.');
  const delimiter = ";";
  const headers = ["Umsatz", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Belegdatum", "Belegfeld 1", "Buchungstext", "Konto", "Gegenkonto", "Steuerschlüssel", "Elyon-Transaktions-ID"];
  const rows = transactions.filter((entry) => !entry.voidedAt).map((entry) => {
    const proposal = bookingProposal(entry, settings);
    const item = normalizeFinanceTransaction(entry, entry.source);
    const date = item.transactionDate.slice(0, 10).split("-").reverse().join("");
    return [
      proposal.amount.toFixed(2).replace(".", ","),
      ["revenue", "other_income", "fee_credit"].includes(item.category) ? "H" : "S",
      proposal.currency,
      date,
      item.orderId || item.transactionId,
      proposal.label,
      proposal.debitAccount,
      proposal.creditAccount,
      proposal.taxCode,
      item.id,
    ];
  });
  return [headers, ...rows].map((row, rowIndex) => row.map((value, index) => quoteCsv(value, delimiter, rowIndex > 0 && index === 0)).join(delimiter)).join("\r\n");
}


/**
 * A single export gate for both the browser and server. A transaction awaiting
 * review or with an unconverted currency must never leak into a tax working
 * export. Voided entries are excluded, not treated as blockers.
 */
export function getSupplierRefundTaxReview(transaction, reviews = {}) {
  const row=normalizeFinanceTransaction(transaction,transaction?.source);
  if(row.category!=='supplier_refund'||row.source!=='supplier_receipt_verified'||row.supplierReceipt?.kind!=='refund'||row.amount<=0)return null;
  const history=reviews && typeof reviews==='object' ? reviews[row.transactionId] : null;
  if(!Array.isArray(history)||!history.length||history.length>50)return null;
  const amountCents=Math.round(row.amount*100),proofSha=text(row.supplierReceipt.sha256).toLowerCase(),original=text(row.supplierReceipt.originalTransactionId),date=row.transactionDate.slice(0,10);
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||row.amount!==amountCents/100||row.supplierReceipt.allocationCents!==amountCents||!/^[a-f0-9]{64}$/.test(proofSha)||!original)return null;
  for(const review of history)if(!review||review.version!==1||review.confirmed!==true||review.transactionId!==row.transactionId||review.proofSha!==proofSha||review.originalTransactionId!==original||review.amountCents!==amountCents||review.paymentDate!==date||!['expense_reduction','other_income'].includes(review.method)||typeof review.note!=='string'||review.note.trim().length<3||review.note.length>300||Number.isNaN(Date.parse(review.reviewedAt)))return null;
  return history[history.length-1];
}

export function selectApprovedEurTransactions(transactions = [], reviews = {}) {
  const active = transactions.map((entry) => normalizeFinanceTransaction(entry, entry.source))
    .filter((entry) => !entry.voidedAt);
  const unapproved = active.filter((entry) => entry.status !== "approved");
  const foreignCurrencies = [...new Set(active.filter((entry) => entry.currency !== "EUR").map((entry) => entry.currency))];
  const unclassifiedRefundCount = active.filter(entry => entry.category === 'supplier_refund' && !getSupplierRefundTaxReview(entry,reviews)).length;
  return {
    ready: unapproved.length === 0 && foreignCurrencies.length === 0 && unclassifiedRefundCount === 0,
    unapprovedCount: unapproved.length,
    unclassifiedRefundCount,
    foreignCurrencies,
    transactions: active.filter((entry) => entry.status === "approved" && entry.currency === "EUR" && (entry.category !== 'supplier_refund' || getSupplierRefundTaxReview(entry,reviews))),
  };
}

export function buildEurSummary(transactions = [], reviews = {}) {
  const normalized=transactions.map(entry=>normalizeFinanceTransaction(entry,entry.source));
  const excludedRefundCount=normalized.filter(entry=>!entry.voidedAt&&entry.category==='supplier_refund'&&!getSupplierRefundTaxReview(entry,reviews)).length;
  const manualRefundReviews=normalized.filter(entry=>!entry.voidedAt&&entry.category==='supplier_refund').flatMap(entry=>{
    const review=getSupplierRefundTaxReview(entry,reviews);return review?[{transactionId:entry.transactionId,documentId:entry.supplierReceipt.documentId,originalTransactionId:review.originalTransactionId,method:review.method,amount:entry.amount,paymentDate:review.paymentDate,reviewedAt:review.reviewedAt,note:review.note}]:[];
  });
  const workingRows=normalized.flatMap(entry=>{
    if(entry.category!=='supplier_refund')return [entry];
    const review=getSupplierRefundTaxReview(entry,reviews);if(!review)return [];
    return [review.method==='other_income'?{...entry,transactionType:'ADJUSTMENT',category:'other_income'}:entry];
  });
  const metrics = calculateMetrics(workingRows);
  const incomeCents=Math.round(metrics.revenue*100),expenseCents=Math.round(metrics.expenses*100);
  const money=value=>Math.round(value*100)/100;
  return {
    period: "laufender Datenbestand",
    operatingIncome: incomeCents/100,
    operatingExpenses: expenseCents/100,
    surplus: (incomeCents-expenseCents)/100,
    details: {
      refunds: money(metrics.refunds),
      ebayFees: money(metrics.ebayFees),
      advertising: money(metrics.advertising),
      goodsAndSupplier: money(metrics.supplier),
      shipping: money(metrics.shipping),
      otherExpenses: money(metrics.otherExpenses),
    },
    manualRefundReviews,
    disclaimer: "Arbeitsauswertung zur Buchhaltungsvorbereitung; keine Steuererklärung und keine steuerliche Freigabe."+(manualRefundReviews.length ? " Lieferantenerstattungen wurden manuell zugeordnet; die Software prüft die steuerliche Richtigkeit nicht." : "")+(excludedRefundCount ? ` ${excludedRefundCount} Lieferantenerstattungen sind nicht enthalten; steuerliche Zuordnung offen.` : ""),
  };
}

export function createAuditEvent(action, payload = {}, actor = "raoul") {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    action: text(action, 120),
    actor: text(actor, 120) || "seller",
    entityType: text(payload.entityType, 120),
    entityId: text(payload.entityId, 300),
    summary: text(payload.summary, 1000),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  };
}

export const ElyonFinanceCore = Object.freeze({
  parseDelimited,
  parseEbayCsv,
  normalizeFinanceTransaction,
  normalizeEbayApiTransactions,
  mergeTransactions,
  bookingProposal,
  calculateMetrics,
  exportTransactionsCsv,
  exportDatevPreparation,
  buildEurSummary,
  selectApprovedEurTransactions,
  createAuditEvent,
});

if (typeof window !== "undefined") window.ElyonFinanceCore = ElyonFinanceCore;
