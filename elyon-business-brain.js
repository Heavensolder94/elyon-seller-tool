(function () {
  "use strict";

  const VERSION = "Elyon Business Brain v1.0";
  const STORAGE_KEYS = {
    brain: "elyon_business_brain_v1",
    state: "elyon_business_state",
    memory: "elyon_brain_memory",
    events: "elyon_brain_events",
    recommendations: "elyon_brain_recommendations",
    agents: "elyon_ai_agents_settings",
    products: "elyonProducts",
    orders: "elyonSales",
    returns: "elyonReturns",
    shopifyReturns: "elyonShopifyReturns",
    suppliers: "elyonSuppliers",
    costs: "elyonCosts",
    invoices: "elyonInvoices",
    settings: "elyonSettings",
  };

  const LIVE_ACTION_BLOCKLIST = new Set([
    "order_product",
    "send_customer_message",
    "publish_ebay_listing",
    "change_price_live",
    "refund_customer",
    "contact_supplier",
    "auto_scale_product",
  ]);

  const AGENT_CONTEXT_MAP = {
    "soul-finance": "finance",
    "soul-guard": "risk",
    "soul-scout": "product",
    "soul-seo": "seo",
    "soul-support": "support",
    "soul-operations": "operations",
    "soul-listing": "listing",
    "soul-pricing": "pricing",
    "soul-supplier": "supplier",
    "soul-compliance": "compliance",
    "soul-returns": "returns",
    "soul-dispatch": "dispatch",
    "soul-inventory": "inventory",
    "soul-review": "review",
  };

  const BRAIN_MODULE_DEFS = [
    { id: "cashflowBrain", name: "Cashflow Brain" },
    { id: "productBrain", name: "Product Brain" },
    { id: "orderBrain", name: "Order Brain" },
    { id: "supplierBrain", name: "Supplier Brain" },
    { id: "riskBrain", name: "Risk Brain" },
    { id: "seoBrain", name: "SEO Brain" },
    { id: "supportBrain", name: "Support Brain" },
    { id: "complianceBrain", name: "Compliance Brain" },
    { id: "forecastBrain", name: "Forecast Brain" },
    { id: "analyticsBrain", name: "Analytics Brain" },
    { id: "agentBrain", name: "Agent Brain" },
    { id: "memoryBrain", name: "Memory Brain" },
    { id: "simulationBrain", name: "Simulation Brain" },
    { id: "decisionBrain", name: "Decision Brain" },
  ];

  const BRAIN_NAMES = BRAIN_MODULE_DEFS.map((item) => item.name);

  const safeNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const average = (list) => {
    const values = Array.isArray(list) ? list.filter((value) => Number.isFinite(value)) : [];
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const sumBy = (list, getter) => (Array.isArray(list) ? list.reduce((sum, item, index) => sum + safeNumber(getter(item, index), 0), 0) : 0);

  const unique = (list) => Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));

  const toArray = (value) => (Array.isArray(value) ? value.slice() : []);

  const text = (value, fallback = "") => {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
  };

  const nowIso = () => new Date().toISOString();

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadCollection(key) {
    const value = readJson(key, []);
    return Array.isArray(value) ? value : [];
  }

  function loadObject(key) {
    const value = readJson(key, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function createDefaultBrainState() {
    return {
      version: VERSION,
      createdAt: nowIso(),
      updatedAt: "",
      lastAnalysisAt: "",
      businessHealth: {
        score: 0,
        status: "watch",
        riskLevel: "medium",
        scalingAbility: "restricted",
        liquidityStability: "watch",
        dataQuality: 0,
        productQuality: 0,
      },
      systemRisk: {
        level: "medium",
        score: 0,
        criticalCount: 0,
        warnings: [],
      },
      dashboardSummary: {
        brainStatus: "booting",
        freeLiquidity: 0,
        topRecommendations: [],
        todayFocus: "",
        securityStatus: "",
      },
      connectedBrains: BRAIN_NAMES.slice(),
      connectedAgents: [],
      lastSimulation: null,
      nextBestActions: [],
      securityStatus: {},
      brainStatus: "idle",
    };
  }

  function createDefaultBusinessState() {
    return {
      version: 1,
      scenario: "live-local",
      notes: "",
      modules: {},
      healthTimeline: [],
      riskTimeline: [],
      focusHistory: [],
    };
  }

  function createDefaultMemoryState() {
    return {
      version: 1,
      winners: [],
      riskyProducts: [],
      riskySuppliers: [],
      successfulDecisions: [],
      cashflowPatterns: [],
      frequentProblems: [],
      riskDevelopments: [],
      lastLearnedAt: "",
    };
  }

  function createDefaultRecommendationsState() {
    return {
      version: 1,
      items: [],
      lastUpdatedAt: "",
    };
  }

  function createDefaultEventState() {
    return {
      version: 1,
      items: [],
      lastUpdatedAt: "",
    };
  }

  function mergeObjects(defaults, saved) {
    const source = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    const next = { ...defaults };
    Object.keys(source).forEach((key) => {
      const savedValue = source[key];
      const defaultValue = defaults[key];
      if (Array.isArray(defaultValue)) {
        next[key] = Array.isArray(savedValue) ? savedValue : defaultValue.slice();
      } else if (defaultValue && typeof defaultValue === "object" && !Array.isArray(defaultValue)) {
        next[key] = mergeObjects(defaultValue, savedValue);
      } else if (savedValue !== undefined) {
        next[key] = savedValue;
      }
    });
    return next;
  }

  function migrateBrainState(savedState) {
    return mergeObjects(createDefaultBrainState(), savedState);
  }

  function getSecuritySettings() {
    const settings = loadObject(STORAGE_KEYS.agents);
    return {
      securityMode: settings.securityMode !== false,
      sandboxMode: settings.sandboxMode !== false,
      autonomyLocked: settings.autonomyLocked !== false,
      advancedMode: settings.advancedMode === true,
      pauseAllAgents: settings.pauseAllAgents === true || settings.pausedAll === true,
    };
  }

  function createDefaultBrainPreferences() {
    const moduleSettings = {};
    BRAIN_MODULE_DEFS.forEach((module) => {
      moduleSettings[module.id] = {
        enabled: true,
        sensitivity: "normal",
        debugLevel: "medium",
      };
    });
    return {
      enabled: true,
      analysisMode: "balanced",
      refreshMode: "onload",
      simulationDefault: "aggressive_scaling",
      debugLevel: "medium",
      moduleSettings,
    };
  }

  function normalizeBrainModuleSettings(saved) {
    const defaults = createDefaultBrainPreferences().moduleSettings;
    const source = saved && typeof saved === "object" ? saved : {};
    const next = {};
    Object.keys(defaults).forEach((key) => {
      const current = source[key] && typeof source[key] === "object" ? source[key] : {};
      next[key] = {
        enabled: current.enabled !== false,
        sensitivity: ["low", "normal", "high"].includes(text(current.sensitivity)) ? text(current.sensitivity) : defaults[key].sensitivity,
        debugLevel: ["low", "medium", "high"].includes(text(current.debugLevel)) ? text(current.debugLevel) : defaults[key].debugLevel,
      };
    });
    return next;
  }

  function getModuleSetting(preferences, moduleId) {
    const settings = normalizeBrainModuleSettings(preferences && preferences.moduleSettings);
    return settings[moduleId] || { enabled: true, sensitivity: "normal", debugLevel: "medium" };
  }

  function withModuleMeta(moduleState, moduleSetting) {
    return {
      ...moduleState,
      enabled: moduleSetting.enabled !== false,
      sensitivity: moduleSetting.sensitivity || "normal",
      debugLevel: moduleSetting.debugLevel || "medium",
    };
  }

  function createDisabledModuleState(name, moduleSetting, extras) {
    return {
      name,
      status: "disabled",
      enabled: false,
      sensitivity: moduleSetting.sensitivity || "normal",
      debugLevel: moduleSetting.debugLevel || "medium",
      ...(extras || {}),
    };
  }

  function createPreparedModuleState(name, moduleSetting, note) {
    if (moduleSetting.enabled === false) {
      return createDisabledModuleState(name, moduleSetting, { note: `${name} ist deaktiviert.` });
    }
    return withModuleMeta({
      name,
      status: "prepared",
      note: note || `${name} ist vorbereitet.`,
    }, moduleSetting);
  }

  function getSensitivityThreshold(moduleSetting, lowValue, normalValue, highValue) {
    const sensitivity = text(moduleSetting && moduleSetting.sensitivity, "normal");
    if (sensitivity === "low") return lowValue;
    if (sensitivity === "high") return highValue;
    return normalValue;
  }

  function getBrainPreferences() {
    const settings = loadObject(STORAGE_KEYS.settings);
    return {
      enabled: settings.brainEnabled !== false,
      analysisMode: ["balanced", "conservative", "aggressive"].includes(text(settings.brainAnalysisMode)) ? text(settings.brainAnalysisMode) : "balanced",
      refreshMode: text(settings.brainRefreshMode) === "manual" ? "manual" : "onload",
      simulationDefault: text(settings.brainSimulationDefault) || "aggressive_scaling",
      debugLevel: ["low", "medium", "high"].includes(text(settings.brainDebugLevel)) ? text(settings.brainDebugLevel) : "medium",
      moduleSettings: normalizeBrainModuleSettings(settings.brainModuleSettings),
    };
  }

  function normalizeProduct(product, index, supplierMap) {
    const source = product && typeof product === "object" ? product : {};
    const buy = safeNumber(source.buy ?? source.purchasePrice ?? source.cost ?? source.einkaufspreis);
    const sell = safeNumber(source.sell ?? source.salePrice ?? source.price ?? source.verkaufspreis);
    const shipping = safeNumber(source.ship ?? source.shipping ?? source.versandkosten);
    const feesPercent = safeNumber(source.feePercent ?? source.fee ?? source.ebayFeePercent, 15);
    const fees = sell > 0 ? sell * (feesPercent / 100) : 0;
    const profit = sell - buy - shipping - fees;
    const margin = sell > 0 ? (profit / sell) * 100 : 0;
    const roi = buy > 0 ? (profit / buy) * 100 : 0;
    const returnsRisk = safeNumber(source.returnRisk ?? source.returnsRisk ?? source.retourenrisiko, 0);
    const dataQuality = [
      text(source.title || source.name),
      buy > 0,
      sell > 0,
      text(source.category),
      text(source.description || source.notes),
    ].filter(Boolean).length / 5;
    const seoQuality = clamp(
      text(source.title || source.name).length >= 40 ? 40 : 18 +
      (text(source.title || source.name).length >= 20 ? 12 : 0) +
      (text(source.description || source.notes).length >= 80 ? 18 : 0) +
      (toArray(source.tags).length >= 3 ? 15 : 0) +
      (text(source.category) ? 15 : 0),
      0,
      100
    );
    const supplierId = text(source.supplierId || source.supplier || source.supplierName);
    const supplier = supplierMap.get(supplierId.toLowerCase()) || null;
    const supplierQuality = supplier ? supplier.score : 50;
    const seasonalPotential = clamp(safeNumber(source.seasonalityScore ?? source.seasonality ?? source.saisonpotenzial, 50), 0, 100);
    let status = "watch";
    if (!text(source.title || source.name) || buy <= 0 || sell <= 0) status = "incomplete";
    else if (margin >= 20 && roi >= 25 && supplierQuality >= 65 && returnsRisk <= 25) status = "winner";
    else if (margin >= 15 && roi >= 15) status = "test";
    else if (margin < 8 || returnsRisk >= 60 || supplierQuality < 35) status = "risky";
    else if (margin < 0 || profit < 0) status = "stop";
    return {
      id: text(source.id, `product-${index + 1}`),
      title: text(source.title || source.name, `Produkt ${index + 1}`),
      buy,
      sell,
      shipping,
      fees,
      profit,
      roi,
      margin,
      returnsRisk,
      dataQuality: Math.round(dataQuality * 100),
      supplierQuality,
      seoQuality,
      seasonalPotential,
      status,
      supplierId,
    };
  }

  function normalizeSupplier(item, index) {
    const source = item && typeof item === "object" ? item : {};
    const deliveryTime = safeNumber(source.deliveryTime ?? source.deliveryDays ?? source.lieferzeit, 0);
    const reliability = clamp(safeNumber(source.reliability ?? source.reliabilityScore ?? source.zuverlaessigkeit, 60), 0, 100);
    const returnRate = clamp(safeNumber(source.returnRate ?? source.returnsRate ?? source.retourenquote, 12), 0, 100);
    const priceLevel = clamp(safeNumber(source.priceLevel ?? source.preisniveau, 50), 0, 100);
    const risk = clamp(
      100 - reliability + (returnRate * 0.7) + (deliveryTime > 14 ? 15 : 0),
      0,
      100
    );
    const platformQuality = clamp(safeNumber(source.platformQuality ?? source.platformScore, 60), 0, 100);
    const score = clamp(Math.round((reliability * 0.42) + ((100 - returnRate) * 0.24) + ((100 - Math.min(priceLevel, 100)) * 0.12) + (platformQuality * 0.22)), 0, 100);
    let status = "normal";
    if (score >= 78 && risk <= 25) status = "trusted";
    else if (score < 45 || risk >= 65) status = "risky";
    else if (score < 60 || risk >= 45) status = "watch";
    return {
      id: text(source.id || source.name || source.supplierName, `supplier-${index + 1}`),
      name: text(source.name || source.supplierName, `Supplier ${index + 1}`),
      deliveryTime,
      reliability,
      returnRate,
      priceLevel,
      risk,
      platformQuality,
      score,
      status,
    };
  }

  function normalizeOrder(item, index, supplierMap) {
    const source = item && typeof item === "object" ? item : {};
    const revenue = safeNumber(source.salePrice ?? source.price ?? source.totalPrice ?? source.amount);
    const supplierCost = safeNumber(source.buyPrice ?? source.cost ?? source.supplierCost ?? source.einkaufspreis);
    const shipping = safeNumber(source.shippingCost ?? source.shipping ?? source.versandkosten);
    const fees = revenue > 0 ? revenue * 0.15 : safeNumber(source.fees ?? source.ebayFees);
    const profit = revenue - supplierCost - shipping - fees;
    const liquidityImpact = supplierCost + shipping;
    const status = text(source.status || source.orderStatus, "open").toLowerCase();
    const supplierKey = text(source.supplierId || source.supplier || source.supplierName).toLowerCase();
    const supplier = supplierMap.get(supplierKey) || null;
    const returnProbability = clamp(safeNumber(source.returnProbability ?? source.returnRisk, supplier ? supplier.returnRate : 12), 0, 100);
    const riskScore = clamp((returnProbability * 0.6) + (profit < 0 ? 30 : 0) + (supplier ? supplier.risk * 0.2 : 8), 0, 100);
    return {
      id: text(source.id || source.saleId || source.orderId, `order-${index + 1}`),
      title: text(source.title || source.productTitle || source.name, `Order ${index + 1}`),
      revenue,
      supplierCost,
      shipping,
      fees,
      profit,
      liquidityImpact,
      status,
      returnProbability,
      riskScore,
    };
  }

  function buildDataset() {
    const suppliersRaw = loadCollection(STORAGE_KEYS.suppliers);
    const suppliers = suppliersRaw.map(normalizeSupplier);
    const supplierMap = new Map();
    suppliers.forEach((supplier) => {
      supplierMap.set(supplier.id.toLowerCase(), supplier);
      supplierMap.set(supplier.name.toLowerCase(), supplier);
    });
    const products = loadCollection(STORAGE_KEYS.products).map((item, index) => normalizeProduct(item, index, supplierMap));
    const orders = loadCollection(STORAGE_KEYS.orders).map((item, index) => normalizeOrder(item, index, supplierMap));
    const returns = loadCollection(STORAGE_KEYS.returns);
    const shopifyReturns = loadCollection(STORAGE_KEYS.shopifyReturns);
    const costs = loadCollection(STORAGE_KEYS.costs);
    const invoices = loadCollection(STORAGE_KEYS.invoices);
    const settings = loadObject(STORAGE_KEYS.settings);
    return {
      products,
      orders,
      suppliers,
      returns,
      shopifyReturns,
      costs,
      invoices,
      settings,
      security: getSecuritySettings(),
    };
  }

  function evaluateCashflowBrain(dataset, preferences, moduleSetting) {
    const mode = preferences && preferences.analysisMode ? preferences.analysisMode : "balanced";
    const sensitivityOffset = getSensitivityThreshold(moduleSetting, -0.015, 0, 0.02);
    const growthOffset = getSensitivityThreshold(moduleSetting, -0.03, 0, 0.03);
    const safetyFactor = (mode === "conservative" ? 0.16 : mode === "aggressive" ? 0.08 : 0.12) + sensitivityOffset;
    const growthFactor = Math.max(0.04, (mode === "conservative" ? 0.08 : mode === "aggressive" ? 0.18 : 0.12) + growthOffset);
    const ordersRevenue = sumBy(dataset.orders, (order) => order.revenue);
    const supplierCosts = sumBy(dataset.orders, (order) => order.supplierCost);
    const runningCosts = sumBy(dataset.costs, (item) => item.amount ?? item.cost ?? item.price ?? item.value);
    const ebayFees = sumBy(dataset.orders, (order) => order.fees);
    const returnsReserve = Math.round((dataset.returns.length + dataset.shopifyReturns.length) * 7.5);
    const safetyReserve = clamp(Math.round((supplierCosts + runningCosts) * safetyFactor), 50, 5000);
    const growthBudget = Math.max(0, Math.round(ordersRevenue * growthFactor));
    const reservedCapital = supplierCosts + returnsReserve + safetyReserve;
    const liquidityBase = sumBy(dataset.invoices, (item) => item.total ?? item.amount ?? item.value) + ordersRevenue;
    const freeLiquidity = liquidityBase - reservedCapital - runningCosts - ebayFees;
    const openSupplierCosts = Math.max(0, supplierCosts - (ordersRevenue * 0.32));
    const cashflowScore = clamp(Math.round(
      55 +
      (freeLiquidity >= 0 ? 18 : -18) +
      (runningCosts ? Math.min(16, (freeLiquidity / Math.max(runningCosts, 1)) * 10) : 10) -
      (returnsReserve > freeLiquidity && freeLiquidity > 0 ? 16 : 0) -
      (openSupplierCosts > freeLiquidity && freeLiquidity > 0 ? 12 : 0)
    ), 0, 100);
    let status = "healthy";
    const warnings = [];
    const criticalLiquidityThreshold = getSensitivityThreshold(moduleSetting, 70, 100, 140);
    if (freeLiquidity < criticalLiquidityThreshold) {
      status = "critical";
      warnings.push("Liquiditaet zu niedrig");
    } else if (freeLiquidity < safetyReserve || openSupplierCosts > freeLiquidity) {
      status = "caution";
      warnings.push("Alles Kapital ist fast gebunden");
    }
    if (growthBudget > Math.max(freeLiquidity, 0) * 0.8 && growthBudget > 0) warnings.push("Skalierung zu aggressiv");
    const forecast = {
      today: freeLiquidity,
      day7: freeLiquidity + (ordersRevenue * 0.18) - (runningCosts * 0.3),
      day14: freeLiquidity + (ordersRevenue * 0.34) - (runningCosts * 0.5),
      day30: freeLiquidity + (ordersRevenue * 0.62) - runningCosts,
    };
    return {
      name: "Cashflow Brain",
      status,
      warnings,
      cashflowScore,
      accountBalance: liquidityBase,
      reservedCapital,
      openSupplierCosts,
      ebayFees,
      returnsReserve,
      toolCosts: runningCosts,
      safetyReserve,
      growthBudget,
      freeLiquidity,
      forecast,
    };
  }

  function evaluateProductBrain(dataset, moduleSetting) {
    const products = dataset.products;
    const marginThreshold = getSensitivityThreshold(moduleSetting, 12, 15, 18);
    const statusCounts = products.reduce((acc, product) => {
      acc[product.status] = (acc[product.status] || 0) + 1;
      return acc;
    }, {});
    return {
      name: "Product Brain",
      products,
      statusCounts,
      averageMargin: average(products.map((product) => product.margin)),
      averageROI: average(products.map((product) => product.roi)),
      topWinners: products
        .filter((product) => product.status === "winner")
        .sort((left, right) => right.profit - left.profit)
        .slice(0, 5),
      riskyProducts: products.filter((product) => ["risky", "stop", "incomplete"].includes(product.status) || product.margin < marginThreshold).slice(0, 6),
    };
  }

  function evaluateOrderBrain(dataset, moduleSetting) {
    const orders = dataset.orders;
    const orderRiskThreshold = getSensitivityThreshold(moduleSetting, 72, 60, 52);
    const riskOrders = orders.filter((order) => order.riskScore >= orderRiskThreshold);
    return {
      name: "Order Brain",
      orders,
      totalProfit: sumBy(orders, (order) => order.profit),
      openOrders: orders.filter((order) => !["fulfilled", "done", "completed"].includes(order.status)).length,
      riskOrders,
      averageReturnProbability: average(orders.map((order) => order.returnProbability)),
      liquidityImpact: sumBy(orders, (order) => order.liquidityImpact),
    };
  }

  function evaluateSupplierBrain(dataset, moduleSetting) {
    const suppliers = dataset.suppliers;
    const riskyThreshold = getSensitivityThreshold(moduleSetting, 78, 65, 55);
    const trustedThreshold = getSensitivityThreshold(moduleSetting, 74, 78, 82);
    return {
      name: "Supplier Brain",
      suppliers,
      trustedSuppliers: suppliers.filter((supplier) => supplier.status === "trusted" || supplier.score >= trustedThreshold),
      riskySuppliers: suppliers.filter((supplier) => supplier.status === "risky" || supplier.risk >= riskyThreshold),
      averageReliability: average(suppliers.map((supplier) => supplier.reliability)),
    };
  }

  function evaluateSEOBrain(dataset, productBrain, supplierBrain, moduleSetting) {
    const products = productBrain.products || [];
    const weakThreshold = getSensitivityThreshold(moduleSetting, 45, 55, 65);
    const strongThreshold = getSensitivityThreshold(moduleSetting, 58, 66, 72);
    const lowSeoProducts = products.filter((product) => product.seoQuality < weakThreshold);
    const highPotentialProducts = products.filter((product) => product.seasonalPotential >= 65 && product.seoQuality < strongThreshold);
    const averageSeoQuality = Math.round(average(products.map((product) => product.seoQuality)));
    const warnings = [];
    let status = "healthy";
    if (averageSeoQuality < strongThreshold || lowSeoProducts.length > Math.max(2, Math.ceil(products.length * 0.35))) {
      status = "caution";
      warnings.push("SEO-Qualitaet nicht stabil genug");
    }
    if (lowSeoProducts.length > Math.max(3, Math.ceil(products.length * 0.5))) {
      status = "critical";
      warnings.push("Zu viele Produkte mit schwacher SEO-Basis");
    }
    if (supplierBrain.riskySuppliers.length) warnings.push("Supplier-Risiken koennen SEO-/Listing-Qualitaet bremsen");
    return {
      name: "SEO Brain",
      status,
      averageSeoQuality,
      lowSeoProducts: lowSeoProducts.slice(0, 8),
      optimizationCandidates: highPotentialProducts.slice(0, 8),
      warnings,
    };
  }

  function evaluateSupportBrain(dataset, orderBrain, moduleSetting) {
    const returnLoad = dataset.returns.length + dataset.shopifyReturns.length;
    const openOrders = orderBrain.openOrders || 0;
    const pressureThreshold = getSensitivityThreshold(moduleSetting, 10, 7, 5);
    const criticalThreshold = getSensitivityThreshold(moduleSetting, 16, 12, 9);
    const supportLoad = returnLoad + openOrders;
    const warnings = [];
    let status = "healthy";
    if (supportLoad >= pressureThreshold || orderBrain.averageReturnProbability > 18) {
      status = "caution";
      warnings.push("Supportlast steigt");
    }
    if (supportLoad >= criticalThreshold || orderBrain.averageReturnProbability > 28) {
      status = "critical";
      warnings.push("Support- und Retourenlast kritisch");
    }
    if (returnLoad > 0) warnings.push("Retouren muessen aufmerksam begleitet werden");
    return {
      name: "Support Brain",
      status,
      returnLoad,
      openOrders,
      supportLoad,
      averageReturnProbability: orderBrain.averageReturnProbability || 0,
      warnings,
    };
  }

  function evaluateComplianceBrain(dataset, productBrain, supplierBrain, seoBrain, supportBrain, moduleSetting) {
    const incompleteProducts = productBrain.products.filter((product) => product.status === "incomplete").length;
    const riskySuppliers = supplierBrain.riskySuppliers.length;
    const weakSeo = (seoBrain.lowSeoProducts || []).length;
    const score = clamp(100 - (incompleteProducts * 18) - (riskySuppliers * 12) - (weakSeo * 6) - ((supportBrain.returnLoad || 0) * 4), 0, 100);
    const warnings = [];
    if (incompleteProducts) warnings.push("Produktdaten sind unvollstaendig");
    if (riskySuppliers) warnings.push("Riskante Supplier brauchen Compliance-Blick");
    if (dataset.security.advancedMode === true && dataset.security.autonomyLocked === false) warnings.push("Erweiterte Modi sichtbar, Autonomie bleibt trotzdem blockiert");
    if ((supportBrain.returnLoad || 0) >= getSensitivityThreshold(moduleSetting, 10, 7, 5)) warnings.push("Ruecklaeufer und Supportfaelle sauber dokumentieren");
    let level = "low";
    if (score < 75 || warnings.length >= 2) level = "medium";
    if (score < 55 || warnings.length >= 3) level = "high";
    if (score < 35) level = "critical";
    return {
      name: "Compliance Brain",
      level,
      score,
      incompleteProducts,
      warnings,
    };
  }

  function evaluateRiskBrain(dataset, cashflowBrain, productBrain, orderBrain, supplierBrain, seoBrain, supportBrain, complianceBrain, moduleSetting) {
    const warnings = [];
    const categories = [];
    if (cashflowBrain.status !== "healthy") {
      warnings.push("Cashflow-Risiko aktiv");
      categories.push({ type: "cashflow", level: cashflowBrain.status === "critical" ? "critical" : "high" });
    }
    if (productBrain.riskyProducts.some((product) => product.margin < 15)) {
      warnings.push("Margenprobleme erkannt");
      categories.push({ type: "margin", level: "high" });
    }
    if (supplierBrain.riskySuppliers.length) {
      warnings.push("Supplier-Risiko erkannt");
      categories.push({ type: "supplier", level: "high" });
    }
    if (orderBrain.averageReturnProbability > 18 || dataset.returns.length + dataset.shopifyReturns.length > Math.max(3, dataset.orders.length * 0.2)) {
      warnings.push("Retouren- oder eBay-Risiko erhoeht");
      categories.push({ type: "ebay", level: "medium" });
    }
    if (productBrain.riskyProducts.some((product) => product.dataQuality < 50)) {
      warnings.push("Datenprobleme bremsen Entscheidungen");
      categories.push({ type: "data", level: "medium" });
    }
    if (dataset.security.advancedMode === true && dataset.security.autonomyLocked === false) {
      warnings.push("Erweiterte Modi sichtbar, Live-Aktionen bleiben dennoch blockiert");
      categories.push({ type: "scaling", level: "medium" });
    }
    if (seoBrain.status === "critical") {
      warnings.push("SEO-Risiko erkannt");
      categories.push({ type: "seo", level: "medium" });
    }
    if (supportBrain.status === "critical") {
      warnings.push("Support-Risiko erkannt");
      categories.push({ type: "support", level: "high" });
    }
    if (["high", "critical"].includes(text(complianceBrain.level))) {
      warnings.push("Compliance-Risiko erkannt");
      categories.push({ type: "compliance", level: text(complianceBrain.level) === "critical" ? "critical" : "high" });
    }
    const levelOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    const level = categories.reduce((best, item) => (levelOrder[item.level] > levelOrder[best] ? item.level : best), "low");
    const sensitivityBoost = getSensitivityThreshold(moduleSetting, -4, 0, 8);
    return {
      name: "Risk Brain",
      level,
      warnings,
      categories,
      score: clamp((categories.length * 17) + (cashflowBrain.status === "critical" ? 25 : 0) + sensitivityBoost, 0, 100),
    };
  }

  function evaluateForecastBrain(dataset, cashflowBrain, orderBrain, moduleSetting) {
    const payouts = orderBrain.orders.filter((order) => order.revenue > 0);
    const expectedPayouts7 = sumBy(payouts.slice(0, 10), (order) => order.revenue * 0.45);
    const expectedPayouts14 = sumBy(payouts.slice(0, 18), (order) => order.revenue * 0.7);
    const expectedPayouts30 = sumBy(payouts, (order) => order.revenue * 0.9);
    const supplierCosts = sumBy(orderBrain.orders, (order) => order.supplierCost);
    const fixedCosts = sumBy(dataset.costs, (item) => item.amount ?? item.cost ?? item.price ?? item.value);
    const possibleReturns = (dataset.returns.length + dataset.shopifyReturns.length) * 8;
    const cautionBuffer = getSensitivityThreshold(moduleSetting, 0, 40, 90);
    return {
      name: "Forecast Brain",
      today: cashflowBrain.forecast.today,
      day7: cashflowBrain.freeLiquidity + expectedPayouts7 - (supplierCosts * 0.28) - (fixedCosts * 0.3) - possibleReturns - cautionBuffer,
      day14: cashflowBrain.freeLiquidity + expectedPayouts14 - (supplierCosts * 0.5) - (fixedCosts * 0.55) - possibleReturns - cautionBuffer,
      day30: cashflowBrain.freeLiquidity + expectedPayouts30 - supplierCosts - fixedCosts - possibleReturns - cautionBuffer,
      expectedPayouts: {
        day7: expectedPayouts7,
        day14: expectedPayouts14,
        day30: expectedPayouts30,
      },
    };
  }

  function evaluateAnalyticsBrain(productBrain, riskBrain, cashflowBrain, dataset) {
    const trend = productBrain.topWinners.length >= 2 ? "positive" : productBrain.riskyProducts.length > productBrain.topWinners.length ? "negative" : "mixed";
    return {
      name: "Analytics Brain",
      trends: [
        { key: "gewinnentwicklung", value: cashflowBrain.cashflowScore >= 65 ? "aufwaerts" : "instabil" },
        { key: "risikoentwicklung", value: riskBrain.level },
        { key: "produktentwicklung", value: trend },
        { key: "supplierentwicklung", value: dataset.suppliers.length ? average(dataset.suppliers.map((supplier) => supplier.score)).toFixed(0) : "0" },
      ],
      healthTimeline: [],
      riskTimeline: [],
    };
  }

  function evaluateMemoryBrain(productBrain, supplierBrain, riskBrain) {
    const memory = mergeObjects(createDefaultMemoryState(), loadObject(STORAGE_KEYS.memory));
    const next = {
      ...memory,
      winners: unique(memory.winners.concat(productBrain.topWinners.map((product) => product.title))).slice(-20),
      riskyProducts: unique(memory.riskyProducts.concat(productBrain.riskyProducts.map((product) => product.title))).slice(-20),
      riskySuppliers: unique(memory.riskySuppliers.concat(supplierBrain.riskySuppliers.map((supplier) => supplier.name))).slice(-20),
      successfulDecisions: unique(memory.successfulDecisions.concat(productBrain.topWinners.slice(0, 2).map((product) => `Winner gehalten: ${product.title}`))).slice(-20),
      cashflowPatterns: unique(memory.cashflowPatterns.concat(riskBrain.level === "critical" ? ["Liquiditaet unter Druck"] : ["Cashflow stabilisierbar"])).slice(-20),
      frequentProblems: unique(memory.frequentProblems.concat(productBrain.riskyProducts.map((product) => product.status))).slice(-20),
      riskDevelopments: unique(memory.riskDevelopments.concat(riskBrain.warnings)).slice(-20),
      lastLearnedAt: nowIso(),
    };
    writeJson(STORAGE_KEYS.memory, next);
    return {
      name: "Memory Brain",
      memory: next,
    };
  }

  function evaluateDecisionBrain(cashflowBrain, productBrain, supplierBrain, riskBrain) {
    const decisions = [];
    if (cashflowBrain.freeLiquidity < 100) decisions.push({ type: "cashflow_stabilisieren", label: "Cashflow stabilisieren", priority: "critical" });
    if (cashflowBrain.freeLiquidity < 100) decisions.push({ type: "stop_scaling", label: "Skalierung stoppen", priority: "high" });
    if (productBrain.riskyProducts.length) decisions.push({ type: "review_product", label: "Produkt stoppen oder testen", priority: "high" });
    if (supplierBrain.riskySuppliers.length) decisions.push({ type: "check_supplier", label: "Supplier pruefen", priority: "high" });
    if (riskBrain.level === "critical") decisions.push({ type: "warn_risk", label: "Risiko warnen", priority: "critical" });
    if (cashflowBrain.freeLiquidity >= 250 && riskBrain.level === "low") decisions.push({ type: "allow_scaling", label: "Skalierung vorbereiten", priority: "normal" });
    return {
      name: "Decision Brain",
      decisions,
    };
  }

  function evaluateSimulationBrain(dataset, cashflowBrain, decisionBrain, preferences, lastSimulation, moduleSetting) {
    const recommendedScenarios = [];
    if (cashflowBrain.freeLiquidity < 150) recommendedScenarios.push("payout_delay");
    if (dataset.returns.length + dataset.shopifyReturns.length > 0) recommendedScenarios.push("multi_returns");
    if ((cashflowBrain.growthBudget || 0) > Math.max(80, cashflowBrain.freeLiquidity * 0.6)) recommendedScenarios.push("aggressive_scaling");
    if ((decisionBrain.decisions || []).some((item) => item.type === "check_supplier")) recommendedScenarios.push("supplier_cost_spike");
    if (!recommendedScenarios.length) recommendedScenarios.push(preferences.simulationDefault || "new_product_test");
    const readinessThreshold = getSensitivityThreshold(moduleSetting, 60, 120, 180);
    return {
      name: "Simulation Brain",
      status: cashflowBrain.freeLiquidity < readinessThreshold ? "caution" : "ready",
      defaultScenario: preferences.simulationDefault || "aggressive_scaling",
      recommendedScenarios: unique(recommendedScenarios).slice(0, 5),
      lastSimulation: lastSimulation || null,
      note: cashflowBrain.freeLiquidity < readinessThreshold ? "Simulationen nur eng begleitet auswerten." : "Simulationen koennen fuer Testszenarien genutzt werden.",
    };
  }

  function evaluateBusinessHealth(cashflowBrain, productBrain, riskBrain, supplierBrain) {
    const liquidityStability = cashflowBrain.status === "healthy" ? "stable" : cashflowBrain.status === "caution" ? "watch" : "danger";
    const dataQuality = average(productBrain.products.map((product) => product.dataQuality));
    const productQuality = average(productBrain.products.map((product) => clamp(product.margin + product.seoQuality * 0.25, 0, 100)));
    const supplierQuality = average(supplierBrain.suppliers.map((supplier) => supplier.score));
    const score = clamp(Math.round(
      (cashflowBrain.cashflowScore * 0.34) +
      (Math.max(0, 100 - riskBrain.score) * 0.26) +
      (dataQuality * 0.14) +
      (productQuality * 0.16) +
      (supplierQuality * 0.1)
    ), 0, 100);
    let status = "stable";
    if (score >= 78) status = "strong";
    else if (score < 60) status = "watch";
    else if (score < 40) status = "danger";
    if (riskBrain.level === "critical" || cashflowBrain.status === "critical") status = "danger";
    return {
      score,
      status,
      riskLevel: riskBrain.level,
      scalingAbility: cashflowBrain.freeLiquidity >= 250 && riskBrain.level !== "critical" ? "possible" : "restricted",
      liquidityStability,
      dataQuality: Math.round(dataQuality),
      productQuality: Math.round(productQuality),
    };
  }

  function buildRecommendations(cashflowBrain, productBrain, supplierBrain, riskBrain, forecastBrain, seoBrain, supportBrain, complianceBrain) {
    const items = [];
    if (cashflowBrain.freeLiquidity < 100) {
      items.push({ id: "rec-liquidity-stop-scaling", type: "cashflow", priority: "critical", title: "Skalierung sofort bremsen", detail: "Freie Liquiditaet liegt unter 100 EUR." });
    }
    if (productBrain.riskyProducts.some((product) => product.margin < 15)) {
      items.push({ id: "rec-margin-cleanup", type: "product", priority: "high", title: "Schwache Marge bereinigen", detail: "Produkte unter 15% Marge pruefen oder pausieren." });
    }
    if (supplierBrain.riskySuppliers.length) {
      items.push({ id: "rec-supplier-review", type: "supplier", priority: "high", title: "Riskante Supplier manuell pruefen", detail: `${supplierBrain.riskySuppliers.length} Supplier im Watch-/Risk-Modus.` });
    }
    if (forecastBrain.day7 < 0) {
      items.push({ id: "rec-build-reserve", type: "reserve", priority: "high", title: "Retourenreserve aufbauen", detail: "7-Tage-Forecast faellt unter Null." });
    }
    if (seoBrain.status === "critical" || (seoBrain.lowSeoProducts || []).length >= 3) {
      items.push({ id: "rec-seo-rework", type: "seo", priority: "high", title: "SEO-Basis nachziehen", detail: "Mehrere Produkte haben schwache SEO-Qualitaet oder fehlen in der Listing-Basis." });
    }
    if (supportBrain.status === "critical") {
      items.push({ id: "rec-support-stabilize", type: "support", priority: "high", title: "Supportlast stabilisieren", detail: "Ruecklaeufer, offene Orders oder Support-Signale steigen zu stark an." });
    }
    if (["high", "critical"].includes(text(complianceBrain.level))) {
      items.push({ id: "rec-compliance-review", type: "compliance", priority: text(complianceBrain.level) === "critical" ? "critical" : "high", title: "Compliance manuell pruefen", detail: "Mehrere Regel- oder Sicherheits-Signale brauchen Aufmerksamkeit." });
    }
    if (!items.length) {
      items.push({ id: "rec-healthy-continue", type: "ops", priority: "normal", title: "Gesunde Basis halten", detail: "Winners nach Datenqualitaet und SEO priorisieren." });
    }
    return items;
  }

  function buildAgentBrain(dataset, recommendations, health, riskBrain) {
    const connectedAgents = [
      "Soul Finance",
      "Soul Guard",
      "Soul Scout",
      "Soul SEO",
      "Soul Support",
      "Soul Operations",
      "Soul Listing",
      "Soul Pricing",
      "Soul Supplier",
      "Soul Compliance",
      "Soul Returns",
      "Soul Dispatch",
      "Soul Inventory",
      "Soul Review",
    ];
    const roleRecommendationMap = {
      finance: ["cashflow", "reserve"],
      risk: ["cashflow", "compliance", "supplier"],
      product: ["product", "seo"],
      seo: ["seo", "product"],
      support: ["support", "reserve"],
      operations: ["ops", "supplier", "cashflow"],
      listing: ["seo", "product"],
      pricing: ["cashflow", "product"],
      supplier: ["supplier", "compliance"],
      compliance: ["compliance", "supplier"],
      returns: ["support", "reserve"],
      dispatch: ["ops", "supplier"],
      inventory: ["product", "cashflow"],
      review: ["risk", "compliance"],
    };
    const contexts = {};
    Object.keys(AGENT_CONTEXT_MAP).forEach((agentKey) => {
      const role = AGENT_CONTEXT_MAP[agentKey];
      const recommendationTypes = roleRecommendationMap[role] || [];
      contexts[agentKey] = {
        role,
        health,
        warnings: riskBrain.warnings.slice(0, 4),
        recommendations: recommendations.filter((item) => item.priority === "critical" || recommendationTypes.includes(item.type)).slice(0, 4),
        contextData: {
          products: dataset.products.length,
          orders: dataset.orders.length,
          suppliers: dataset.suppliers.length,
          returns: dataset.returns.length + dataset.shopifyReturns.length,
        },
        autonomousActionsAllowed: false,
      };
    });
    return {
      name: "Agent Brain",
      connectedAgents,
      contexts,
    };
  }

  function simulateScenario(dataset, type, input) {
    const cashflowBrain = evaluateCashflowBrain(dataset, getBrainPreferences());
    let liquidityImpact = 0;
    let risk = "medium";
    if (type === "new_product_test") liquidityImpact = -safeNumber(input?.buyCost, 60);
    if (type === "multi_returns") liquidityImpact = -(safeNumber(input?.count, 3) * safeNumber(input?.avgRefund, 20));
    if (type === "supplier_cost_spike") liquidityImpact = -(safeNumber(input?.increase, 15) * Math.max(1, dataset.orders.length));
    if (type === "payout_delay") liquidityImpact = -(safeNumber(input?.delayCost, 120));
    if (type === "aggressive_scaling") liquidityImpact = -(Math.max(150, cashflowBrain.growthBudget * 1.5));
    if (type === "high_fees") liquidityImpact = -(safeNumber(input?.extraFees, 80));
    const resultingLiquidity = cashflowBrain.freeLiquidity + liquidityImpact;
    if (resultingLiquidity < 0) risk = "critical";
    else if (resultingLiquidity < 100) risk = "high";
    else if (resultingLiquidity < 220) risk = "medium";
    else risk = "low";
    return {
      type,
      risk,
      liquidityImpact,
      resultingLiquidity,
      recommendation: resultingLiquidity < 100
        ? "Szenario nur als Test behandeln, echte Umsetzung nicht freigeben."
        : "Szenario ist beobachtbar, aber weiter nur manuell begleitet.",
      createdAt: nowIso(),
    };
  }

  function storeRecommendationSnapshot(items) {
    const state = mergeObjects(createDefaultRecommendationsState(), loadObject(STORAGE_KEYS.recommendations));
    state.items = items.slice(0, 12);
    state.lastUpdatedAt = nowIso();
    writeJson(STORAGE_KEYS.recommendations, state);
  }

  function pushEvent(eventName, detail) {
    const state = mergeObjects(createDefaultEventState(), loadObject(STORAGE_KEYS.events));
    const entry = {
      id: `brain-event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      eventName,
      createdAt: nowIso(),
      detail: detail && typeof detail === "object" ? detail : {},
    };
    state.items = [entry].concat(toArray(state.items)).slice(0, 60);
    state.lastUpdatedAt = entry.createdAt;
    writeJson(STORAGE_KEYS.events, state);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent(eventName, { detail: entry.detail }));
    }
    return entry;
  }

  function getNextBestActionsFromRecommendations(items, health) {
    const fallbackFocus = health.status === "danger" ? "Liquiditaet und Risiko zuerst stabilisieren." : "Winners und Datenqualitaet gezielt ausbauen.";
    return {
      todayFocus: items[0] ? items[0].title : fallbackFocus,
      items: items.slice(0, 5),
    };
  }

  const ElyonBusinessBrain = {
    version: VERSION,
    migrateBrainState,
    initBrain() {
      const brainState = migrateBrainState(loadObject(STORAGE_KEYS.brain));
      const businessState = mergeObjects(createDefaultBusinessState(), loadObject(STORAGE_KEYS.state));
      const memoryState = mergeObjects(createDefaultMemoryState(), loadObject(STORAGE_KEYS.memory));
      const recommendationsState = mergeObjects(createDefaultRecommendationsState(), loadObject(STORAGE_KEYS.recommendations));
      const eventState = mergeObjects(createDefaultEventState(), loadObject(STORAGE_KEYS.events));
      writeJson(STORAGE_KEYS.brain, brainState);
      writeJson(STORAGE_KEYS.state, businessState);
      writeJson(STORAGE_KEYS.memory, memoryState);
      writeJson(STORAGE_KEYS.recommendations, recommendationsState);
      writeJson(STORAGE_KEYS.events, eventState);
      pushEvent("elyon:brain-ready", { version: VERSION });
      return this.recalculateAll();
    },
    getBrainState() {
      return migrateBrainState(loadObject(STORAGE_KEYS.brain));
    },
    updateBrainState(patch) {
      const next = mergeObjects(this.getBrainState(), patch && typeof patch === "object" ? patch : {});
      next.updatedAt = nowIso();
      writeJson(STORAGE_KEYS.brain, next);
      pushEvent("elyon:brain-updated", { reason: "manual-update" });
      return next;
    },
    recalculateAll() {
      const dataset = buildDataset();
      const preferences = getBrainPreferences();
      const existingState = this.getBrainState();
      const moduleSettings = preferences.moduleSettings || createDefaultBrainPreferences().moduleSettings;
      if (preferences.enabled === false) {
        const disabledState = {
          ...existingState,
          updatedAt: nowIso(),
          lastAnalysisAt: nowIso(),
          dashboardSummary: {
            brainStatus: "disabled",
            freeLiquidity: 0,
            topRecommendations: [],
            todayFocus: "Business Brain ist deaktiviert. Aktiviere es in den Einstellungen.",
            securityStatus: "Deaktiviert",
          },
          connectedBrains: BRAIN_NAMES.slice(),
          connectedAgents: [],
          nextBestActions: [],
          securityStatus: dataset.security,
          brainStatus: "disabled",
          preferences,
          modules: {},
        };
        writeJson(STORAGE_KEYS.brain, disabledState);
        pushEvent("elyon:brain-updated", { reason: "disabled" });
        return disabledState;
      }
      const cashflowSetting = getModuleSetting(preferences, "cashflowBrain");
      const productSetting = getModuleSetting(preferences, "productBrain");
      const orderSetting = getModuleSetting(preferences, "orderBrain");
      const supplierSetting = getModuleSetting(preferences, "supplierBrain");
      const seoSetting = getModuleSetting(preferences, "seoBrain");
      const supportSetting = getModuleSetting(preferences, "supportBrain");
      const complianceSetting = getModuleSetting(preferences, "complianceBrain");
      const riskSetting = getModuleSetting(preferences, "riskBrain");
      const forecastSetting = getModuleSetting(preferences, "forecastBrain");
      const analyticsSetting = getModuleSetting(preferences, "analyticsBrain");
      const memorySetting = getModuleSetting(preferences, "memoryBrain");
      const decisionSetting = getModuleSetting(preferences, "decisionBrain");
      const simulationSetting = getModuleSetting(preferences, "simulationBrain");
      const agentSetting = getModuleSetting(preferences, "agentBrain");

      const cashflowBrain = cashflowSetting.enabled !== false
        ? withModuleMeta(evaluateCashflowBrain(dataset, preferences, cashflowSetting), cashflowSetting)
        : createDisabledModuleState("Cashflow Brain", cashflowSetting, {
            warnings: [],
            cashflowScore: 0,
            accountBalance: 0,
            reservedCapital: 0,
            openSupplierCosts: 0,
            ebayFees: 0,
            returnsReserve: 0,
            toolCosts: 0,
            safetyReserve: 0,
            growthBudget: 0,
            freeLiquidity: 0,
            forecast: { today: 0, day7: 0, day14: 0, day30: 0 },
          });
      const productBrain = productSetting.enabled !== false
        ? withModuleMeta(evaluateProductBrain(dataset, productSetting), productSetting)
        : createDisabledModuleState("Product Brain", productSetting, {
            products: [],
            statusCounts: {},
            averageMargin: 0,
            averageROI: 0,
            topWinners: [],
            riskyProducts: [],
          });
      const orderBrain = orderSetting.enabled !== false
        ? withModuleMeta(evaluateOrderBrain(dataset, orderSetting), orderSetting)
        : createDisabledModuleState("Order Brain", orderSetting, {
            orders: [],
            totalProfit: 0,
            openOrders: 0,
            riskOrders: [],
            averageReturnProbability: 0,
            liquidityImpact: 0,
          });
      const supplierBrain = supplierSetting.enabled !== false
        ? withModuleMeta(evaluateSupplierBrain(dataset, supplierSetting), supplierSetting)
        : createDisabledModuleState("Supplier Brain", supplierSetting, {
            suppliers: [],
            trustedSuppliers: [],
            riskySuppliers: [],
            averageReliability: 0,
          });
      const seoBrain = seoSetting.enabled !== false
        ? withModuleMeta(evaluateSEOBrain(dataset, productBrain, supplierBrain, seoSetting), seoSetting)
        : createDisabledModuleState("SEO Brain", seoSetting, {
            averageSeoQuality: 0,
            lowSeoProducts: [],
            optimizationCandidates: [],
            warnings: [],
          });
      const supportBrain = supportSetting.enabled !== false
        ? withModuleMeta(evaluateSupportBrain(dataset, orderBrain, supportSetting), supportSetting)
        : createDisabledModuleState("Support Brain", supportSetting, {
            returnLoad: 0,
            openOrders: 0,
            supportLoad: 0,
            averageReturnProbability: 0,
            warnings: [],
          });
      const complianceBrain = complianceSetting.enabled !== false
        ? withModuleMeta(evaluateComplianceBrain(dataset, productBrain, supplierBrain, seoBrain, supportBrain, complianceSetting), complianceSetting)
        : createDisabledModuleState("Compliance Brain", complianceSetting, {
            level: "low",
            score: 100,
            incompleteProducts: 0,
            warnings: [],
          });
      const riskBrain = riskSetting.enabled !== false
        ? withModuleMeta(evaluateRiskBrain(dataset, cashflowBrain, productBrain, orderBrain, supplierBrain, seoBrain, supportBrain, complianceBrain, riskSetting), riskSetting)
        : createDisabledModuleState("Risk Brain", riskSetting, {
            level: "low",
            warnings: [],
            categories: [],
            score: 0,
          });
      const forecastBrain = forecastSetting.enabled !== false
        ? withModuleMeta(evaluateForecastBrain(dataset, cashflowBrain, orderBrain, forecastSetting), forecastSetting)
        : createDisabledModuleState("Forecast Brain", forecastSetting, {
            today: 0,
            day7: 0,
            day14: 0,
            day30: 0,
            expectedPayouts: { day7: 0, day14: 0, day30: 0 },
          });
      const analyticsBrain = analyticsSetting.enabled !== false
        ? withModuleMeta(evaluateAnalyticsBrain(productBrain, riskBrain, cashflowBrain, dataset), analyticsSetting)
        : createDisabledModuleState("Analytics Brain", analyticsSetting, {
            trends: [],
            healthTimeline: [],
            riskTimeline: [],
          });
      const decisionBrain = decisionSetting.enabled !== false
        ? withModuleMeta(evaluateDecisionBrain(cashflowBrain, productBrain, supplierBrain, riskBrain), decisionSetting)
        : createDisabledModuleState("Decision Brain", decisionSetting, {
            decisions: [],
          });
      const memoryBrain = memorySetting.enabled !== false
        ? withModuleMeta(evaluateMemoryBrain(productBrain, supplierBrain, riskBrain), memorySetting)
        : createDisabledModuleState("Memory Brain", memorySetting, {
            memory: mergeObjects(createDefaultMemoryState(), loadObject(STORAGE_KEYS.memory)),
          });
      const health = evaluateBusinessHealth(cashflowBrain, productBrain, riskBrain, supplierBrain);
      const recommendations = buildRecommendations(cashflowBrain, productBrain, supplierBrain, riskBrain, forecastBrain, seoBrain, supportBrain, complianceBrain);
      const agentBrain = agentSetting.enabled !== false
        ? withModuleMeta(buildAgentBrain(dataset, recommendations, health, riskBrain), agentSetting)
        : createDisabledModuleState("Agent Brain", agentSetting, {
            connectedAgents: [],
            contexts: {},
          });
      const simulationBrain = simulationSetting.enabled !== false
        ? withModuleMeta(evaluateSimulationBrain(dataset, cashflowBrain, decisionBrain, preferences, existingState.lastSimulation || null, simulationSetting), simulationSetting)
        : createDisabledModuleState("Simulation Brain", simulationSetting, {
            defaultScenario: preferences.simulationDefault || "aggressive_scaling",
            recommendedScenarios: [],
            lastSimulation: existingState.lastSimulation || null,
            note: "Simulation Brain ist deaktiviert.",
          });
      const nextActions = getNextBestActionsFromRecommendations(recommendations, health);
      storeRecommendationSnapshot(recommendations);
      const lastSimulation = existingState.lastSimulation || null;
      const modulesMap = {
        cashflowBrain,
        productBrain,
        orderBrain,
        supplierBrain,
        riskBrain,
        seoBrain,
        supportBrain,
        complianceBrain,
        forecastBrain,
        analyticsBrain,
        decisionBrain,
        memoryBrain,
        simulationBrain,
        agentBrain,
      };
      const connectedBrainNames = BRAIN_MODULE_DEFS
        .filter((item) => !(modulesMap[item.id] && modulesMap[item.id].enabled === false))
        .map((item) => item.name);
      const next = {
        ...existingState,
        updatedAt: nowIso(),
        lastAnalysisAt: nowIso(),
        businessHealth: health,
        systemRisk: {
          level: riskBrain.level,
          score: riskBrain.score,
          criticalCount: riskBrain.categories.filter((item) => item.level === "critical").length,
          warnings: riskBrain.warnings.slice(0, 8),
        },
        dashboardSummary: {
          brainStatus: "ready",
          freeLiquidity: cashflowBrain.freeLiquidity,
          topRecommendations: recommendations.slice(0, 4),
          todayFocus: nextActions.todayFocus,
          securityStatus: dataset.security.securityMode || dataset.security.sandboxMode ? "Geschuetzter Modus aktiv" : "Lokaler Analysemodus",
        },
        connectedBrains: connectedBrainNames,
        connectedAgents: agentBrain.connectedAgents.slice(),
        nextBestActions: nextActions.items,
        securityStatus: dataset.security,
        brainStatus: "ready",
        preferences,
        lastSimulation,
        modules: modulesMap,
      };
      writeJson(STORAGE_KEYS.brain, next);
      const businessState = mergeObjects(createDefaultBusinessState(), loadObject(STORAGE_KEYS.state));
      businessState.modules = {
        health: next.businessHealth,
        risk: next.systemRisk,
        forecast: forecastBrain,
        analytics: analyticsBrain.trends,
        seo: seoBrain,
        support: supportBrain,
        compliance: complianceBrain,
        simulation: simulationBrain,
      };
      businessState.healthTimeline = [{ at: nowIso(), score: health.score, status: health.status }].concat(toArray(businessState.healthTimeline)).slice(0, 30);
      businessState.riskTimeline = [{ at: nowIso(), level: riskBrain.level, score: riskBrain.score }].concat(toArray(businessState.riskTimeline)).slice(0, 30);
      businessState.focusHistory = [{ at: nowIso(), focus: nextActions.todayFocus }].concat(toArray(businessState.focusHistory)).slice(0, 20);
      writeJson(STORAGE_KEYS.state, businessState);
      pushEvent("elyon:cashflow-updated", { freeLiquidity: cashflowBrain.freeLiquidity, status: cashflowBrain.status });
      if (riskBrain.level === "high" || riskBrain.level === "critical") pushEvent("elyon:risk-warning", { level: riskBrain.level, warnings: riskBrain.warnings.slice(0, 4) });
      if (recommendations.length) pushEvent("elyon:recommendation-created", { top: recommendations[0] });
      pushEvent("elyon:brain-updated", { reason: "recalculated" });
      return next;
    },
    getDashboardSummary() {
      return this.getBrainState().dashboardSummary;
    },
    getAgentContext(agentName) {
      const brainState = this.getBrainState();
      const agentKey = text(agentName).toLowerCase();
      const contexts = brainState.modules && brainState.modules.agentBrain ? brainState.modules.agentBrain.contexts : {};
      const context = contexts && contexts[agentKey] ? contexts[agentKey] : {
        role: "general",
        health: brainState.businessHealth,
        warnings: brainState.systemRisk.warnings.slice(0, 4),
        recommendations: brainState.nextBestActions.slice(0, 4),
        contextData: {},
        autonomousActionsAllowed: false,
      };
      pushEvent("elyon:agent-context-created", { agentName: agentKey });
      return context;
    },
    getNextBestActions() {
      return this.getBrainState().nextBestActions || [];
    },
    evaluateBusinessHealth() {
      return this.getBrainState().businessHealth;
    },
    evaluateSystemRisk() {
      return this.getBrainState().systemRisk;
    },
    runSimulation(type, input) {
      const preferences = getBrainPreferences();
      const simulationSetting = getModuleSetting(preferences, "simulationBrain");
      if (simulationSetting.enabled === false) {
        const blockedResult = {
          type: type || preferences.simulationDefault || "new_product_test",
          risk: "low",
          liquidityImpact: 0,
          resultingLiquidity: this.getBrainState().dashboardSummary.freeLiquidity || 0,
          recommendation: "Simulation Brain ist deaktiviert. Aktiviere das Modul fuer neue Testszenarien.",
          createdAt: nowIso(),
          blocked: true,
        };
        pushEvent("elyon:simulation-created", blockedResult);
        return blockedResult;
      }
      const result = simulateScenario(buildDataset(), type || "new_product_test", input || {});
      const next = this.getBrainState();
      next.lastSimulation = result;
      next.updatedAt = nowIso();
      writeJson(STORAGE_KEYS.brain, next);
      pushEvent("elyon:simulation-created", result);
      return result;
    },
    canExecuteLiveAction(actionType) {
      const security = getSecuritySettings();
      const blockedBySecurity = security.securityMode || security.sandboxMode || security.autonomyLocked || security.advancedMode === false;
      if (LIVE_ACTION_BLOCKLIST.has(text(actionType))) {
        return {
          allowed: false,
          reason: "Live-Aktion blockiert: Sicherheitsmodus oder Sandbox aktiv.",
          security,
        };
      }
      if (blockedBySecurity) {
        return {
          allowed: false,
          reason: "Live-Aktion blockiert: Sicherheitsmodus oder Sandbox aktiv.",
          security,
        };
      }
      return {
        allowed: false,
        reason: "Live-Aktionen bleiben im Elyon Business Brain v1.0 standardmaessig gesperrt.",
        security,
      };
    },
    dispatchBrainEvent(eventName, detail) {
      return pushEvent(eventName, detail);
    },
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function formatCurrency(value) {
    return safeNumber(value).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  function toneClassForStatus(value) {
    const normalized = text(value).toLowerCase();
    if (["strong", "healthy", "winner", "trusted", "low"].includes(normalized)) return "good";
    if (["danger", "critical", "risky", "stop", "high"].includes(normalized)) return "bad";
    return "warn";
  }

  function formatBrainStatusLabel(value) {
    const normalized = text(value).toLowerCase();
    const map = {
      ready: "Bereit",
      prepared: "Vorbereitet",
      healthy: "Stabil",
      caution: "Warnung",
      critical: "Kritisch",
      disabled: "Deaktiviert",
      strong: "Stark",
      stable: "Stabil",
      watch: "Beobachten",
      danger: "Gefahr",
      low: "Niedrig",
      medium: "Mittel",
      high: "Hoch",
    };
    return map[normalized] || (text(value) || "Unbekannt");
  }

  function getModuleStatusValue(moduleState) {
    if (!moduleState || typeof moduleState !== "object") return "prepared";
    return text(moduleState.status || moduleState.level || "prepared");
  }

  function getModuleStatusDetail(moduleState) {
    if (!moduleState || typeof moduleState !== "object") return "Noch keine Daten vorhanden.";
    if (text(moduleState.note)) return text(moduleState.note);
    if (Array.isArray(moduleState.warnings) && moduleState.warnings.length) return text(moduleState.warnings[0]);
    if (Array.isArray(moduleState.decisions) && moduleState.decisions.length) return text(moduleState.decisions[0].label || moduleState.decisions[0].type);
    if (Array.isArray(moduleState.trends) && moduleState.trends.length) return text(moduleState.trends[0].key).replaceAll("_", " ") + ": " + text(moduleState.trends[0].value);
    if (moduleState.defaultScenario) return `Standard-Simulation: ${text(moduleState.defaultScenario)}`;
    return "Modul arbeitet ohne akute Warnung.";
  }

  function renderBrainCenter() {
    const root = document.getElementById("elyonBrainCenterRoot") || document.getElementById("elyonBrainCenterTabRoot");
    if (!root) return;
    const brain = ElyonBusinessBrain.getBrainState();
    const preferences = mergeObjects(createDefaultBrainPreferences(), brain.preferences || getBrainPreferences());
    const modules = brain.modules || {};
    const recommendationsState = mergeObjects(createDefaultRecommendationsState(), loadObject(STORAGE_KEYS.recommendations));
    const eventsState = mergeObjects(createDefaultEventState(), loadObject(STORAGE_KEYS.events));
    const memoryState = mergeObjects(createDefaultMemoryState(), loadObject(STORAGE_KEYS.memory));
    const sim = brain.lastSimulation;
    const security = brain.securityStatus || getSecuritySettings();
    const topRecommendations = toArray(recommendationsState.items).slice(0, 4);
    const eventLogs = toArray(eventsState.items).slice(0, 5);
    const agentPreview = ["soul-finance", "soul-guard", "soul-scout", "soul-seo", "soul-support", "soul-operations"];

    root.innerHTML = `
      <p><strong>Aktiv:</strong> ${preferences.enabled ? "Ja" : "Nein"} · <strong>Analyse:</strong> ${escapeHtml(preferences.analysisMode)} · <strong>Refresh:</strong> ${escapeHtml(preferences.refreshMode)}</p>
      <p><strong>Aktiv:</strong> ${preferences.enabled ? "Ja" : "Nein"} · <strong>Analyse:</strong> ${escapeHtml(preferences.analysisMode)} · <strong>Refresh:</strong> ${escapeHtml(preferences.refreshMode)}</p>
      <div class="brain-center-shell">
        <div class="brain-center-header">
          <div>
            <span class="brain-center-kicker">Elyon Business Brain</span>
            <h3>Brain Center</h3>
            <p class="brain-center-copy">Zentrale Analyse-, Entscheidungs- und Kontextschicht fuer Produkte, Orders, Cashflow, Risiko, Supplier, Forecasts und Agenten. Live-Aktionen bleiben gesperrt.</p>
            <p class="brain-center-copy">Modus: ${escapeHtml(preferences.analysisMode)} · Refresh: ${escapeHtml(preferences.refreshMode)} · Debug: ${escapeHtml(preferences.debugLevel)} · ${preferences.enabled ? "aktiv" : "deaktiviert"}</p>
          </div>
          <div class="brain-center-actions">
            <button type="button" class="secondary" data-brain-action="recalculate">Recalculate</button>
            <button type="button" class="secondary" data-brain-action="simulate">Simulation starten</button>
            <button type="button" class="secondary" data-brain-action="test-agent-context">Agent Context testen</button>
          </div>
        </div>
        <div class="brain-center-grid">
          <article class="brain-card">
            <small>Brain Status</small>
            <strong>${escapeHtml(text(brain.brainStatus || "idle"))}</strong>
            <span class="brain-badge ${toneClassForStatus(brain.businessHealth.status)}">${escapeHtml(text(brain.businessHealth.status || "watch"))}</span>
          </article>
          <article class="brain-card">
            <small>Version</small>
            <strong>${escapeHtml(VERSION)}</strong>
            <span>${escapeHtml(text(brain.lastAnalysisAt || "Noch keine Analyse"))}</span>
          </article>
          <article class="brain-card">
            <small>Business Health</small>
            <strong>${safeNumber(brain.businessHealth.score)} / 100</strong>
            <span class="brain-badge ${toneClassForStatus(brain.businessHealth.status)}">${escapeHtml(text(brain.businessHealth.status))}</span>
          </article>
          <article class="brain-card">
            <small>Risiko-Level</small>
            <strong>${escapeHtml(text(brain.systemRisk.level || "medium"))}</strong>
            <span class="brain-badge ${toneClassForStatus(brain.systemRisk.level)}">${safeNumber(brain.systemRisk.score)} Punkte</span>
          </article>
          <article class="brain-card">
            <small>Freie Liquiditaet</small>
            <strong>${formatCurrency(brain.dashboardSummary.freeLiquidity)}</strong>
            <span>${escapeHtml(text(modules.cashflowBrain && modules.cashflowBrain.status || (preferences.enabled ? "healthy" : "disabled")))}</span>
          </article>
          <article class="brain-card">
            <small>Verbundene Mini-Brains</small>
            <strong>${safeNumber(brain.connectedBrains.length)}</strong>
            <span>${escapeHtml(BRAIN_NAMES.slice(0, 4).join(" · "))}</span>
          </article>
          <article class="brain-card">
            <small>Verbundene Agenten</small>
            <strong>${safeNumber(brain.connectedAgents.length)}</strong>
            <span>${escapeHtml(brain.connectedAgents.slice(0, 4).join(" · "))}</span>
          </article>
          <article class="brain-card">
            <small>Sicherheitsstatus</small>
            <strong>${security.securityMode || security.sandboxMode ? "Geschuetzt" : "Lokal"}</strong>
            <span>${security.autonomyLocked ? "Autonomie gesperrt" : "Autonomie vorbereitet"}</span>
          </article>
        </div>
        <div class="brain-center-panels">
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Top Empfehlungen</h4>
              <span class="brain-badge info">${preferences.enabled ? topRecommendations.length : 0} aktiv</span>
            </div>
            <div class="brain-list">
              ${preferences.enabled ? (topRecommendations.map((item) => `<article class="brain-list-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><span class="brain-badge ${toneClassForStatus(item.priority)}">${escapeHtml(item.priority)}</span></article>`).join("") || `<p class="brain-empty">Noch keine Empfehlungen gespeichert.</p>`) : `<p class="brain-empty">Business Brain ist aktuell deaktiviert. Aktiviere es in den Einstellungen.</p>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Heutiger Fokus</h4>
              <span class="brain-badge warn">Priorisiert</span>
            </div>
            <p class="brain-focus-copy">${escapeHtml(text(brain.dashboardSummary.todayFocus || "Analyse starten und Empfehlungen laden."))}</p>
            <div class="brain-pills">
              ${toArray(brain.nextBestActions).slice(0, 4).map((item) => `<span class="pill">${escapeHtml(item.title || item.label || text(item))}</span>`).join("")}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Memory</h4>
              <span class="brain-badge info">${safeNumber(memoryState.winners.length)} Muster</span>
            </div>
            <div class="brain-pills">
              ${memoryState.winners.slice(-4).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
              ${memoryState.riskySuppliers.slice(-3).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
            </div>
            <p class="brain-panel-copy">Letztes Lernen: ${escapeHtml(text(memoryState.lastLearnedAt || "Noch nicht gelernt"))}</p>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Forecast</h4>
              <span class="brain-badge ${toneClassForStatus(modules.cashflowBrain && modules.cashflowBrain.status)}">${escapeHtml(text(modules.cashflowBrain && modules.cashflowBrain.status || "healthy"))}</span>
            </div>
            <div class="brain-forecast-grid">
              <div><small>Heute</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.today)}</strong></div>
              <div><small>7 Tage</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.day7)}</strong></div>
              <div><small>14 Tage</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.day14)}</strong></div>
              <div><small>30 Tage</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.day30)}</strong></div>
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Risiken</h4>
              <span class="brain-badge ${toneClassForStatus(brain.systemRisk.level)}">${escapeHtml(text(brain.systemRisk.level))}</span>
            </div>
            <div class="brain-pills">
              ${toArray(brain.systemRisk.warnings).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || `<span class="pill">Keine akuten Warnungen</span>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Simulationen</h4>
              <span class="brain-badge info">${sim ? "Zuletzt ausgefuehrt" : "Bereit"}</span>
            </div>
            ${sim ? `<p class="brain-panel-copy">${escapeHtml(sim.type)} · Risiko ${escapeHtml(sim.risk)} · Effekt ${formatCurrency(sim.liquidityImpact)}</p><p class="brain-panel-copy">${escapeHtml(sim.recommendation)}</p>` : `<p class="brain-panel-copy">Teste neue Produkte, Retourencluster, Supplierkosten oder Auszahlungsszenarien ohne Live-Aktionen.</p>`}
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Agenten-Kontext</h4>
              <span class="brain-badge info">Vorbereitet</span>
            </div>
            <div class="brain-list compact">
              ${agentPreview.map((agentKey) => {
                const context = ElyonBusinessBrain.getAgentContext(agentKey);
                return `<article class="brain-list-item"><strong>${escapeHtml(agentKey)}</strong><p>${escapeHtml(text(context.role))} · ${escapeHtml(text(context.warnings[0] || "Keine Warnung"))}</p></article>`;
              }).join("")}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Event-Logs</h4>
              <span class="brain-badge info">${eventLogs.length} Eintraege</span>
            </div>
            <div class="brain-list compact">
              ${eventLogs.map((item) => `<article class="brain-list-item"><strong>${escapeHtml(item.eventName)}</strong><p>${escapeHtml(text(item.createdAt))}</p></article>`).join("") || `<p class="brain-empty">Noch keine Events protokolliert.</p>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Debug</h4>
              <span class="brain-badge warn">Lokal</span>
            </div>
            <div class="brain-debug-grid">
              <button type="button" class="secondary" data-brain-action="show-state">Brain State</button>
              <button type="button" class="secondary" data-brain-action="test-events">Events testen</button>
              <button type="button" class="secondary" data-brain-action="check-storage">localStorage pruefen</button>
              <button type="button" class="secondary" data-brain-action="load-testdata">Testdaten laden</button>
            </div>
            <pre id="elyonBrainDebugOutput" class="brain-debug-output">Bereit.</pre>
          </section>
        </div>
      </div>
    `;
    bindBrainCenter(root);
    const secondaryRoots = ["elyonBrainCenterRoot", "elyonBrainCenterTabRoot"]
      .map((id) => document.getElementById(id))
      .filter((node) => node && node !== root);
    secondaryRoots.forEach((node) => {
      node.innerHTML = root.innerHTML;
      bindBrainCenter(node);
    });
  }

  function openBrainCenterTarget(target) {
    if (target === "settings") {
      if (typeof window.showTab === "function") window.showTab("settingsTab");
      const settingsModal = document.getElementById("settingsModal");
      if (settingsModal) settingsModal.classList.add("hidden");
      const root = document.getElementById("elyonBrainSettingsTabRoot");
      if (root && typeof root.scrollIntoView === "function") root.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (target === "main") {
      if (typeof window.showTab === "function") window.showTab("brainCenterTab");
      const settingsModal = document.getElementById("settingsModal");
      if (settingsModal) settingsModal.classList.add("hidden");
      const root = document.getElementById("elyonBrainCenterTabRoot");
      if (root && typeof root.scrollIntoView === "function") root.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (typeof window.showTab === "function") window.showTab("virtualAgentsTab");
    const settingsModal = document.getElementById("settingsModal");
    if (settingsModal) settingsModal.classList.add("hidden");
    const root = document.getElementById("elyonBrainCenterRoot");
    if (root && typeof root.scrollIntoView === "function") root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderBrainSettingsTab() {
    const root = document.getElementById("elyonBrainSettingsTabRoot");
    if (!root) return;
    const brain = ElyonBusinessBrain.getBrainState();
    const preferences = mergeObjects(createDefaultBrainPreferences(), brain.preferences || getBrainPreferences());
    const recommendations = mergeObjects(createDefaultRecommendationsState(), loadObject(STORAGE_KEYS.recommendations)).items.slice(0, 3);
    root.innerHTML = `
      <h2>🧠 Elyon Business Brain</h2>
      <p class="hint">Zentrale Intelligenzschicht fuer Business Health, Risiko, Forecast, Empfehlungen und Agenten-Kontext. Live-Aktionen bleiben blockiert.</p>
      <div class="dashboard">
        <div class="metric"><small>Health</small><strong>${safeNumber(brain.businessHealth.score)} / 100</strong></div>
        <div class="metric"><small>Risiko</small><strong>${escapeHtml(text(brain.systemRisk.level || "medium"))}</strong></div>
        <div class="metric"><small>Freie Liquiditaet</small><strong>${formatCurrency(brain.dashboardSummary.freeLiquidity)}</strong></div>
        <div class="metric"><small>Status</small><strong>${escapeHtml(text(brain.brainStatus || "idle"))}</strong></div>
      </div>
      <div class="output-box" style="margin-top:14px">
        <p><strong>Aktiv:</strong> ${preferences.enabled ? "Ja" : "Nein"} · <strong>Analyse:</strong> ${escapeHtml(preferences.analysisMode)} · <strong>Refresh:</strong> ${escapeHtml(preferences.refreshMode)} · <strong>Debug:</strong> ${escapeHtml(preferences.debugLevel)}</p>
      </div>
      <div class="row" style="margin-top:10px">
        <button type="button" class="secondary full" data-brain-nav="agents">Vollansicht im Agentenbereich öffnen</button>
        <button type="button" class="secondary full" data-brain-settings-action="recalculate">Analyse neu berechnen</button>
        <button type="button" class="secondary full" data-brain-nav="main">Eigenen Brain-Tab öffnen</button>
        <button type="button" class="secondary full" data-brain-nav="settings">Zu Einstellungen springen</button>
      </div>
      <div class="output-box" style="margin-top:14px">
        <p><strong>Heutiger Fokus:</strong> ${escapeHtml(text(brain.dashboardSummary.todayFocus || "Noch kein Fokus berechnet."))}</p>
        <p><strong>Top Empfehlungen:</strong></p>
        <ul>${recommendations.map((item) => `<li>${escapeHtml(item.title)} - ${escapeHtml(item.detail)}</li>`).join("") || "<li>Noch keine Empfehlungen gespeichert.</li>"}</ul>
      </div>
    `;
    root.querySelectorAll("[data-brain-nav]").forEach((button) => {
      if (button.dataset.bound === "yes") return;
      button.dataset.bound = "yes";
      button.addEventListener("click", () => openBrainCenterTarget(button.dataset.brainNav));
    });
    root.querySelectorAll("[data-brain-settings-action]").forEach((button) => {
      if (button.dataset.bound === "yes") return;
      button.dataset.bound = "yes";
      button.addEventListener("click", () => {
        if (button.dataset.brainSettingsAction === "recalculate") {
          ElyonBusinessBrain.recalculateAll();
          renderBrainSettingsTab();
          renderBrainSettingsModal();
          renderBrainCenter();
        }
      });
    });
  }

  function renderBrainSettingsModal() {
    const root = document.getElementById("elyonBrainSettingsModalRoot");
    if (!root) return;
    const brain = ElyonBusinessBrain.getBrainState();
    const preferences = mergeObjects(createDefaultBrainPreferences(), brain.preferences || getBrainPreferences());
    root.innerHTML = `
      <p><strong>Health:</strong> ${safeNumber(brain.businessHealth.score)} / 100 · ${escapeHtml(text(brain.businessHealth.status || "watch"))}</p>
      <p><strong>Risiko:</strong> ${escapeHtml(text(brain.systemRisk.level || "medium"))} · <strong>Freie Liquiditaet:</strong> ${formatCurrency(brain.dashboardSummary.freeLiquidity)}</p>
      <p><strong>Fokus:</strong> ${escapeHtml(text(brain.dashboardSummary.todayFocus || "Noch keine Priorisierung"))}</p>
    `;
    const openSettingsBtn = document.getElementById("openBrainCenterSettingsBtn");
    if (openSettingsBtn && openSettingsBtn.dataset.bound !== "yes") {
      openSettingsBtn.dataset.bound = "yes";
      openSettingsBtn.addEventListener("click", () => openBrainCenterTarget("settings"));
    }
    const openAgentBtn = document.getElementById("openBrainCenterAgentBtn");
    if (openAgentBtn && openAgentBtn.dataset.bound !== "yes") {
      openAgentBtn.dataset.bound = "yes";
      openAgentBtn.addEventListener("click", () => openBrainCenterTarget("agents"));
    }
    const openMainBtn = document.getElementById("openBrainCenterMainTabBtn");
    if (openMainBtn && openMainBtn.dataset.bound !== "yes") {
      openMainBtn.dataset.bound = "yes";
      openMainBtn.addEventListener("click", () => openBrainCenterTarget("main"));
    }
    const recalcBtn = document.getElementById("brainRecalculateFromSettingsBtn");
    if (recalcBtn && recalcBtn.dataset.bound !== "yes") {
      recalcBtn.dataset.bound = "yes";
      recalcBtn.addEventListener("click", () => scheduleRender());
    }
  }

  function debugOutput(message) {
    document.querySelectorAll("[data-brain-debug-output]").forEach((output) => {
      output.textContent = message;
    });
  }

  function bindBrainCenter(root) {
    root.querySelectorAll("[data-brain-action]").forEach((button) => {
      if (button.dataset.bound === "yes") return;
      button.dataset.bound = "yes";
      button.addEventListener("click", () => {
        const action = button.dataset.brainAction;
        if (action === "recalculate") {
          ElyonBusinessBrain.recalculateAll();
          renderBrainCenter();
          debugOutput("Recalculate abgeschlossen.");
        } else if (action === "simulate") {
          const preferences = getBrainPreferences();
          const result = ElyonBusinessBrain.runSimulation(preferences.simulationDefault || "aggressive_scaling", { scaleFactor: 1.4 });
          renderBrainCenter();
          debugOutput(JSON.stringify(result, null, 2));
        } else if (action === "test-agent-context") {
          debugOutput(JSON.stringify(ElyonBusinessBrain.getAgentContext("soul-finance"), null, 2));
        } else if (action === "show-state") {
          debugOutput(JSON.stringify(ElyonBusinessBrain.getBrainState(), null, 2));
        } else if (action === "test-events") {
          ElyonBusinessBrain.dispatchBrainEvent("elyon:brain-updated", { source: "debug-panel" });
          renderBrainCenter();
          debugOutput("Testevent elyon:brain-updated gesendet.");
        } else if (action === "check-storage") {
          debugOutput(JSON.stringify({
            brain: STORAGE_KEYS.brain,
            state: STORAGE_KEYS.state,
            memory: STORAGE_KEYS.memory,
            events: STORAGE_KEYS.events,
            recommendations: STORAGE_KEYS.recommendations,
          }, null, 2));
        } else if (action === "load-testdata") {
          const result = ElyonBusinessBrain.runSimulation("multi_returns", { count: 4, avgRefund: 24 });
          debugOutput(`Testmodus vorbereitet:\n${JSON.stringify(result, null, 2)}`);
          renderBrainCenter();
        }
      });
    });
    root.querySelectorAll("[data-brain-scenario]").forEach((button) => {
      if (button.dataset.bound === "yes") return;
      button.dataset.bound = "yes";
      button.addEventListener("click", () => {
        const scenario = text(button.dataset.brainScenario || "new_product_test");
        let input = {};
        if (scenario === "new_product_test") {
          input = { buyCost: safeNumber(button.dataset.buyCost, 60) };
        } else if (scenario === "multi_returns") {
          input = {
            count: safeNumber(button.dataset.count, 3),
            avgRefund: safeNumber(button.dataset.avgRefund, 20),
          };
        } else if (scenario === "payout_delay") {
          input = { delayCost: safeNumber(button.dataset.delayCost, 180) };
        } else if (scenario === "aggressive_scaling") {
          input = { scaleFactor: safeNumber(button.dataset.scaleFactor, 1.5) };
        }
        const result = ElyonBusinessBrain.runSimulation(scenario, input);
        renderBrainCenter();
        debugOutput(JSON.stringify(result, null, 2));
      });
    });
  }

  renderBrainCenter = function renderBrainCenterClean() {
    const root = document.getElementById("elyonBrainCenterRoot") || document.getElementById("elyonBrainCenterTabRoot");
    if (!root) return;
    const brain = ElyonBusinessBrain.getBrainState();
    const preferences = mergeObjects(createDefaultBrainPreferences(), brain.preferences || getBrainPreferences());
    const modules = brain.modules || {};
    const recommendationsState = mergeObjects(createDefaultRecommendationsState(), loadObject(STORAGE_KEYS.recommendations));
    const eventsState = mergeObjects(createDefaultEventState(), loadObject(STORAGE_KEYS.events));
    const memoryState = mergeObjects(createDefaultMemoryState(), loadObject(STORAGE_KEYS.memory));
    const sim = brain.lastSimulation;
    const security = brain.securityStatus || getSecuritySettings();
    const topRecommendations = toArray(recommendationsState.items).slice(0, 4);
    const eventLogs = toArray(eventsState.items).slice(0, 5);
    const agentPreview = ["soul-finance", "soul-guard", "soul-scout", "soul-seo", "soul-support", "soul-operations"];
    const healthStatus = text(brain.businessHealth.status || "watch");
    const riskLevel = text(brain.systemRisk.level || "medium");
    const cashflowStatus = text((modules.cashflowBrain && modules.cashflowBrain.status) || (preferences.enabled ? "healthy" : "disabled"));
    const securityLabel = security.securityMode || security.sandboxMode ? "Geschuetzt" : "Lokal";
    const focusText = text(brain.dashboardSummary.todayFocus || "Analyse starten und Empfehlungen laden.");
    const nextActions = toArray(brain.nextBestActions).slice(0, 4);
    const connectedBrains = toArray(brain.connectedBrains);
    const connectedAgents = toArray(brain.connectedAgents);
    const moduleStatusItems = BRAIN_MODULE_DEFS.map((module) => {
      const moduleState = modules[module.id] || null;
      const statusValue = getModuleStatusValue(moduleState);
      const statusLabel = formatBrainStatusLabel(statusValue);
      const detail = getModuleStatusDetail(moduleState);
      return `<article class="brain-status-item"><div class="brain-status-top"><strong>${escapeHtml(module.name)}</strong><span class="brain-badge ${toneClassForStatus(statusValue)}">${escapeHtml(statusLabel)}</span></div><p>${escapeHtml(detail)}</p></article>`;
    }).join("");

    root.innerHTML = `
      <div class="brain-center-shell">
        <div class="brain-center-header">
          <div>
            <span class="brain-center-kicker">Elyon Business Brain</span>
            <h3>Brain Center</h3>
            <p class="brain-center-copy">Zentrale Analyse-, Entscheidungs- und Kontextschicht fuer Produkte, Orders, Cashflow, Risiko, Supplier, Forecasts und Agenten. Live-Aktionen bleiben gesperrt.</p>
            <p class="brain-center-copy">Modus: ${escapeHtml(preferences.analysisMode)} · Refresh: ${escapeHtml(preferences.refreshMode)} · Debug: ${escapeHtml(preferences.debugLevel)} · ${preferences.enabled ? "aktiv" : "deaktiviert"}</p>
          </div>
          <div class="brain-center-actions">
            <button type="button" class="secondary" data-brain-action="recalculate">Recalculate</button>
            <button type="button" class="secondary" data-brain-action="simulate">Simulation starten</button>
            <button type="button" class="secondary" data-brain-action="test-agent-context">Agent Context testen</button>
          </div>
        </div>
        <div class="brain-pills">
          <span class="pill">Status: ${escapeHtml(text(brain.brainStatus || "idle"))}</span>
          <span class="pill">Health: ${safeNumber(brain.businessHealth.score)} / 100</span>
          <span class="pill">Risiko: ${escapeHtml(riskLevel)}</span>
          <span class="pill">Sicherheit: ${escapeHtml(securityLabel)}</span>
          <span class="pill">Letzte Analyse: ${escapeHtml(text(brain.lastAnalysisAt || "Noch keine Analyse"))}</span>
        </div>
        <div class="brain-center-grid">
          <article class="brain-card">
            <small>Business Health</small>
            <strong>${safeNumber(brain.businessHealth.score)} / 100</strong>
            <span class="brain-badge ${toneClassForStatus(healthStatus)}">${escapeHtml(healthStatus)}</span>
          </article>
          <article class="brain-card">
            <small>Risiko-Level</small>
            <strong>${escapeHtml(riskLevel)}</strong>
            <span class="brain-badge ${toneClassForStatus(riskLevel)}">${safeNumber(brain.systemRisk.score)} Punkte</span>
          </article>
          <article class="brain-card">
            <small>Freie Liquiditaet</small>
            <strong>${formatCurrency(brain.dashboardSummary.freeLiquidity)}</strong>
            <span>${escapeHtml(cashflowStatus)}</span>
          </article>
          <article class="brain-card">
            <small>Heutiger Fokus</small>
            <strong>${escapeHtml(focusText)}</strong>
            <span>${escapeHtml(nextActions[0] && (nextActions[0].title || nextActions[0].label || text(nextActions[0])) || "Noch keine Aktion priorisiert")}</span>
          </article>
          <article class="brain-card">
            <small>Brain Status</small>
            <strong>${escapeHtml(text(brain.brainStatus || "idle"))}</strong>
            <span>${escapeHtml(VERSION)}</span>
          </article>
          <article class="brain-card">
            <small>Verbundene Mini-Brains</small>
            <strong>${safeNumber(connectedBrains.length)}</strong>
            <span>${escapeHtml(connectedBrains.slice(0, 4).join(" · ") || "Noch keine Verbindungen")}</span>
          </article>
          <article class="brain-card">
            <small>Verbundene Agenten</small>
            <strong>${safeNumber(connectedAgents.length)}</strong>
            <span>${escapeHtml(connectedAgents.slice(0, 4).join(" · ") || "Noch keine Kontexte")}</span>
          </article>
          <article class="brain-card">
            <small>Sicherheitsstatus</small>
            <strong>${securityLabel}</strong>
            <span>${security.autonomyLocked ? "Autonomie gesperrt" : "Autonomie vorbereitet"}</span>
          </article>
        </div>
        <div class="brain-center-panels">
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Top Empfehlungen</h4>
              <span class="brain-badge info">${preferences.enabled ? topRecommendations.length : 0} aktiv</span>
            </div>
            <p class="brain-panel-copy">Die wichtigsten Vorschlaege aus Risiko, Liquiditaet, Produktlage und operativen Signalen.</p>
            <div class="brain-list">
              ${preferences.enabled ? (topRecommendations.map((item) => `<article class="brain-list-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><span class="brain-badge ${toneClassForStatus(item.priority)}">${escapeHtml(item.priority)}</span></article>`).join("") || `<p class="brain-empty">Noch keine Empfehlungen gespeichert.</p>`) : `<p class="brain-empty">Business Brain ist aktuell deaktiviert. Aktiviere es in den Einstellungen.</p>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Fokus und naechste Schritte</h4>
              <span class="brain-badge warn">Priorisiert</span>
            </div>
            <p class="brain-focus-copy">${escapeHtml(focusText)}</p>
            <div class="brain-pills">
              ${nextActions.map((item) => `<span class="pill">${escapeHtml(item.title || item.label || text(item))}</span>`).join("") || `<span class="pill">Noch keine Aktionen priorisiert</span>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Forecast</h4>
              <span class="brain-badge ${toneClassForStatus(cashflowStatus)}">${escapeHtml(cashflowStatus)}</span>
            </div>
            <p class="brain-panel-copy">Liquiditaetsblick fuer heute sowie die naechsten 7, 14 und 30 Tage.</p>
            <div class="brain-forecast-grid">
              <div><small>Heute</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.today)}</strong></div>
              <div><small>7 Tage</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.day7)}</strong></div>
              <div><small>14 Tage</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.day14)}</strong></div>
              <div><small>30 Tage</small><strong>${formatCurrency(modules.forecastBrain && modules.forecastBrain.day30)}</strong></div>
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Risiken</h4>
              <span class="brain-badge ${toneClassForStatus(riskLevel)}">${escapeHtml(riskLevel)}</span>
            </div>
            <p class="brain-panel-copy">Aktive Warnsignale aus Cashflow, Compliance, Suppliern und Margen.</p>
            <div class="brain-pills">
              ${toArray(brain.systemRisk.warnings).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || `<span class="pill">Keine akuten Warnungen</span>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Mini-Brains Status</h4>
              <span class="brain-badge info">${safeNumber(connectedBrains.length)} aktiv</span>
            </div>
            <p class="brain-panel-copy">Jeder Mini-Brain zeigt hier seinen aktuellen Zustand auf Deutsch, inklusive kurzer Funktionslage.</p>
            <div class="brain-status-list">
              ${moduleStatusItems || `<p class="brain-empty">Noch keine Mini-Brains verbunden.</p>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Agenten-Verknuepfung</h4>
              <span class="brain-badge info">${safeNumber(connectedAgents.length)} verbunden</span>
            </div>
            <p class="brain-panel-copy">Diese Agenten erhalten aktuell Brain-Kontexte, Empfehlungen und Warnungen.</p>
            <div class="brain-pills">
              ${connectedAgents.slice(0, 10).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || `<span class="pill">Noch keine Agenten verbunden</span>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Memory</h4>
              <span class="brain-badge info">${safeNumber(memoryState.winners.length)} Muster</span>
            </div>
            <p class="brain-panel-copy">Gelernte Gewinner, auffaellige Supplier und wiederkehrende Muster.</p>
            <div class="brain-pills">
              ${memoryState.winners.slice(-4).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
              ${memoryState.riskySuppliers.slice(-3).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || `<span class="pill">Noch keine Muster gespeichert</span>`}
            </div>
            <p class="brain-panel-copy">Letztes Lernen: ${escapeHtml(text(memoryState.lastLearnedAt || "Noch nicht gelernt"))}</p>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Simulationen</h4>
              <span class="brain-badge info">${sim ? "Zuletzt ausgefuehrt" : "Bereit"}</span>
            </div>
            ${sim ? `<p class="brain-panel-copy">${escapeHtml(sim.type)} · Risiko ${escapeHtml(sim.risk)} · Effekt ${formatCurrency(sim.liquidityImpact)}</p><p class="brain-panel-copy">${escapeHtml(sim.recommendation)}</p>` : `<p class="brain-panel-copy">Teste neue Produkte, Retourencluster, Supplierkosten oder Auszahlungsszenarien ohne Live-Aktionen.</p>`}
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Agenten-Kontext</h4>
              <span class="brain-badge info">Vorbereitet</span>
            </div>
            <p class="brain-panel-copy">Kurzkontext fuer Finance, Guard, Scout, SEO, Support und Operations.</p>
            <div class="brain-list compact">
              ${agentPreview.map((agentKey) => {
                const context = ElyonBusinessBrain.getAgentContext(agentKey);
                return `<article class="brain-list-item"><strong>${escapeHtml(agentKey)}</strong><p>${escapeHtml(text(context.role))} · ${escapeHtml(text(context.warnings[0] || "Keine Warnung"))}</p></article>`;
              }).join("")}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Event-Logs</h4>
              <span class="brain-badge info">${eventLogs.length} Eintraege</span>
            </div>
            <p class="brain-panel-copy">Interne Brain-Events fuer Updates, Warnungen und Simulationen.</p>
            <div class="brain-list compact">
              ${eventLogs.map((item) => `<article class="brain-list-item"><strong>${escapeHtml(item.eventName)}</strong><p>${escapeHtml(text(item.createdAt))}</p></article>`).join("") || `<p class="brain-empty">Noch keine Events protokolliert.</p>`}
            </div>
          </section>
          <section class="brain-panel">
            <div class="brain-panel-head">
              <h4>Debug</h4>
              <span class="brain-badge warn">Lokal</span>
            </div>
            <div class="brain-debug-grid">
              <button type="button" class="secondary" data-brain-action="show-state">Brain State</button>
              <button type="button" class="secondary" data-brain-action="test-events">Events testen</button>
              <button type="button" class="secondary" data-brain-action="check-storage">localStorage pruefen</button>
              <button type="button" class="secondary" data-brain-action="load-testdata">Testdaten laden</button>
            </div>
            <pre id="elyonBrainDebugOutput" class="brain-debug-output">Bereit.</pre>
          </section>
        </div>
      </div>
    `;
    bindBrainCenter(root);
    const secondaryRoots = ["elyonBrainCenterRoot", "elyonBrainCenterTabRoot"]
      .map((id) => document.getElementById(id))
      .filter((node) => node && node !== root);
    secondaryRoots.forEach((node) => {
      node.innerHTML = root.innerHTML;
      bindBrainCenter(node);
    });
  };

  renderBrainCenter = function renderBrainCenterVisualCenter() {
    const root = document.getElementById("elyonBrainCenterRoot") || document.getElementById("elyonBrainCenterTabRoot");
    if (!root) return;
    const brain = ElyonBusinessBrain.getBrainState();
    const preferences = mergeObjects(createDefaultBrainPreferences(), brain.preferences || getBrainPreferences());
    const modules = brain.modules || {};
    const recommendationsState = mergeObjects(createDefaultRecommendationsState(), loadObject(STORAGE_KEYS.recommendations));
    const eventsState = mergeObjects(createDefaultEventState(), loadObject(STORAGE_KEYS.events));
    const memoryState = mergeObjects(createDefaultMemoryState(), loadObject(STORAGE_KEYS.memory));
    const sim = brain.lastSimulation;
    const security = brain.securityStatus || getSecuritySettings();
    const topRecommendations = toArray(recommendationsState.items).slice(0, 4);
    const eventLogs = toArray(eventsState.items).slice(0, 6);
    const agentPreview = ["soul-finance", "soul-guard", "soul-scout", "soul-seo", "soul-support", "soul-operations"];
    const healthStatus = text(brain.businessHealth.status || "watch");
    const riskLevel = text(brain.systemRisk.level || "medium");
    const cashflowStatus = text((modules.cashflowBrain && modules.cashflowBrain.status) || (preferences.enabled ? "healthy" : "disabled"));
    const securityLabel = security.securityMode || security.sandboxMode ? "Geschuetzt" : "Lokal";
    const focusText = text(brain.dashboardSummary.todayFocus || "Analyse starten und Empfehlungen laden.");
    const nextActions = toArray(brain.nextBestActions).slice(0, 4);
    const connectedBrains = toArray(brain.connectedBrains);
    const connectedAgents = toArray(brain.connectedAgents);
    const formatRelativeTime = (value) => {
      const raw = text(value);
      if (!raw) return "Noch keine Analyse";
      const timestamp = new Date(raw).getTime();
      if (!Number.isFinite(timestamp)) return raw;
      const diff = Math.max(0, Date.now() - timestamp);
      const minutes = Math.round(diff / 60000);
      if (minutes <= 1) return "vor 1 Min";
      if (minutes < 60) return `vor ${minutes} Min`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `vor ${hours} Std`;
      const days = Math.round(hours / 24);
      return `vor ${days} Tag${days === 1 ? "" : "en"}`;
    };
    const mapStatusDot = (value) => {
      const normalized = text(value).toLowerCase();
      if (["strong", "healthy", "winner", "trusted", "low", "ready", "stable", "good", "aktiv"].includes(normalized)) return "good";
      if (["danger", "critical", "risky", "stop", "high", "bad", "gesperrt"].includes(normalized)) return "bad";
      return "warn";
    };
    const statusLabel = (value) => formatBrainStatusLabel(value);
    const heatLevelFromStatus = (value) => {
      const normalized = text(value).toLowerCase();
      if (["critical", "danger", "high", "stop"].includes(normalized)) return "high";
      if (["caution", "watch", "medium", "prepared"].includes(normalized)) return "medium";
      return "low";
    };
    const recommendationFor = (...types) => topRecommendations.find((item) => types.includes(text(item.type).toLowerCase()));
    const summarizeEventName = (value) => {
      const map = {
        "elyon:brain-ready": "Brain bereit",
        "elyon:brain-updated": "Brain aktualisiert",
        "elyon:cashflow-updated": "Cashflow neu berechnet",
        "elyon:risk-warning": "Risiko erhoeht",
        "elyon:recommendation-created": "Empfehlung erstellt",
        "elyon:new-order": "Neue Order erkannt",
        "elyon:product-updated": "Produkt aktualisiert",
        "elyon:supplier-risk": "Supplier-Risiko erkannt",
        "elyon:simulation-created": "Simulation abgeschlossen",
        "elyon:agent-context-created": "Agenten-Kontext erstellt",
      };
      return map[text(value)] || text(value) || "Brain Event";
    };
    const formatScenarioLabel = (value) => {
      const map = {
        new_product_test: "Neues Produkt testen",
        multi_returns: "Retouren-Szenario",
        supplier_cost_spike: "Supplierkosten steigen",
        payout_delay: "Auszahlung verzoegert",
        aggressive_scaling: "Aggressive Skalierung",
        high_fees: "Hohe Gebuehren",
      };
      return map[text(value)] || text(value) || "Simulation";
    };
    const moduleStatusItems = BRAIN_MODULE_DEFS.map((module) => {
      const moduleState = modules[module.id] || null;
      const statusValue = getModuleStatusValue(moduleState);
      const moduleStatusLabel = formatBrainStatusLabel(statusValue);
      const detail = getModuleStatusDetail(moduleState);
      return `<article class="brain-status-item"><div class="brain-status-top"><strong>${escapeHtml(module.name)}</strong><span class="brain-badge ${toneClassForStatus(statusValue)}">${escapeHtml(moduleStatusLabel)}</span></div><p>${escapeHtml(detail)}</p></article>`;
    }).join("");
    const healthScore = clamp(safeNumber(brain.businessHealth.score), 0, 100);
    const healthTone = mapStatusDot(healthStatus);
    const healthRingColor = healthTone === "good" ? "#22c55e" : healthTone === "bad" ? "#ef4444" : "#f59e0b";
    const lastAnalysisLabel = formatRelativeTime(brain.lastAnalysisAt);
    const primaryAgents = [
      { key: "Soul Finance", state: preferences.enabled ? (security.pauseAllAgents ? "Pause" : security.sandboxMode ? "Sandbox" : "Aktiv") : "Gesperrt" },
      { key: "Soul Guard", state: preferences.enabled ? (security.pauseAllAgents ? "Pause" : security.sandboxMode ? "Sandbox" : "Aktiv") : "Gesperrt" },
      { key: "Soul Scout", state: preferences.enabled ? (security.pauseAllAgents ? "Pause" : security.sandboxMode ? "Sandbox" : "Aktiv") : "Gesperrt" },
      { key: "Soul SEO", state: preferences.enabled ? (security.pauseAllAgents ? "Pause" : security.sandboxMode ? "Sandbox" : "Aktiv") : "Gesperrt" },
      { key: "Soul Support", state: preferences.enabled ? (security.pauseAllAgents ? "Pause" : security.sandboxMode ? "Sandbox" : "Aktiv") : "Gesperrt" },
      { key: "Soul Operations", state: preferences.enabled ? (security.pauseAllAgents ? "Pause" : security.sandboxMode ? "Sandbox" : "Aktiv") : "Gesperrt" },
    ];
    const futureAgents = ["Soul Listing", "Soul Pricing", "Soul Supplier", "Soul Compliance", "Soul Returns", "Soul Dispatch", "Soul Inventory", "Soul Review"];
    const brainCards = [
      {
        icon: "💰",
        title: "Cashflow Brain",
        status: statusLabel((modules.cashflowBrain && modules.cashflowBrain.status) || "healthy"),
        tone: mapStatusDot(modules.cashflowBrain && modules.cashflowBrain.status),
        metricLabel: "Freie Liquiditaet",
        metricValue: formatCurrency(modules.cashflowBrain && modules.cashflowBrain.freeLiquidity),
        summary: `Reserve ${formatCurrency(modules.cashflowBrain && modules.cashflowBrain.safetyReserve)} | Score ${safeNumber(modules.cashflowBrain && modules.cashflowBrain.cashflowScore)}`,
        recommendation: text((recommendationFor("cashflow", "reserve") || {}).title || ((modules.cashflowBrain && modules.cashflowBrain.warnings && modules.cashflowBrain.warnings[0]) || "Cashflow wirkt stabil.")),
        activity: `${safeNumber((modules.cashflowBrain && modules.cashflowBrain.warnings || []).length)} Warnsignal(e)`,
      },
      {
        icon: "📦",
        title: "Product Brain",
        status: statusLabel((modules.productBrain && ((modules.productBrain.riskyProducts || []).length ? "watch" : "strong")) || "watch"),
        tone: mapStatusDot((modules.productBrain && ((modules.productBrain.riskyProducts || []).length ? "watch" : "strong")) || "watch"),
        metricLabel: "Winner",
        metricValue: String(safeNumber(modules.productBrain && (modules.productBrain.topWinners || []).length)),
        summary: `Ø Marge ${Math.round(safeNumber(modules.productBrain && modules.productBrain.averageMargin))}% | Ø ROI ${Math.round(safeNumber(modules.productBrain && modules.productBrain.averageROI))}%`,
        recommendation: text((recommendationFor("product", "seo") || {}).title || (((modules.productBrain && modules.productBrain.riskyProducts || [])[0] || {}).title) || "Produktdaten weiter schaerfen."),
        activity: `${safeNumber(modules.productBrain && (modules.productBrain.products || []).length)} Produkte analysiert`,
      },
      {
        icon: "🛡",
        title: "Risk Brain",
        status: statusLabel(riskLevel),
        tone: mapStatusDot(riskLevel),
        metricLabel: "Risk Score",
        metricValue: `${safeNumber(brain.systemRisk.score)} / 100`,
        summary: `${safeNumber((modules.riskBrain && modules.riskBrain.categories || []).length)} Risiko-Kategorie(n) aktiv`,
        recommendation: text((recommendationFor("compliance", "supplier", "cashflow") || {}).title || ((brain.systemRisk.warnings || [])[0]) || "Keine akute Eskalation erkannt."),
        activity: `${safeNumber((brain.systemRisk.warnings || []).length)} Warnung(en)`,
      },
      {
        icon: "🤖",
        title: "Agent Brain",
        status: preferences.enabled ? (security.pauseAllAgents ? "Pause" : security.sandboxMode ? "Sandbox" : "Aktiv") : "Gesperrt",
        tone: preferences.enabled ? (security.pauseAllAgents || security.sandboxMode ? "warn" : "good") : "bad",
        metricLabel: "Verbunden",
        metricValue: String(safeNumber(connectedAgents.length)),
        summary: `${safeNumber(primaryAgents.filter((agent) => agent.state === "Aktiv").length)} aktiv | ${futureAgents.length} vorbereitet`,
        recommendation: text((recommendationFor("ops", "supplier") || {}).title || "Agenten nur mit Kontext versorgen, keine Live-Aktion."),
        activity: security.autonomyLocked ? "Autonomie gesperrt" : "Autonomie vorbereitet",
      },
      {
        icon: "🧠",
        title: "Memory Brain",
        status: preferences.enabled ? "Bereit" : "Gesperrt",
        tone: preferences.enabled ? "good" : "bad",
        metricLabel: "Muster",
        metricValue: String(safeNumber(memoryState.winners.length + memoryState.riskySuppliers.length + memoryState.cashflowPatterns.length)),
        summary: `${safeNumber(memoryState.winners.length)} Winner | ${safeNumber(memoryState.riskySuppliers.length)} Supplier-Muster`,
        recommendation: text(memoryState.frequentProblems[memoryState.frequentProblems.length - 1] || "Weitere Muster sammeln."),
        activity: `Letzt gelernt ${formatRelativeTime(memoryState.lastLearnedAt)}`,
      },
      {
        icon: "📈",
        title: "Forecast Brain",
        status: statusLabel((modules.forecastBrain && (safeNumber(modules.forecastBrain.day7) < 0 ? "critical" : safeNumber(modules.forecastBrain.day7) < 100 ? "caution" : "healthy")) || "healthy"),
        tone: mapStatusDot((modules.forecastBrain && (safeNumber(modules.forecastBrain.day7) < 0 ? "critical" : safeNumber(modules.forecastBrain.day7) < 100 ? "caution" : "healthy")) || "healthy"),
        metricLabel: "7 Tage",
        metricValue: formatCurrency(modules.forecastBrain && modules.forecastBrain.day7),
        summary: `14 Tage ${formatCurrency(modules.forecastBrain && modules.forecastBrain.day14)} | 30 Tage ${formatCurrency(modules.forecastBrain && modules.forecastBrain.day30)}`,
        recommendation: text((recommendationFor("reserve", "cashflow") || {}).title || "Forecast taeglich vergleichen."),
        activity: `${formatCurrency(((modules.forecastBrain && modules.forecastBrain.expectedPayouts) || {}).day7)} erwartete Auszahlung`,
      },
      {
        icon: "🏭",
        title: "Supplier Brain",
        status: statusLabel((modules.supplierBrain && ((modules.supplierBrain.riskySuppliers || []).length ? "caution" : "healthy")) || "healthy"),
        tone: mapStatusDot((modules.supplierBrain && ((modules.supplierBrain.riskySuppliers || []).length ? "caution" : "healthy")) || "healthy"),
        metricLabel: "Trusted",
        metricValue: String(safeNumber(modules.supplierBrain && (modules.supplierBrain.trustedSuppliers || []).length)),
        summary: `${safeNumber(modules.supplierBrain && (modules.supplierBrain.riskySuppliers || []).length)} riskant | Ø Reliability ${Math.round(safeNumber(modules.supplierBrain && modules.supplierBrain.averageReliability))}%`,
        recommendation: text((recommendationFor("supplier") || {}).title || ((((modules.supplierBrain && modules.supplierBrain.riskySuppliers) || [])[0] || {}).name) || "Supplier-Lage wirkt stabil."),
        activity: `${safeNumber((modules.supplierBrain && modules.supplierBrain.suppliers || []).length)} Supplier bewertet`,
      },
      {
        icon: "🧪",
        title: "Simulation Brain",
        status: statusLabel((modules.simulationBrain && modules.simulationBrain.status) || "prepared"),
        tone: mapStatusDot((modules.simulationBrain && modules.simulationBrain.status) || "prepared"),
        metricLabel: "Szenarien",
        metricValue: String(safeNumber(modules.simulationBrain && (modules.simulationBrain.recommendedScenarios || []).length)),
        summary: text((modules.simulationBrain && modules.simulationBrain.note) || "Simulationen koennen vorbereitet werden."),
        recommendation: text(formatScenarioLabel(((modules.simulationBrain && modules.simulationBrain.recommendedScenarios) || [])[0]) || "Simulation auswaehlen"),
        activity: sim ? `${formatScenarioLabel(sim.type)} | ${statusLabel(sim.risk)}` : "Noch keine Simulation ausgefuehrt",
      },
    ];
    const riskHeatmap = [
      { label: "Cashflow", level: heatLevelFromStatus(modules.cashflowBrain && modules.cashflowBrain.status), detail: text((modules.cashflowBrain && modules.cashflowBrain.warnings && modules.cashflowBrain.warnings[0]) || "Stabil") },
      { label: "Supplier", level: heatLevelFromStatus((modules.supplierBrain && (modules.supplierBrain.riskySuppliers || []).length) ? "high" : "low"), detail: `${safeNumber(modules.supplierBrain && (modules.supplierBrain.riskySuppliers || []).length)} riskante Supplier` },
      { label: "Orders", level: heatLevelFromStatus((safeNumber(modules.orderBrain && modules.orderBrain.averageReturnProbability) > 22 || safeNumber(modules.orderBrain && (modules.orderBrain.riskOrders || []).length) > 0) ? "high" : "low"), detail: `${safeNumber(modules.orderBrain && modules.orderBrain.openOrders)} offene Orders` },
      { label: "Compliance", level: heatLevelFromStatus(modules.complianceBrain && modules.complianceBrain.level), detail: text(((modules.complianceBrain && modules.complianceBrain.warnings) || [])[0] || "Keine Eskalation") },
      { label: "Returns", level: heatLevelFromStatus((modules.supportBrain && modules.supportBrain.status) || "low"), detail: `${safeNumber(modules.supportBrain && modules.supportBrain.returnLoad)} Ruecklaeufer / Support` },
      { label: "Listings", level: heatLevelFromStatus((modules.seoBrain && modules.seoBrain.status) || "low"), detail: text(((modules.seoBrain && modules.seoBrain.warnings) || [])[0] || "Listing-Basis wirkt stabil") },
    ];
    const memoryTags = unique([]
      .concat(memoryState.winners.slice(-2))
      .concat(memoryState.riskySuppliers.slice(-2))
      .concat(memoryState.cashflowPatterns.slice(-2))
      .concat(memoryState.riskDevelopments.slice(-2))
    ).slice(0, 8);
    const debugVisible = text(preferences.debugLevel).toLowerCase() !== "off";

    root.innerHTML = `
      <div class="brain-center-shell">
        <div class="brain-status-bar">
          <div class="brain-status-chip ${preferences.enabled ? "good" : "bad"}"><span class="brain-status-dot ${preferences.enabled ? "good" : "bad"}"></span><strong>${preferences.enabled ? "Brain Online" : "Brain Offline"}</strong></div>
          <div class="brain-status-chip ${security.sandboxMode ? "warn" : "good"}"><span class="brain-status-dot ${security.sandboxMode ? "warn" : "good"}"></span><strong>${security.sandboxMode ? "Sandbox aktiv" : "Sandbox aus"}</strong></div>
          <div class="brain-status-chip ${security.autonomyLocked ? "warn" : "good"}"><span class="brain-status-dot ${security.autonomyLocked ? "warn" : "good"}"></span><strong>${security.autonomyLocked ? "Autonomie gesperrt" : "Autonomie vorbereitet"}</strong></div>
          <div class="brain-status-chip info"><span class="brain-status-dot good"></span><strong>${safeNumber(primaryAgents.length)} Agenten verbunden</strong></div>
        </div>
        <div class="brain-center-stage">
          <div class="brain-main-column">
            <div class="brain-hero-grid">
              <section class="brain-hero-card">
                <div class="brain-hero-top">
                  <div>
                    <span class="brain-center-kicker">Elyon Business Brain</span>
                    <h3>Elyon Brain Center</h3>
                    <p class="brain-center-copy">Zentrale Analyse-, Visualisierungs- und Entscheidungsschicht fuer Cashflow, Produkte, Orders, Risiko, Supplier, Forecasts, Analytics und KI-Kontexte. Live-Aktionen bleiben gesperrt.</p>
                  </div>
                  <span class="brain-version-badge">${escapeHtml(VERSION)}</span>
                </div>
                <div class="brain-hero-stats">
                  <article class="brain-hero-stat"><small>Health Score</small><strong>${healthScore}</strong><span>${escapeHtml(statusLabel(healthStatus))}</span></article>
                  <article class="brain-hero-stat"><small>Risiko</small><strong>${escapeHtml(statusLabel(riskLevel))}</strong><span>${safeNumber(brain.systemRisk.score)} Punkte</span></article>
                  <article class="brain-hero-stat"><small>Cashflow</small><strong>${formatCurrency(brain.dashboardSummary.freeLiquidity)}</strong><span>${escapeHtml(statusLabel(cashflowStatus))}</span></article>
                  <article class="brain-hero-stat"><small>Letzte Analyse</small><strong>${escapeHtml(lastAnalysisLabel)}</strong><span>${escapeHtml(text(brain.dashboardSummary.securityStatus || securityLabel))}</span></article>
                </div>
                <div class="brain-hero-meta">
                  <div class="brain-hero-meta-card"><small>Heutiger Fokus</small><strong>${escapeHtml(focusText)}</strong></div>
                  <div class="brain-hero-meta-card"><small>Naechste Aktion</small><strong>${escapeHtml(nextActions[0] && (nextActions[0].title || nextActions[0].label || text(nextActions[0])) || "Noch keine Aktion priorisiert")}</strong></div>
                </div>
                <div class="brain-center-actions brain-center-actions-inline">
                  <button type="button" class="secondary" data-brain-action="recalculate">Analyse neu berechnen</button>
                  <button type="button" class="secondary" data-brain-action="simulate">Standard-Simulation</button>
                  <button type="button" class="secondary" data-brain-action="test-agent-context">Agenten-Kontext testen</button>
                </div>
              </section>
              <section class="brain-health-card">
                <div class="brain-health-ring ${healthTone}" style="--brain-ring:${healthScore * 3.6}deg;--brain-ring-color:${healthRingColor}">
                  <div class="brain-health-ring-core">
                    <small>Business Health</small>
                    <strong>${healthScore}%</strong>
                    <span>${escapeHtml(statusLabel(healthStatus))}</span>
                  </div>
                </div>
                <div class="brain-health-breakdown">
                  <div><small>Datenqualitaet</small><strong>${safeNumber(brain.businessHealth.dataQuality)}%</strong></div>
                  <div><small>Produktqualitaet</small><strong>${safeNumber(brain.businessHealth.productQuality)}%</strong></div>
                  <div><small>Skalierbarkeit</small><strong>${escapeHtml(text(brain.businessHealth.scalingAbility || "restricted"))}</strong></div>
                  <div><small>Mini-Brains</small><strong>${safeNumber(connectedBrains.length)}</strong></div>
                </div>
              </section>
            </div>
            <div class="brain-module-grid">
              ${brainCards.map((card) => `
                <article class="brain-module-overview-card">
                  <div class="brain-module-overview-top">
                    <div class="brain-module-overview-title">
                      <span class="brain-module-icon">${card.icon}</span>
                      <div>
                        <h4>${escapeHtml(card.title)}</h4>
                        <span class="brain-badge ${card.tone}">${escapeHtml(card.status)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="brain-module-metric"><small>${escapeHtml(card.metricLabel)}</small><strong>${escapeHtml(card.metricValue)}</strong></div>
                  <p class="brain-panel-copy">${escapeHtml(card.summary)}</p>
                  <div class="brain-module-foot">
                    <div><small>Empfehlung</small><strong>${escapeHtml(card.recommendation)}</strong></div>
                    <span>${escapeHtml(card.activity)}</span>
                  </div>
                </article>
              `).join("")}
            </div>
            <div class="brain-main-panels">
              <section class="brain-panel brain-panel-span-2">
                <div class="brain-panel-head">
                  <h4>Soul Network</h4>
                  <span class="brain-badge info">${safeNumber(connectedAgents.length)} Kontexte vorbereitet</span>
                </div>
                <p class="brain-panel-copy">Verbundenes Agenten-Netzwerk fuer Finance, Guard, Scout, SEO, Support und Operations. Weitere Souls sind vorbereitet, aber nicht autonom aktiv.</p>
                <div class="brain-network-board">
                  <div class="brain-network-hub"><strong>Elyon Brain</strong><span>Kontext-Hub</span></div>
                  <div class="brain-network-grid">
                    ${primaryAgents.map((agent) => `<article class="brain-network-node"><strong>${escapeHtml(agent.key)}</strong><span class="brain-badge ${mapStatusDot(agent.state)}">${escapeHtml(agent.state)}</span></article>`).join("")}
                  </div>
                  <div class="brain-network-future">
                    ${futureAgents.map((agent) => `<span class="brain-network-chip">${escapeHtml(agent)} <em>Vorbereitet</em></span>`).join("")}
                  </div>
                </div>
              </section>
              <section class="brain-panel">
                <div class="brain-panel-head">
                  <h4>Risk Heatmap</h4>
                  <span class="brain-badge ${toneClassForStatus(riskLevel)}">${escapeHtml(statusLabel(riskLevel))}</span>
                </div>
                <div class="brain-heatmap">
                  ${riskHeatmap.map((item) => `<article class="brain-heatmap-row"><div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.detail)}</p></div><span class="brain-heat-dot ${item.level}"></span></article>`).join("")}
                </div>
              </section>
              <section class="brain-panel">
                <div class="brain-panel-head">
                  <h4>Brain Memory</h4>
                  <span class="brain-badge info">${safeNumber(memoryTags.length)} Signale</span>
                </div>
                <p class="brain-panel-copy">Wiederkehrende Muster aus Winners, Supplier-Risiken, Cashflow-Verhalten und Risikoentwicklungen.</p>
                <div class="brain-memory-cloud">
                  ${memoryTags.map((item) => `<span class="brain-memory-tag">${escapeHtml(item)}</span>`).join("") || `<span class="brain-memory-tag">Noch keine Muster gespeichert</span>`}
                </div>
                <p class="brain-panel-copy">Letztes Lernen: ${escapeHtml(formatRelativeTime(memoryState.lastLearnedAt))}</p>
              </section>
              <section class="brain-panel">
                <div class="brain-panel-head">
                  <h4>Simulation Lab</h4>
                  <span class="brain-badge info">${sim ? "Zuletzt ausgefuehrt" : "Nur Testmodus"}</span>
                </div>
                <p class="brain-panel-copy">Nur Simulationen, keine Live-Ausfuehrung. Alle Szenarien bleiben innerhalb der bestehenden Sicherheitslogik.</p>
                <div class="brain-sim-grid">
                  <button type="button" class="secondary" data-brain-scenario="new_product_test" data-buy-cost="300">5 neue Produkte simulieren</button>
                  <button type="button" class="secondary" data-brain-scenario="new_product_test" data-buy-cost="600">10 neue Produkte simulieren</button>
                  <button type="button" class="secondary" data-brain-scenario="multi_returns" data-count="4" data-avg-refund="24">Retouren-Szenario testen</button>
                  <button type="button" class="secondary" data-brain-scenario="payout_delay" data-delay-cost="180">Cashflow-Stresstest</button>
                </div>
                ${sim ? `<div class="brain-sim-result"><strong>${escapeHtml(formatScenarioLabel(sim.type))}</strong><p>Risiko: ${escapeHtml(statusLabel(sim.risk))} | Effekt: ${formatCurrency(sim.liquidityImpact)} | Ergebnis: ${formatCurrency(sim.resultingLiquidity)}</p><span>${escapeHtml(sim.recommendation)}</span></div>` : `<div class="brain-sim-result"><strong>Simulation bereit</strong><p>${escapeHtml(text((modules.simulationBrain && modules.simulationBrain.note) || "Szenarien koennen jetzt sicher getestet werden."))}</p></div>`}
              </section>
              <section class="brain-panel brain-panel-span-2">
                <div class="brain-panel-head">
                  <h4>Mini-Brains Status</h4>
                  <span class="brain-badge info">${safeNumber(connectedBrains.length)} aktiv</span>
                </div>
                <p class="brain-panel-copy">Alle spezialisierten Brains mit aktuellem Status, Kurzdiagnose und sauberem Einzug innerhalb des Moduls.</p>
                <div class="brain-status-list">
                  ${moduleStatusItems || `<p class="brain-empty">Noch keine Mini-Brains verbunden.</p>`}
                </div>
              </section>
            </div>
          </div>
          <aside class="brain-right-rail">
            <section class="brain-panel">
              <div class="brain-panel-head">
                <h4>Brain Activity</h4>
                <span class="brain-badge info">${eventLogs.length} Eintraege</span>
              </div>
              <div class="brain-activity-feed">
                ${eventLogs.map((item) => `<article class="brain-activity-item"><span class="brain-activity-line"></span><div><strong>${escapeHtml(summarizeEventName(item.eventName))}</strong><p>${escapeHtml(formatRelativeTime(item.createdAt))}</p></div></article>`).join("") || `<p class="brain-empty">Noch keine Events protokolliert.</p>`}
              </div>
            </section>
            <section class="brain-panel">
              <div class="brain-panel-head">
                <h4>Top Empfehlungen</h4>
                <span class="brain-badge info">${preferences.enabled ? topRecommendations.length : 0} aktiv</span>
              </div>
              <div class="brain-list">
                ${preferences.enabled ? (topRecommendations.map((item) => `<article class="brain-list-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><span class="brain-badge ${toneClassForStatus(item.priority)}">${escapeHtml(item.priority)}</span></article>`).join("") || `<p class="brain-empty">Noch keine Empfehlungen gespeichert.</p>`) : `<p class="brain-empty">Business Brain ist aktuell deaktiviert. Aktiviere es in den Einstellungen.</p>`}
              </div>
            </section>
            <section class="brain-panel">
              <div class="brain-panel-head">
                <h4>Warnungen und Fokus</h4>
                <span class="brain-badge ${toneClassForStatus(riskLevel)}">${escapeHtml(statusLabel(riskLevel))}</span>
              </div>
              <p class="brain-focus-copy">${escapeHtml(focusText)}</p>
              <div class="brain-pills">
                ${toArray(brain.systemRisk.warnings).slice(0, 5).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || `<span class="pill">Keine akuten Warnungen</span>`}
              </div>
            </section>
            <section class="brain-panel">
              <div class="brain-panel-head">
                <h4>Agenten-Kontext</h4>
                <span class="brain-badge info">Vorbereitet</span>
              </div>
              <div class="brain-list compact">
                ${agentPreview.map((agentKey) => {
                  const context = ElyonBusinessBrain.getAgentContext(agentKey);
                  return `<article class="brain-list-item"><strong>${escapeHtml(agentKey)}</strong><p>${escapeHtml(text(context.role))} | ${escapeHtml(text(context.warnings[0] || "Keine Warnung"))}</p></article>`;
                }).join("")}
              </div>
            </section>
            ${debugVisible ? `
              <section class="brain-panel">
                <div class="brain-panel-head">
                  <h4>Debug Panel</h4>
                  <span class="brain-badge warn">Lokal</span>
                </div>
                <div class="brain-debug-grid">
                  <button type="button" class="secondary" data-brain-action="show-state">Brain State</button>
                  <button type="button" class="secondary" data-brain-action="test-events">Events testen</button>
                  <button type="button" class="secondary" data-brain-action="check-storage">localStorage pruefen</button>
                  <button type="button" class="secondary" data-brain-action="load-testdata">Testdaten laden</button>
                </div>
                <pre data-brain-debug-output class="brain-debug-output">Bereit.</pre>
              </section>
            ` : ""}
          </aside>
        </div>
      </div>
    `;
    bindBrainCenter(root);
    const secondaryRoots = ["elyonBrainCenterRoot", "elyonBrainCenterTabRoot"]
      .map((id) => document.getElementById(id))
      .filter((node) => node && node !== root);
    secondaryRoots.forEach((node) => {
      node.innerHTML = root.innerHTML;
      bindBrainCenter(node);
    });
  };

  renderBrainSettingsTab = function renderBrainSettingsTabClean() {
    const root = document.getElementById("elyonBrainSettingsTabRoot");
    if (!root) return;
    const brain = ElyonBusinessBrain.getBrainState();
    const preferences = mergeObjects(createDefaultBrainPreferences(), brain.preferences || getBrainPreferences());
    const recommendations = mergeObjects(createDefaultRecommendationsState(), loadObject(STORAGE_KEYS.recommendations)).items.slice(0, 3);
    root.innerHTML = `
      <h2>Elyon Business Brain</h2>
      <p class="hint">Zentrale Intelligenzschicht fuer Business Health, Risiko, Forecast, Empfehlungen und Agenten-Kontext. Live-Aktionen bleiben blockiert.</p>
      <div class="dashboard">
        <div class="metric"><small>Health</small><strong>${safeNumber(brain.businessHealth.score)} / 100</strong></div>
        <div class="metric"><small>Risiko</small><strong>${escapeHtml(text(brain.systemRisk.level || "medium"))}</strong></div>
        <div class="metric"><small>Freie Liquiditaet</small><strong>${formatCurrency(brain.dashboardSummary.freeLiquidity)}</strong></div>
        <div class="metric"><small>Status</small><strong>${escapeHtml(text(brain.brainStatus || "idle"))}</strong></div>
      </div>
      <div class="output-box" style="margin-top:14px">
        <p><strong>Aktiv:</strong> ${preferences.enabled ? "Ja" : "Nein"} · <strong>Analyse:</strong> ${escapeHtml(preferences.analysisMode)} · <strong>Refresh:</strong> ${escapeHtml(preferences.refreshMode)} · <strong>Debug:</strong> ${escapeHtml(preferences.debugLevel)}</p>
      </div>
      <div class="row" style="margin-top:10px">
        <button type="button" class="secondary full" data-brain-nav="agents">Vollansicht im Agentenbereich oeffnen</button>
        <button type="button" class="secondary full" data-brain-settings-action="recalculate">Analyse neu berechnen</button>
        <button type="button" class="secondary full" data-brain-nav="main">Eigenen Brain-Tab oeffnen</button>
        <button type="button" class="secondary full" data-brain-nav="settings">Zu Einstellungen springen</button>
      </div>
      <div class="output-box" style="margin-top:14px">
        <p><strong>Heutiger Fokus:</strong> ${escapeHtml(text(brain.dashboardSummary.todayFocus || "Noch kein Fokus berechnet."))}</p>
        <p><strong>Top Empfehlungen:</strong></p>
        <ul>${recommendations.map((item) => `<li>${escapeHtml(item.title)} - ${escapeHtml(item.detail)}</li>`).join("") || "<li>Noch keine Empfehlungen gespeichert.</li>"}</ul>
      </div>
    `;
    root.querySelectorAll("[data-brain-nav]").forEach((button) => {
      if (button.dataset.bound === "yes") return;
      button.dataset.bound = "yes";
      button.addEventListener("click", () => openBrainCenterTarget(button.dataset.brainNav));
    });
    root.querySelectorAll("[data-brain-settings-action]").forEach((button) => {
      if (button.dataset.bound === "yes") return;
      button.dataset.bound = "yes";
      button.addEventListener("click", () => {
        if (button.dataset.brainSettingsAction === "recalculate") {
          ElyonBusinessBrain.recalculateAll();
          renderBrainSettingsTab();
          renderBrainSettingsModal();
          renderBrainCenter();
        }
      });
    });
  };

  renderBrainSettingsModal = function renderBrainSettingsModalClean() {
    const root = document.getElementById("elyonBrainSettingsModalRoot");
    if (!root) return;
    const brain = ElyonBusinessBrain.getBrainState();
    const preferences = mergeObjects(createDefaultBrainPreferences(), brain.preferences || getBrainPreferences());
    root.innerHTML = `
      <p><strong>Health:</strong> ${safeNumber(brain.businessHealth.score)} / 100 · ${escapeHtml(text(brain.businessHealth.status || "watch"))}</p>
      <p><strong>Risiko:</strong> ${escapeHtml(text(brain.systemRisk.level || "medium"))} · <strong>Freie Liquiditaet:</strong> ${formatCurrency(brain.dashboardSummary.freeLiquidity)}</p>
      <p><strong>Brain:</strong> ${preferences.enabled ? "Aktiv" : "Deaktiviert"} · <strong>Refresh:</strong> ${escapeHtml(preferences.refreshMode)} · <strong>Debug:</strong> ${escapeHtml(preferences.debugLevel)}</p>
      <p><strong>Fokus:</strong> ${escapeHtml(text(brain.dashboardSummary.todayFocus || "Noch keine Priorisierung"))}</p>
    `;
    const openSettingsBtn = document.getElementById("openBrainCenterSettingsBtn");
    if (openSettingsBtn && openSettingsBtn.dataset.bound !== "yes") {
      openSettingsBtn.dataset.bound = "yes";
      openSettingsBtn.addEventListener("click", () => openBrainCenterTarget("settings"));
    }
    const openAgentBtn = document.getElementById("openBrainCenterAgentBtn");
    if (openAgentBtn && openAgentBtn.dataset.bound !== "yes") {
      openAgentBtn.dataset.bound = "yes";
      openAgentBtn.addEventListener("click", () => openBrainCenterTarget("agents"));
    }
    const openMainBtn = document.getElementById("openBrainCenterMainTabBtn");
    if (openMainBtn && openMainBtn.dataset.bound !== "yes") {
      openMainBtn.dataset.bound = "yes";
      openMainBtn.addEventListener("click", () => openBrainCenterTarget("main"));
    }
    const recalcBtn = document.getElementById("brainRecalculateFromSettingsBtn");
    if (recalcBtn && recalcBtn.dataset.bound !== "yes") {
      recalcBtn.dataset.bound = "yes";
      recalcBtn.addEventListener("click", () => scheduleRender());
    }
  };

  function scheduleRender() {
    const preferences = getBrainPreferences();
    if (preferences.refreshMode !== "manual") {
      ElyonBusinessBrain.recalculateAll();
    }
    renderBrainCenter();
    renderBrainSettingsTab();
    renderBrainSettingsModal();
  }

  window.ElyonBusinessBrain = ElyonBusinessBrain;
  window.refreshElyonBusinessBrain = scheduleRender;

  document.addEventListener("DOMContentLoaded", () => {
    ElyonBusinessBrain.initBrain();
    renderBrainCenter();
    renderBrainSettingsTab();
    renderBrainSettingsModal();
    [
      "elyon:brain-ready",
      "elyon:brain-updated",
      "elyon:cashflow-updated",
      "elyon:risk-warning",
      "elyon:recommendation-created",
      "elyon:simulation-created",
      "elyon:new-order",
      "elyon:product-updated",
      "elyon:supplier-risk",
    ].forEach((eventName) => {
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener(eventName, () => renderBrainCenter());
      }
    });
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("storage", (event) => {
        if (!event || !event.key) return;
        if (Object.values(STORAGE_KEYS).includes(event.key)) scheduleRender();
      });
    }
  });
})();
