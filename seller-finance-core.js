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
    original: input.original && typeof input.original === "object" ? safeOriginal(input.original) : null,
    createdAt: isoDate(input.createdAt) || new Date().toISOString(),
    updatedAt: isoDate(input.updatedAt) || new Date().toISOString(),
    voidedAt: isoDate(input.voidedAt),
    voidReason: text(input.voidReason),
  };
  record.category = text(input.category) || classify(record);
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
    const next = {
      ...previous,
      ...normalized,
      id: previous.id,
      createdAt: previous.createdAt,
      documentIds: [...new Set([...(previous.documentIds || []), ...(normalized.documentIds || [])])],
      original: previous.original || normalized.original,
      updatedAt: new Date().toISOString(),
    };
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
    taxCode: text(settings.defaultTaxCode),
    status: item.status === "approved" ? "approved" : "draft",
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
  const supplier = sumCategory("supplier_expense");
  const shipping = sumCategory("shipping_expense");
  const otherExpenses = sumCategory("other_expense");
  const expenses = refunds + ebayFees + advertising + supplier + shipping + otherExpenses;
  const profit = revenue - expenses;

  return {
    revenue,
    refunds,
    ebayFees,
    advertising,
    supplier,
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

function quoteCsv(value, delimiter) {
  const raw = String(value ?? "");
  return raw.includes(delimiter) || /["\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
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
  return [headers, ...rows].map((row) => row.map((value) => quoteCsv(value, delimiter)).join(delimiter)).join("\r\n");
}

export function exportDatevPreparation(transactions = [], settings = {}) {
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
  return [headers, ...rows].map((row) => row.map((value) => quoteCsv(value, delimiter)).join(delimiter)).join("\r\n");
}

export function buildEurSummary(transactions = []) {
  const metrics = calculateMetrics(transactions);
  return {
    period: "laufender Datenbestand",
    operatingIncome: metrics.revenue,
    operatingExpenses: metrics.expenses,
    surplus: metrics.profit,
    details: {
      refunds: metrics.refunds,
      ebayFees: metrics.ebayFees,
      advertising: metrics.advertising,
      goodsAndSupplier: metrics.supplier,
      shipping: metrics.shipping,
      otherExpenses: metrics.otherExpenses,
    },
    disclaimer: "Arbeitsauswertung zur Buchhaltungsvorbereitung; keine Steuererklärung und keine steuerliche Freigabe.",
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
  createAuditEvent,
});

if (typeof window !== "undefined") window.ElyonFinanceCore = ElyonFinanceCore;
