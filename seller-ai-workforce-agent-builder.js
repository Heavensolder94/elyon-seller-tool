(() => {
  "use strict";

  const CUSTOM_AGENTS_KEY = "elyon_ai_custom_agents_v1";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const STYLE_ID = "elyonAiAgentBuilderStyles";
  const BUILDER_ID = "elyonAiAgentBuilderModal";
  const TASK_ID = "elyonAiAgentTaskComposerModal";

  const BUILTIN_AGENTS = [
    { id: "elyon-operations-manager", name: "Elyon Manager", icon: "🧠", action: "create_daily_briefing", context: "manager" },
    { id: "elyon-product-data-checker", name: "Product Data", icon: "🧩", action: "analyze_product", context: "product" },
    { id: "elyon-compliance-guard", name: "Compliance", icon: "🛡️", action: "analyze_product", context: "product" },
    { id: "elyon-profit-analyst", name: "Profit", icon: "📊", action: "analyze_product", context: "product" },
    { id: "elyon-listing-pro", name: "Listing", icon: "✍️", action: "analyze_listing", context: "product" },
    { id: "elyon-order-coordinator", name: "Orders", icon: "📦", action: "analyze_order", context: "order" },
    { id: "elyon-support-assistant", name: "Support", icon: "💬", action: "analyze_return", context: "return" },
  ];

  const AUTONOMY_MODES = [
    ["off", "0 · Aus"],
    ["manual", "1 · Manuell"],
    ["assisted", "2 · Assistiert"],
    ["semi", "3 · Teilautomatisch"],
    ["auto_internal", "4 · Vollautomatisch intern"],
    ["auto_external", "5 · Vollautomatisch extern"],
  ];

  const state = { observer: null, renderQueued: false };

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function text(value, fallback = "") {
    return value === null || value === undefined ? fallback : String(value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function slugify(value) {
    return text(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "mitarbeiter";
  }

  function listCustomAgents() {
    const data = readJson(CUSTOM_AGENTS_KEY, []);
    return Array.isArray(data) ? data.filter((agent) => agent && agent.id && agent.name) : [];
  }

  function saveCustomAgents(agents) {
    return writeJson(CUSTOM_AGENTS_KEY, (Array.isArray(agents) ? agents : []).slice(0, 50));
  }

  function getCustomAgent(id) {
    return listCustomAgents().find((agent) => agent.id === id) || null;
  }

  function upsertCustomAgent(agent) {
    const agents = listCustomAgents();
    const index = agents.findIndex((entry) => entry.id === agent.id);
    if (index >= 0) agents[index] = { ...agents[index], ...agent, updatedAt: new Date().toISOString() };
    else agents.unshift({ ...agent, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    saveCustomAgents(agents);
    queueDecorate();
  }

  function deleteCustomAgent(id) {
    const agent = getCustomAgent(id);
    if (!agent) return;
    if (!window.confirm(`Mitarbeiter „${agent.name}“ wirklich löschen? Seine bisherigen Aufgaben bleiben in der Arbeitsmappe erhalten.`)) return;
    saveCustomAgents(listCustomAgents().filter((entry) => entry.id !== id));
    queueDecorate();
  }

  function upsertTask(task) {
    if (!task?.id) return;
    const tasks = readJson(TASKS_KEY, []);
    const list = Array.isArray(tasks) ? tasks : [];
    const index = list.findIndex((entry) => entry?.id === task.id);
    if (index >= 0) list[index] = { ...list[index], ...task, updatedAt: task.updatedAt || new Date().toISOString() };
    else list.unshift(task);
    writeJson(TASKS_KEY, list.slice(0, 150));
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-custom-task-updated", { detail: task }));
  }

  function collection(keys) {
    for (const key of keys) {
      const value = readJson(key, null);
      if (Array.isArray(value) && value.length) return value;
      if (value && typeof value === "object" && Array.isArray(value.items) && value.items.length) return value.items;
      if (value && typeof value === "object" && Array.isArray(value.products) && value.products.length) return value.products;
    }
    return [];
  }

  function selectedProduct() {
    const products = collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]);
    const selectedId = text(window.elyonSelectedProductId || localStorage.getItem("elyonSelectedProductId") || localStorage.getItem("elyon_active_product_id"));
    return products.find((item) => selectedId && [item?.id, item?.productId, item?.sku].map(text).includes(selectedId)) || products.find((item) => ["ready_for_seller_tool", "bereit_manuell_einstellen"].includes(item?.status)) || products[0] || {};
  }

  function orderSummary(order) {
    if (!order || typeof order !== "object") return {};
    return {
      id: order.id || order.orderId || order.ebayOrderId || "",
      status: order.status || order.orderStatus || "",
      orderDate: order.orderDate || order.createdAt || "",
      shippingDeadline: order.shippingDeadline || order.shipByDate || "",
      trackingNumber: order.trackingNumber || order.tracking || "",
      total: order.total || order.totalAmount || "",
      currency: order.currency || "EUR",
      items: Array.isArray(order.items) ? order.items.slice(0, 20).map((item) => ({ sku: item?.sku || "", title: item?.title || item?.name || "", quantity: item?.quantity || 0, price: item?.price || "" })) : [],
    };
  }

  function returnSummary(item) {
    if (!item || typeof item !== "object") return {};
    return {
      id: item.id || item.returnId || "",
      orderId: item.orderId || item.ebayOrderId || "",
      status: item.status || "",
      reason: item.reason || item.returnReason || item.issue || "",
      createdAt: item.createdAt || item.date || "",
      amount: item.amount || item.refundAmount || "",
    };
  }

  function buildCustomContext(agent) {
    const access = agent.contextAccess || {};
    const product = selectedProduct();
    const context = {};
    if (access.product !== false) context.product = product;
    if (access.listing) context.listingDraft = product?.listingDraft || product?.listing?.draft || product?.listing || {};
    if (access.market) context.market = product?.marketResearch || product?.ebayMarketResearch || product?.marketCheck || {};
    if (access.orders) context.orders = collection(["elyonOrders", "ebayOrders", "elyonSales"]).slice(0, 10).map(orderSummary);
    if (access.returns) context.returns = collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]).slice(0, 10).map(returnSummary);
    if (access.tasks) context.tasks = (readJson(TASKS_KEY, []) || []).slice(0, 20).map((task) => ({ id: task?.id, agentId: task?.agentId, title: task?.title, status: task?.status, summary: task?.result?.summary || "" }));
    return context;
  }

  function buildBuiltinContext(definition) {
    const product = selectedProduct();
    if (definition.context === "product") return { product };
    if (definition.context === "order") return { order: collection(["elyonOrders", "ebayOrders", "elyonSales"])[0] || {} };
    if (definition.context === "return") return { returnCase: collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"])[0] || {} };
    return {
      context: {
        products: collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]).slice(0, 50),
        orders: collection(["elyonOrders", "ebayOrders", "elyonSales"]).slice(0, 30).map(orderSummary),
        returns: collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]).slice(0, 30).map(returnSummary),
        tasks: (readJson(TASKS_KEY, []) || []).slice(0, 40),
      },
    };
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .aiw-builder-nav-action{color:#bfdbfe!important}.aiw-builder-nav-action.primary{background:rgba(37,99,235,.16)!important;color:#dbeafe!important}
      .aiw-custom-team{margin-top:14px;padding-top:14px;border-top:1px solid rgba(148,163,184,.14)}.aiw-custom-team-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}.aiw-custom-team-head h4{margin:0;font-size:12px}.aiw-custom-team-head p{margin:3px 0 0;color:#8fa2b8;font-size:9px}.aiw-custom-list{display:grid;gap:7px}.aiw-custom-row{display:grid;grid-template-columns:minmax(180px,1fr) 120px auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid rgba(148,163,184,.14);border-radius:13px;background:rgba(7,16,29,.42)}.aiw-custom-name{display:flex;gap:9px;align-items:center;min-width:0}.aiw-custom-name strong{font-size:12px}.aiw-custom-name small{display:block;color:#8fa2b8;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aiw-custom-mode{font-size:9px;color:#aebdce}.aiw-custom-actions{display:flex;gap:5px}.aiw-custom-actions button{padding:7px 9px;border-radius:9px;font-size:10px;white-space:nowrap}
      .aiw-builder-backdrop{position:fixed;inset:0;z-index:19500;background:rgba(2,6,23,.84);backdrop-filter:blur(8px);display:flex;justify-content:flex-end}.aiw-builder-panel{width:min(820px,100%);height:100%;overflow:auto;background:#0b1422;border-left:1px solid rgba(148,163,184,.16);color:#e8eef7;padding:20px}.aiw-builder-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-20px;background:#0b1422;padding:20px 0 13px;z-index:4;border-bottom:1px solid rgba(148,163,184,.14)}.aiw-builder-head h2{margin:0;font-size:18px}.aiw-builder-head p{margin:5px 0 0;color:#8fa2b8;font-size:11px}.aiw-builder-tabs{display:flex;gap:6px;overflow:auto;margin:14px 0}.aiw-builder-tabs button{padding:8px 10px;border-radius:10px;font-size:10px;white-space:nowrap;background:rgba(255,255,255,.05)!important;border:1px solid rgba(148,163,184,.12)!important;color:#aebdce!important}.aiw-builder-tabs button.active{background:rgba(37,99,235,.16)!important;color:#dbeafe!important;border-color:rgba(96,165,250,.28)!important}.aiw-builder-tab{display:none}.aiw-builder-tab.active{display:block}.aiw-builder-section{padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:15px;background:rgba(15,31,50,.52)}.aiw-builder-section h3{margin:0 0 10px;font-size:12px}.aiw-builder-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.aiw-builder-field{display:grid;gap:5px;font-size:10px;color:#cbd5e1}.aiw-builder-field.full{grid-column:1/-1}.aiw-builder-field input,.aiw-builder-field select,.aiw-builder-field textarea{margin:0;padding:10px;border-radius:10px;background:#07101d;color:#e8eef7;border:1px solid rgba(148,163,184,.18)}.aiw-builder-field textarea{min-height:120px;resize:vertical;line-height:1.45}.aiw-builder-field textarea.prompt{min-height:300px}.aiw-builder-help{font-size:9px;color:#7f93aa;line-height:1.5}.aiw-builder-checks{display:grid;grid-template-columns:1fr 1fr;gap:8px}.aiw-builder-check{display:flex;gap:8px;align-items:flex-start;padding:9px;border-radius:10px;background:rgba(255,255,255,.035);font-size:10px}.aiw-builder-safety{padding:12px;border-radius:12px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.18);font-size:10px;line-height:1.55;color:#fde68a}.aiw-builder-actions{position:sticky;bottom:-20px;background:#0b1422;border-top:1px solid rgba(148,163,184,.14);padding:13px 0 20px;margin-top:14px;display:flex;gap:8px;flex-wrap:wrap}.aiw-builder-danger{background:rgba(239,68,68,.1)!important;border:1px solid rgba(239,68,68,.22)!important;color:#fecaca!important}
      .aiw-task-composer-summary{display:grid;gap:9px;margin-top:10px;padding:12px;border:1px solid rgba(96,165,250,.18);border-radius:12px;background:rgba(37,99,235,.07)}.aiw-task-composer-summary strong{font-size:11px}.aiw-task-composer-summary span{font-size:10px;color:#9fb0c3}
      @media(max-width:760px){.aiw-custom-row{grid-template-columns:1fr}.aiw-custom-actions{flex-wrap:wrap}.aiw-builder-grid,.aiw-builder-checks{grid-template-columns:1fr}.aiw-builder-field.full{grid-column:auto}.aiw-builder-panel{padding:14px}.aiw-builder-head{top:-14px;padding-top:14px}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    const old = document.querySelector(".aiw-builder-toast");
    old?.remove();
    const node = document.createElement("div");
    node.className = "aiw-toast aiw-builder-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function modeLabel(mode) {
    return AUTONOMY_MODES.find(([id]) => id === mode)?.[1] || "1 · Manuell";
  }

  function decorateNav() {
    const nav = document.querySelector("#elyonAiWorkforce .aiw-v3-nav");
    if (!nav || nav.querySelector("[data-agent-builder-create]")) return;
    const sep = document.createElement("div");
    sep.className = "aiw-v3-nav-sep";
    const create = document.createElement("button");
    create.className = "aiw-builder-nav-action primary";
    create.dataset.agentBuilderCreate = "1";
    create.innerHTML = "＋ Mitarbeiter erstellen";
    create.addEventListener("click", () => openBuilder());
    const assign = document.createElement("button");
    assign.className = "aiw-builder-nav-action";
    assign.dataset.agentBuilderAssign = "1";
    assign.innerHTML = "✦ Mitarbeiter beauftragen";
    assign.addEventListener("click", () => openTaskComposer());
    nav.append(sep, create, assign);
  }

  function decorateCustomTeam() {
    const sections = [...document.querySelectorAll("#elyonAiWorkforce .aiw-v3-section")];
    const section = sections.find((node) => text(node.querySelector("h3")?.textContent).includes("Alle Fachmitarbeiter"));
    if (!section) return;
    section.querySelector(".aiw-custom-team")?.remove();
    const agents = listCustomAgents();
    const wrapper = document.createElement("div");
    wrapper.className = "aiw-custom-team";
    wrapper.innerHTML = `<div class="aiw-custom-team-head"><div><h4>Eigene Mitarbeiter</h4><p>Von dir definierte Rollen mit dauerhaftem System-Prompt.</p></div><button data-custom-create>＋ Neu</button></div>${agents.length ? `<div class="aiw-custom-list">${agents.map((agent) => `<div class="aiw-custom-row" data-custom-agent-id="${escapeHtml(agent.id)}"><div class="aiw-custom-name"><span>${escapeHtml(agent.icon || "🤖")}</span><div><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.role)}</small></div></div><span class="aiw-custom-mode">${escapeHtml(modeLabel(agent.autonomyMode))} · ${escapeHtml(agent.provider || "deepseek")}</span><div class="aiw-custom-actions"><button data-custom-assign>Beauftragen</button><button class="aiw-secondary" data-custom-edit>Bearbeiten</button><button class="aiw-builder-danger" data-custom-delete>Löschen</button></div></div>`).join("")}</div>` : '<div class="aiw-empty">Noch keine eigenen Mitarbeiter. Über „＋ Neu“ legst du einen Agenten mit eigenem System-Prompt an.</div>'}`;
    wrapper.querySelector("[data-custom-create]")?.addEventListener("click", () => openBuilder());
    wrapper.querySelectorAll("[data-custom-agent-id]").forEach((row) => {
      const id = row.dataset.customAgentId;
      row.querySelector("[data-custom-assign]")?.addEventListener("click", () => openTaskComposer(id));
      row.querySelector("[data-custom-edit]")?.addEventListener("click", () => openBuilder(id));
      row.querySelector("[data-custom-delete]")?.addEventListener("click", () => deleteCustomAgent(id));
    });
    section.appendChild(wrapper);
  }

  function renameLegacyTaskComposer() {
    const headings = [...document.querySelectorAll("h2,h3,h4")].filter((node) => text(node.textContent) === "Neue Aufgabe");
    headings.forEach((heading) => {
      const container = heading.closest("form,.card,section") || heading.parentElement;
      const content = text(container?.textContent);
      if (!container || !content.includes("Agent") || !content.includes("Priorität")) return;
      heading.textContent = "Mitarbeiter beauftragen";
      [...container.querySelectorAll("label")].forEach((label) => {
        if (text(label.childNodes?.[0]?.textContent || label.textContent) === "Beschreibung") {
          const firstText = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
          if (firstText) firstText.textContent = "Arbeitsauftrag / Aufgaben-Prompt";
        }
      });
      const promptField = [...container.querySelectorAll("textarea,input")].find((field) => /geprüft werden/i.test(field.placeholder || ""));
      if (promptField) promptField.placeholder = "Beschreibe die konkrete Aufgabe für diesen Mitarbeiter…";
      const button = [...container.querySelectorAll("button")].find((node) => /Aufgabe erstellen/i.test(node.textContent || ""));
      if (button) button.textContent = "Aufgabe an Mitarbeiter geben";
      container.dataset.elyonTaskComposerClarified = "1";
    });
  }

  function decorate() {
    decorateNav();
    decorateCustomTeam();
    renameLegacyTaskComposer();
  }

  function queueDecorate() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      decorate();
    });
  }

  function openBuilder(agentId = "") {
    installStyles();
    document.getElementById(BUILDER_ID)?.remove();
    const current = getCustomAgent(agentId) || {
      id: "",
      name: "",
      role: "",
      department: "general",
      icon: "🤖",
      systemPrompt: "",
      capabilities: [],
      provider: "deepseek",
      model: "",
      allowFallback: true,
      temperature: 0.2,
      maxTokens: 4000,
      autonomyMode: "manual",
      contextAccess: { product: true, listing: false, market: false, orders: false, returns: false, tasks: false },
      outputDetail: "standard",
    };
    const backdrop = document.createElement("div");
    backdrop.id = BUILDER_ID;
    backdrop.className = "aiw-builder-backdrop";
    backdrop.innerHTML = `<aside class="aiw-builder-panel"><div class="aiw-builder-head"><div><h2>${current.id ? "Mitarbeiter bearbeiten" : "Neuen Mitarbeiter erstellen"}</h2><p>Der System-Prompt hier ist die dauerhafte Hauptanweisung dieses Mitarbeiters.</p></div><button data-builder-close>✕</button></div><div class="aiw-builder-tabs"><button class="active" data-builder-tab-button="general">1 · Allgemein</button><button data-builder-tab-button="prompt">2 · Anweisung</button><button data-builder-tab-button="data">3 · Daten & Tools</button><button data-builder-tab-button="autonomy">4 · Autonomie</button><button data-builder-tab-button="safety">5 · Sicherheit & Ausgabe</button></div><section class="aiw-builder-tab active" data-builder-tab="general"><div class="aiw-builder-section"><h3>Identität</h3><div class="aiw-builder-grid"><label class="aiw-builder-field"><span>Name *</span><input data-builder-field="name" value="${escapeHtml(current.name)}" placeholder="z. B. Product Research Specialist"></label><label class="aiw-builder-field"><span>Icon</span><input data-builder-field="icon" value="${escapeHtml(current.icon || "🤖")}" maxlength="12"></label><label class="aiw-builder-field full"><span>Rolle *</span><textarea data-builder-field="role" placeholder="Wofür ist dieser Mitarbeiter verantwortlich?">${escapeHtml(current.role)}</textarea></label><label class="aiw-builder-field"><span>Abteilung</span><select data-builder-field="department"><option value="general">Allgemein</option><option value="product">Produkt</option><option value="research">Research</option><option value="listing">Listing</option><option value="operations">Betrieb</option><option value="support">Support</option></select></label><label class="aiw-builder-field"><span>Fähigkeiten</span><textarea data-builder-field="capabilities" placeholder="Eine Fähigkeit pro Zeile">${escapeHtml((current.capabilities || []).join("\n"))}</textarea></label></div></div></section><section class="aiw-builder-tab" data-builder-tab="prompt"><div class="aiw-builder-section"><h3>System-Prompt / Hauptanweisung *</h3><label class="aiw-builder-field full"><span>Wird automatisch bei jeder Aufgabe dieses Mitarbeiters verwendet</span><textarea class="prompt" data-builder-field="systemPrompt" placeholder="Du bist … Deine Aufgabe ist … Prüfe … Erfinde niemals …">${escapeHtml(current.systemPrompt)}</textarea><small class="aiw-builder-help">Hier definierst du Fachrolle, Arbeitsweise, Prüfschritte und gewünschte Qualität. Der unveränderliche Elyon-Sicherheitsrahmen wird serverseitig davor gesetzt und kann durch diesen Prompt nicht aufgehoben werden.</small></label></div></section><section class="aiw-builder-tab" data-builder-tab="data"><div class="aiw-builder-section"><h3>Datenzugriff</h3><div class="aiw-builder-checks">${check("product", "Seller Product Master / aktuelles Produkt", current.contextAccess?.product !== false)}${check("listing", "Listing-Entwurf", current.contextAccess?.listing)}${check("market", "Marktcheck / Market Research", current.contextAccess?.market)}${check("orders", "Bestellungen – nur operative Zusammenfassung", current.contextAccess?.orders)}${check("returns", "Retouren – nur operative Zusammenfassung", current.contextAccess?.returns)}${check("tasks", "Agentenaufgaben und Status", current.contextAccess?.tasks)}</div><div class="aiw-builder-safety" style="margin-top:10px">Kundendaten werden bei eigenen Agenten nicht pauschal freigegeben. Order- und Retourenzugriff liefert standardmäßig nur operative, für die Aufgabe benötigte Zusammenfassungen.</div></div></section><section class="aiw-builder-tab" data-builder-tab="autonomy"><div class="aiw-builder-section"><h3>Arbeitsmodus</h3><div class="aiw-builder-grid"><label class="aiw-builder-field"><span>Autonomie</span><select data-builder-field="autonomyMode">${AUTONOMY_MODES.map(([id, label]) => `<option value="${id}" ${current.autonomyMode === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="aiw-builder-field"><span>Provider</span><select data-builder-field="provider"><option value="deepseek" ${current.provider === "deepseek" ? "selected" : ""}>DeepSeek</option><option value="openai" ${current.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="local" ${current.provider === "local" ? "selected" : ""}>Lokal / Test</option></select></label><label class="aiw-builder-field"><span>Modell</span><input data-builder-field="model" value="${escapeHtml(current.model || "")}" placeholder="zentrale Vorgabe"></label><label class="aiw-builder-field"><span>Max. Tokens</span><input type="number" min="500" max="12000" step="250" data-builder-field="maxTokens" value="${Number(current.maxTokens || 4000)}"></label><label class="aiw-builder-field"><span>Temperatur</span><input type="number" min="0" max="1.2" step="0.1" data-builder-field="temperature" value="${Number(current.temperature ?? 0.2)}"></label><label class="aiw-builder-check"><input type="checkbox" data-builder-field="allowFallback" ${current.allowFallback !== false ? "checked" : ""}><span>Provider-Fallback erlauben</span></label></div><div class="aiw-builder-help" style="margin-top:10px">Stufe 5 allein gibt einem eigenen Mitarbeiter keine externen Rechte. Externe Aktionen bleiben zusätzlich durch die Elyon Danger Zone und ausführende Connectoren geschützt.</div></div></section><section class="aiw-builder-tab" data-builder-tab="safety"><div class="aiw-builder-section"><h3>Sicherheit & Ausgabe</h3><div class="aiw-builder-safety"><strong>Immer aktiv:</strong><br>Keine automatische Veröffentlichung, Live-Preisänderung, Bestellung, Kundennachricht, Erstattung, Löschung oder Änderung rechtlicher Daten über den Custom-Agent-Endpunkt. Nicht belegte Fakten müssen als fehlend oder Annahme markiert werden.</div><div class="aiw-builder-grid" style="margin-top:10px"><label class="aiw-builder-field"><span>Ausgabedetail</span><select data-builder-field="outputDetail"><option value="compact" ${current.outputDetail === "compact" ? "selected" : ""}>Kompakt</option><option value="standard" ${current.outputDetail === "standard" ? "selected" : ""}>Standard</option><option value="detailed" ${current.outputDetail === "detailed" ? "selected" : ""}>Detailliert</option></select></label></div></div></section><div class="aiw-builder-actions"><button data-builder-save>${current.id ? "Änderungen speichern" : "Mitarbeiter erstellen"}</button>${current.id ? '<button class="aiw-secondary" data-builder-assign>Direkt beauftragen</button>' : ""}<button class="aiw-secondary" data-builder-close>Schließen</button></div></aside>`;
    backdrop.querySelector('[data-builder-field="department"]').value = current.department || "general";
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-builder-close]")) backdrop.remove();
      const tabButton = event.target.closest("[data-builder-tab-button]");
      if (tabButton) switchBuilderTab(backdrop, tabButton.dataset.builderTabButton);
      if (event.target.closest("[data-builder-save]")) {
        const saved = collectBuilder(backdrop, current);
        if (!saved) return;
        upsertCustomAgent(saved);
        backdrop.remove();
        toast(`${saved.name} wurde gespeichert.`);
      }
      if (event.target.closest("[data-builder-assign]") && current.id) {
        backdrop.remove();
        openTaskComposer(current.id);
      }
    });
    document.body.appendChild(backdrop);
  }

  function check(id, label, checked) {
    return `<label class="aiw-builder-check"><input type="checkbox" data-context-access="${id}" ${checked ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`;
  }

  function switchBuilderTab(root, tab) {
    root.querySelectorAll("[data-builder-tab-button]").forEach((button) => button.classList.toggle("active", button.dataset.builderTabButton === tab));
    root.querySelectorAll("[data-builder-tab]").forEach((section) => section.classList.toggle("active", section.dataset.builderTab === tab));
  }

  function collectBuilder(root, existing) {
    const value = (field) => root.querySelector(`[data-builder-field="${field}"]`)?.value || "";
    const name = text(value("name"));
    const role = text(value("role"));
    const systemPrompt = text(value("systemPrompt"));
    if (!name || !role || !systemPrompt) {
      toast("Name, Rolle und System-Prompt sind Pflichtfelder.");
      if (!systemPrompt) switchBuilderTab(root, "prompt");
      return null;
    }
    const id = existing.id || `custom-${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
    const contextAccess = {};
    root.querySelectorAll("[data-context-access]").forEach((input) => { contextAccess[input.dataset.contextAccess] = input.checked; });
    return {
      ...existing,
      id,
      name: name.slice(0, 120),
      role: role.slice(0, 1200),
      icon: text(value("icon"), "🤖").slice(0, 12) || "🤖",
      department: value("department") || "general",
      capabilities: value("capabilities").split(/\r?\n/).map(text).filter(Boolean).slice(0, 40),
      systemPrompt: systemPrompt.slice(0, 16000),
      contextAccess,
      autonomyMode: value("autonomyMode") || "manual",
      provider: value("provider") || "deepseek",
      model: text(value("model")).slice(0, 200),
      maxTokens: Math.max(500, Math.min(12000, Number(value("maxTokens")) || 4000)),
      temperature: Math.max(0, Math.min(1.2, Number(value("temperature")) || 0.2)),
      allowFallback: root.querySelector('[data-builder-field="allowFallback"]')?.checked !== false,
      outputDetail: value("outputDetail") || "standard",
    };
  }

  function agentOptions(selectedId = "") {
    const builtins = BUILTIN_AGENTS.map((agent) => `<option value="builtin:${agent.id}" ${selectedId === agent.id ? "selected" : ""}>${agent.icon} ${escapeHtml(agent.name)}</option>`).join("");
    const custom = listCustomAgents().map((agent) => `<option value="custom:${agent.id}" ${selectedId === agent.id ? "selected" : ""}>${escapeHtml(agent.icon || "🤖")} ${escapeHtml(agent.name)} · eigener Prompt</option>`).join("");
    return `<optgroup label="Elyon Kernmitarbeiter">${builtins}</optgroup>${custom ? `<optgroup label="Eigene Mitarbeiter">${custom}</optgroup>` : ""}`;
  }

  function openTaskComposer(preselectedAgentId = "") {
    installStyles();
    document.getElementById(TASK_ID)?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = TASK_ID;
    backdrop.className = "aiw-builder-backdrop";
    backdrop.innerHTML = `<aside class="aiw-builder-panel"><div class="aiw-builder-head"><div><h2>Mitarbeiter beauftragen</h2><p>Der Aufgaben-Prompt gilt nur für diesen Auftrag. Der dauerhafte System-Prompt des Mitarbeiters bleibt unverändert.</p></div><button data-task-close>✕</button></div><div class="aiw-builder-section" style="margin-top:14px"><div class="aiw-builder-grid"><label class="aiw-builder-field"><span>Mitarbeiter</span><select data-task-field="agent">${agentOptions(preselectedAgentId)}</select></label><label class="aiw-builder-field"><span>Priorität</span><select data-task-field="priority"><option value="low">Niedrig</option><option value="medium" selected>Normal</option><option value="high">Hoch</option><option value="critical">Kritisch</option></select></label><label class="aiw-builder-field full"><span>Titel</span><input data-task-field="title" placeholder="z. B. Marktcheck für neues Produkt"></label><label class="aiw-builder-field full"><span>Arbeitsauftrag / Aufgaben-Prompt *</span><textarea class="prompt" data-task-field="prompt" placeholder="Was soll dieser Mitarbeiter jetzt konkret tun? Welche Fragen soll er beantworten?"> </textarea><small class="aiw-builder-help">Beispiel: „Prüfe das aktuelle Produkt auf Konkurrenzdruck, realistische Marge und erkennbare Risiken. Nenne mir am Ende eine klare Empfehlung.“</small></label></div><div class="aiw-task-composer-summary"><strong>Prompt-Struktur</strong><span>Dauerhafter System-Prompt des Mitarbeiters + dieser Aufgaben-Prompt + freigegebene Elyon-Daten → strukturierter Agentenbericht.</span></div></div><div class="aiw-builder-actions"><button data-task-run>Aufgabe erstellen & starten</button><button class="aiw-secondary" data-task-close>Abbrechen</button></div></aside>`;
    backdrop.addEventListener("click", async (event) => {
      if (event.target === backdrop || event.target.closest("[data-task-close]")) backdrop.remove();
      if (event.target.closest("[data-task-run]")) {
        const button = event.target.closest("[data-task-run]");
        button.disabled = true;
        const ok = await submitTask(backdrop);
        button.disabled = false;
        if (ok) backdrop.remove();
      }
    });
    document.body.appendChild(backdrop);
  }

  async function submitTask(root) {
    const value = (field) => text(root.querySelector(`[data-task-field="${field}"]`)?.value || "");
    const selected = value("agent");
    const taskPrompt = value("prompt");
    if (!selected || !taskPrompt) {
      toast("Mitarbeiter und Aufgaben-Prompt sind erforderlich.");
      return false;
    }
    const title = value("title") || "Manueller Arbeitsauftrag";
    const priority = value("priority") || "medium";
    const [kind, agentId] = selected.split(":");
    try {
      let response;
      if (kind === "custom") {
        const agent = getCustomAgent(agentId);
        if (!agent) throw new Error("Der gewählte eigene Mitarbeiter wurde nicht gefunden.");
        response = await fetch("/api/ai-agent-run-custom", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customAgent: agent, title, priority, taskPrompt, input: buildCustomContext(agent) }),
        });
      } else {
        const definition = BUILTIN_AGENTS.find((agent) => agent.id === agentId);
        if (!definition) throw new Error("Der gewählte Elyon-Mitarbeiter wurde nicht gefunden.");
        response = await fetch("/api/ai-agent-run-advanced", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: definition.action, agentId: definition.id, title, priority, taskPrompt, input: buildBuiltinContext(definition) }),
        });
      }
      const payload = await response.json().catch(() => ({}));
      if (payload.task) upsertTask(payload.task);
      if (!response.ok || !payload.task) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      toast(`${payload.task.agentName || getCustomAgent(agentId)?.name || BUILTIN_AGENTS.find((agent) => agent.id === agentId)?.name || "Mitarbeiter"}: Aufgabe wurde bearbeitet.`);
      queueDecorate();
      return true;
    } catch (error) {
      toast(error?.message || "Aufgabe konnte nicht gestartet werden.");
      return false;
    }
  }

  function installObserver() {
    const root = document.getElementById("elyonAiWorkforce");
    if (!root || state.observer) return;
    state.observer = new MutationObserver(() => queueDecorate());
    state.observer.observe(root, { childList: true, subtree: true });
  }

  function install() {
    installStyles();
    decorate();
    installObserver();
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueDecorate);
    window.addEventListener("elyon:ai-workforce-custom-task-updated", queueDecorate);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") setTimeout(() => { decorate(); installObserver(); }, 0);
    });
    [100, 400, 900].forEach((delay) => setTimeout(() => { decorate(); installObserver(); }, delay));
  }

  window.ElyonAIAgentBuilder = {
    open: openBuilder,
    assign: openTaskComposer,
    list: listCustomAgents,
    get: getCustomAgent,
    remove: deleteCustomAgent,
    refresh: decorate,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
