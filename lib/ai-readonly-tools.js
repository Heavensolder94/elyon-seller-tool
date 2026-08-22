function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = typeof value === "string" ? value.replace(/\s/g, "").replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeJson(value, depth = 0) {
  if (depth > 5) return undefined;
  if (value === null) return null;
  if (["boolean", "number"].includes(typeof value)) return value;
  if (typeof value === "string") return text(value, 12000);
  if (Array.isArray(value)) return value.slice(0, 60).map((entry) => safeJson(entry, depth + 1)).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, entry]) => [text(key, 120), safeJson(entry, depth + 1)])
      .filter(([key, entry]) => key && entry !== undefined)
  );
}

function firstObject(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
}

function firstArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source?.[key])) return source[key];
  }
  return [];
}

function tool(name, description, properties = {}) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties,
      },
    },
  };
}

function limitFromArgs(args, fallback, max) {
  const parsed = Math.trunc(finiteNumber(args?.limit, fallback));
  return Math.max(1, Math.min(max, parsed || fallback));
}

function marginFromContext(input) {
  const product = firstObject(input, ["product", "productData", "sourceProduct"]);
  const purchasePrice = finiteNumber(product.purchasePrice ?? product.costPrice ?? product.buyPrice ?? product.buy, 0);
  const shippingCost = finiteNumber(product.shippingCost ?? product.supplierShipping ?? product.ship, 0);
  const sellingPrice = finiteNumber(product.sellingPrice ?? product.salePrice ?? product.price ?? product.sell, 0);
  const ebayFeePercent = finiteNumber(product.ebayFeePercent ?? product.platformFeePercent ?? product.feePercent, 0);
  const paymentFee = finiteNumber(product.paymentFee ?? product.paymentCost, 0);
  const otherCosts = finiteNumber(product.otherCosts ?? product.additionalCosts, 0);
  const expectedReturnRatePercent = finiteNumber(product.expectedReturnRatePercent ?? product.returnRatePercent, 0);
  const returnCost = finiteNumber(product.returnCost ?? product.expectedReturnCost, 0);

  if (!(sellingPrice > 0)) {
    return { ok: false, available: false, reason: "selling_price_missing" };
  }

  const ebayFee = sellingPrice * (ebayFeePercent / 100);
  const expectedReturnCost = returnCost * (expectedReturnRatePercent / 100);
  const totalCosts = purchasePrice + shippingCost + ebayFee + paymentFee + otherCosts + expectedReturnCost;
  const profit = sellingPrice - totalCosts;
  const marginPercent = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;

  const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  return {
    ok: true,
    available: true,
    currency: text(product.currency, 20) || "EUR",
    sellingPrice: round(sellingPrice),
    purchasePrice: round(purchasePrice),
    shippingCost: round(shippingCost),
    ebayFeePercent: round(ebayFeePercent),
    ebayFee: round(ebayFee),
    paymentFee: round(paymentFee),
    otherCosts: round(otherCosts),
    expectedReturnRatePercent: round(expectedReturnRatePercent),
    expectedReturnCost: round(expectedReturnCost),
    totalCosts: round(totalCosts),
    profit: round(profit),
    marginPercent: round(marginPercent),
  };
}

export function createReadonlyToolRuntime({ contextAccess = {}, input = {} } = {}) {
  const access = plainObject(contextAccess);
  const source = plainObject(input);
  const tools = [];
  const handlers = new Map();
  const scopes = [];

  function register(scope, definition, handler) {
    scopes.push(scope);
    tools.push(definition);
    handlers.set(definition.function.name, handler);
  }

  if (access.product !== false) {
    register(
      "product",
      tool("get_product", "Liest die im aktuellen Elyon-Arbeitsauftrag freigegebenen Produktdaten. Diese Funktion verändert keine Daten."),
      () => ({ ok: true, scope: "product", data: safeJson(firstObject(source, ["product", "productData", "sourceProduct"])) || {} })
    );
    register(
      "margin",
      tool("calculate_margin", "Berechnet Gewinn und Marge ausschließlich aus den im aktuellen Produktkontext vorhandenen Kostendaten. Es werden keine Preise live geändert."),
      () => marginFromContext(source)
    );
  }

  if (access.listing === true) {
    register(
      "listing",
      tool("get_listing", "Liest den freigegebenen Listing-Entwurf aus dem aktuellen Arbeitsauftrag. Kein Publish und keine Änderung."),
      () => ({ ok: true, scope: "listing", data: safeJson(firstObject(source, ["listingDraft", "listing", "draft"])) || {} })
    );
  }

  if (access.market === true) {
    register(
      "market",
      tool("get_market_data", "Liest vorhandene Markt- oder Wettbewerbsdaten aus dem aktuellen Arbeitsauftrag. Führt keine externe Recherche aus."),
      () => ({ ok: true, scope: "market", data: safeJson(firstObject(source, ["market", "marketResearch", "marketCheck", "ebayMarketResearch"])) || {} })
    );
  }

  if (access.orders === true) {
    register(
      "orders",
      tool("get_orders", "Liest freigegebene Bestellungen aus dem aktuellen Arbeitsauftrag. Keine Bestellung, Nachricht, Erstattung oder Fulfillment-Aktion wird ausgelöst.", {
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Maximale Zahl zurückzugebender Bestellungen." },
      }),
      (args) => ({ ok: true, scope: "orders", data: safeJson(firstArray(source, ["orders", "sales"]).slice(0, limitFromArgs(args, 10, 10))) || [] })
    );
  }

  if (access.returns === true) {
    register(
      "returns",
      tool("get_returns", "Liest freigegebene Retourenfälle aus dem aktuellen Arbeitsauftrag. Es wird keine Rückerstattung oder Nachricht ausgelöst.", {
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Maximale Zahl zurückzugebender Retourenfälle." },
      }),
      (args) => ({ ok: true, scope: "returns", data: safeJson(firstArray(source, ["returns", "returnCases"]).slice(0, limitFromArgs(args, 10, 10))) || [] })
    );
  }

  if (access.tasks === true) {
    register(
      "tasks",
      tool("get_agent_tasks", "Liest freigegebene Elyon-Agentenaufgaben aus dem aktuellen Arbeitsauftrag. Es werden keine Tasks verändert oder freigegeben.", {
        limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximale Zahl zurückzugebender Aufgaben." },
      }),
      (args) => ({ ok: true, scope: "tasks", data: safeJson(firstArray(source, ["tasks", "agentTasks"]).slice(0, limitFromArgs(args, 20, 20))) || [] })
    );
  }

  async function execute(name, rawArgs = {}) {
    const normalizedName = text(name, 120);
    const handler = handlers.get(normalizedName);
    if (!handler) {
      return { ok: false, error: "readonly_tool_not_allowed", tool: normalizedName };
    }
    let args = rawArgs;
    if (typeof rawArgs === "string") {
      try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { args = {}; }
    }
    try {
      return safeJson(await handler(plainObject(args))) || { ok: true };
    } catch (error) {
      return { ok: false, error: "readonly_tool_failed", tool: normalizedName, message: text(error?.message, 1000) };
    }
  }

  return {
    tools,
    scopes: Array.from(new Set(scopes)),
    execute,
    readOnly: true,
  };
}
