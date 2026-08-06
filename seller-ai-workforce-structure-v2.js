(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const API_V2 = "/api/ai-workforce-v2";
  const API_LEGACY = "/api/ai-agent-run";
  const STYLE_ID = "elyonAiWorkforceStructureV2Styles";
  const MAX_TASKS = 150;

  const AGENTS = [
    { id: "elyon-manager", name: "Elyon Manager", icon: "🧠", group: "manager", phase: 0, backendId: "elyon-operations-manager", provider: "qwen", action: "run_manager", role: "Zentrale Steuerung: bewertet den Workflow, erkennt Blocker und empfiehlt den nächsten Fachagenten." },
    { id: "elyon-product-data-specialist", name: "Product Data Specialist", icon: "🧩", group: "product", phase: 1, backendId: "elyon-product-data-checker", provider: "local", action: "analyze_product", role: "Prüft Produktdaten, Varianten, Bilder, Lieferantenangaben und Prozessreife." },
    { id: "elyon-compliance-specialist", name: "Compliance Guard", icon: "🛡️", group: "product", phase: 1, backendId: "elyon-compliance-guard", provider: "deepseek", action: "analyze_product", role: "Prüft GPSR, Hersteller, EU-Verantwortlichen, CE, Pflichtangaben und Markenrisiken." },
    { id: "elyon-profit-specialist", name: "Profit Analyst", icon: "📊", group: "product", phase: 1, backendId: "elyon-profit-analyst", provider: "openai", action: "analyze_product", role: "Berechnet Gewinn, Marge, Break-even, Reserven und Preisszenarien." },
    { id: "elyon-listing-specialist", name: "Listing Specialist", icon: "✍️", group: "listing", phase: 2, backendId: "elyon-listing-pro", provider: "deepseek", action: "analyze_listing", role: "Erstellt Titel, Beschreibung, SEO, Merkmale und Variantenbezeichnungen aus belegten Fakten." },
    { id: "elyon-draft-quality-guard", name: "Draft Quality Guard", icon: "🔎", group: "listing", phase: 2, backendId: "elyon-draft-quality-guard", provider: "local", action: "run_draft_quality", role: "Kontrolliert den eBay-Entwurf vor der manuellen Freigabe auf Qualität und Widersprüche." },
    { id: "elyon-order-specialist", name: "Order Coordinator", icon: "📦", group: "operations", phase: 3, backendId: "elyon-order-coordinator", provider: "qwen", action: "analyze_order", role: "Überwacht Bestellungen, Versandfristen, Tracking-Lücken und Lieferantenrisiken." },
    { id: "elyon-customer-support-specialist", name: "Customer Support Specialist", icon: "💬", group: "operations", phase: 3, backendId: "elyon-support-assistant", provider: "openai", action: "analyze_return", role: "Erstellt freigabepflichtige Antworten für Kundenfragen, Reklamationen und Retouren." },
  ];

  const SOURCE_IDS = {
    "elyon-manager": ["elyon-manager", "elyon-operations-manager", "soul-operations"],
    "elyon-product-data-specialist": ["elyon-product-data-specialist", "elyon-product-data-checker", "soul-scout"],
    "elyon-compliance-specialist": ["elyon-compliance-specialist", "elyon-compliance-guard", "soul-guard"],
    "elyon-profit-specialist": ["elyon-profit-specialist", "elyon-profit-analyst", "soul-finance"],
    "elyon-listing-specialist": ["elyon-listing-specialist", "elyon-listing-pro", "soul-seo"],
    "elyon-draft-quality-guard": ["elyon-draft-quality-guard"],
    "elyon-order-specialist": ["elyon-order-specialist", "elyon-order-coordinator"],
    "elyon-customer-support-specialist": ["elyon-customer-support-specialist", "elyon-support-assistant", "soul-support"],
  };

  const LEGACY_DISPLAY = Object.fromEntries(Object.entries(SOURCE_IDS).flatMap(([visibleId, ids]) => ids.map((id) => [id, visibleId])));
  const agentById = (id) => AGENTS.find((agent) => agent.id === id);
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const nowIso = () => new Date().toISOString();

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

  function migrateSettings() {
    const settings = readJson(SETTINGS_KEY, {});
    settings.agents = settings.agents && typeof settings.agents === "object" ? { ...settings.agents } : {};
    AGENTS.forEach((definition) => {
      const sources = SOURCE_IDS[definition.id].map((id) => settings.agents[id]).filter((value) => value && typeof value === "object");
      const source = Object.assign({}, ...sources.reverse());
      settings.agents[definition.id] = {
        ...source,
        id: definition.id,
        name: definition.name,
        description: definition.role,
        active: source.active !== false,
        enabled: source.enabled !== false,
        paused: source.paused === true,
        autonomyLevel: Math.max(0, Math.min(3, Number(source.autonomyLevel ?? (definition.id === "elyon-manager" ? 2 : 1)) || 0)),
        provider: text(source.provider, definition.provider).toLowerCase(),
        model: text(source.model),
        allowFallback: source.allowFallback !== false,
        temperature: Math.max(0, Math.min(2, Number(source.temperature ?? 0.2) || 0.2)),
        maxTokens: Math.max(200, Math.min(12000, Number(source.maxTokens ?? 4000) || 4000)),
        dailyLimit: Math.max(0, Number(source.dailyLimit ?? 0.25) || 0),
        todayUsage: Math.max(0, Number(source.todayUsage ?? 0) || 0),
        phase: definition.phase,
      };
    });
    settings.agentStructureVersion = 2;
    settings.mainAgentId = "elyon-manager";
    settings.securityMode = true;
    settings.sandboxMode = true;
    settings.autonomyLocked = true;
    writeJson(SETTINGS_KEY, settings);
    return settings;
  }

  function syncBackendSettings(visibleId) {
    const definition = agentById(visibleId);
    if (!definition || definition.backendId === visibleId || definition.backendId === "elyon-draft-quality-guard") return;
    const settings = migrateSettings();
    settings.agents[definition.backendId] = {
      ...(settings.agents[definition.backendId] || {}),
      ...settings.agents[visibleId],
      id: definition.backendId,
      name: definition.name,
    };
    writeJson(SETTINGS_KEY, settings);
  }

  function readTasks() {
    const tasks = readJson(TASKS_KEY, []);
    return Array.isArray(tasks) ? tasks : [];
  }

  function upsertTask(task) {
    if (!task?.id) return;
    const tasks = readTasks();
    const index = tasks.findIndex((entry) => entry?.id === task.id);
    if (index >= 0) tasks[index] = { ...tasks[index], ...task, updatedAt: task.updatedAt || nowIso() };
    else tasks.unshift(task);
    writeJson(TASKS_KEY, tasks.slice(0, MAX_TASKS));
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-task-updated", { detail: task }));
    window.ElyonAIWorkforce?.mount?.();
    setTimeout(renderV2, 0);
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

  function selectedProduct(products) {
    const selectedId = text(window.elyonSelectedProductId || localStorage.getItem("elyonSelectedProductId") || localStorage.getItem("elyon_active_product_id"));
    if (selectedId) {
      const match = products.find((item) => [item?.id, item?.productId, item?.sku].map(text).includes(selectedId));
      if (match) return match;
    }
    return products.find((item) => ["ready_for_seller_tool", "bereit_manuell_einstellen"].includes(item?.status)) || products[0] || {};
  }

  function dataset() {
    const products = collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]);
    const orders = collection(["elyonOrders", "ebayOrders", "elyonSales"]);
    const returns = collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]);
    const invoices = collection(["elyonInvoices", "sellerInvoices"]);
    return { products, orders, returns, invoices, tasks: readTasks(), agentResults: readTasks().filter((task) => task?.result) };
  }

  function contextFor(definition) {
    const data = dataset();
    if (["product", "listing"].includes(definition.group) || definition.id === "elyon-draft-quality-guard") return { product: selectedProduct(data.products) };
    if (definition.id === "elyon-order-specialist") return { order: data.orders[0] || {} };
    if (definition.id === "elyon-customer-support-specialist") return { returnCase: data.returns[0] || {} };
    return { product: selectedProduct(data.products), context: data };
  }

  function latestTask(visibleId) {
    return readTasks().find((task) => (LEGACY_DISPLAY[task?.agentId] || task?.agentId) === visibleId) || null;
  }

  function statusLabel(task) {
    const status = task?.status || task?.result?.status;
    const labels = { queued: "wartet", analyzing: "läuft", draft_ready: "Entwurf fertig", approval_required: "Freigabe nötig", approved: "freigegeben", completed: "abgeschlossen", failed: "Fehler", blocked: "blockiert", passed: "bestanden", warning: "Warnung", manualReviewRequired: "Prüfung nötig" };
    return labels[status] || (task ? "vorhanden" : "noch nicht ausgeführt");
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #elyonAiWorkforce.aiw-v2 .aiw-grid{display:block}.aiw-v2-manager{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:16px;padding:20px;border-radius:22px;background:linear-gradient(135deg,rgba(37,99,235,.2),rgba(15,23,42,.72));border:1px solid rgba(96,165,250,.35);box-shadow:0 20px 60px rgba(0,0,0,.22)}
      .aiw-v2-manager-main{display:grid;gap:12px}.aiw-v2-manager h3{font-size:21px!important}.aiw-v2-manager .aiw-icon{font-size:34px}.aiw-v2-manager-status{padding:13px;border-radius:15px;background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.14)}.aiw-v2-manager-status strong{display:block;color:#dbeafe;margin-bottom:5px}.aiw-v2-manager-status p{margin:0;color:#cbd5e1;font-size:12px;line-height:1.5}.aiw-v2-next{display:grid;gap:8px;align-content:start;padding:15px;border-radius:17px;background:rgba(2,6,23,.46);border:1px solid rgba(96,165,250,.18)}.aiw-v2-next small{color:#94a3b8}.aiw-v2-next strong{color:#f8fafc;font-size:15px}
      .aiw-v2-flow{display:flex;align-items:center;gap:7px;overflow:auto;padding:13px 2px;margin:10px 0 2px}.aiw-v2-flow-step{min-width:max-content;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.14);font-size:10px;color:#cbd5e1;font-weight:800}.aiw-v2-flow-arrow{color:#60a5fa}.aiw-v2-group{margin-top:17px}.aiw-v2-group-head{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:9px}.aiw-v2-group-head h3{margin:0;color:#e2e8f0;font-size:14px}.aiw-v2-group-head p{margin:3px 0 0;color:#64748b;font-size:11px}.aiw-v2-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.aiw-v2-cards.operations{grid-template-columns:repeat(2,minmax(0,1fr))}.aiw-v2-card{position:relative}.aiw-v2-card::before{content:attr(data-order);position:absolute;right:10px;top:10px;width:23px;height:23px;display:grid;place-items:center;border-radius:999px;background:rgba(59,130,246,.13);color:#93c5fd;font-size:10px;font-weight:900}.aiw-v2-card .aiw-actions button{flex:1}.aiw-v2-security{margin-top:16px;padding:12px 14px;border-radius:15px;background:rgba(34,197,94,.06);border:1px solid rgba(74,222,128,.17);color:#bbf7d0;font-size:11px;line-height:1.5}
      @media(max-width:980px){.aiw-v2-manager{grid-template-columns:1fr}.aiw-v2-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.aiw-v2-cards,.aiw-v2-cards.operations{grid-template-columns:1fr}.aiw-v2-manager{padding:15px}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.querySelector(".aiw-v2-toast")?.remove();
    const node = document.createElement("div");
    node.className = "aiw-toast aiw-v2-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function updateSetting(agentId, field, rawValue) {
    const settings = migrateSettings();
    const agent = settings.agents[agentId];
    agent[field] = ["autonomyLevel", "dailyLimit"].includes(field) ? Number(rawValue) : rawValue;
    settings.agents[agentId] = agent;
    writeJson(SETTINGS_KEY, settings);
    syncBackendSettings(agentId);
    renderV2();
  }

  function toggleAgent(agentId) {
    const settings = migrateSettings();
    const agent = settings.agents[agentId];
    const enable = agent.paused || agent.enabled === false || agent.active === false;
    agent.active = true;
    agent.enabled = enable;
    agent.paused = !enable;
    settings.agents[agentId] = agent;
    writeJson(SETTINGS_KEY, settings);
    syncBackendSettings(agentId);
    renderV2();
    toast(`${agent.name} wurde ${enable ? "aktiviert" : "pausiert"}.`);
  }

  function temporaryTask(definition, sourceId, test) {
    const now = nowIso();
    return { id: `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, agentId: definition.id, type: "analysis", title: `${definition.name}${test ? " · Test" : ""}`, sourceType: definition.group, sourceId, priority: definition.id === "elyon-manager" ? "critical" : "medium", status: "analyzing", provider: migrateSettings().agents[definition.id].provider, model: migrateSettings().agents[definition.id].model || "", inputSnapshot: {}, result: null, warnings: [], errors: [], createdAt: now, updatedAt: now };
  }

  async function runAgent(agentId, options = {}) {
    const definition = agentById(agentId);
    const settings = migrateSettings();
    const agent = settings.agents[agentId];
    if (!definition || !agent) return;
    if (agent.paused || agent.enabled === false || agent.active === false || agent.autonomyLevel === 0) return toast("Dieser Mitarbeiter ist pausiert oder ausgeschaltet.");
    if (agent.dailyLimit > 0 && agent.todayUsage >= agent.dailyLimit) return toast("Das Tageslimit dieses Mitarbeiters ist erreicht.");
    syncBackendSettings(agentId);
    const input = contextFor(definition);
    const source = input.product || input.order || input.returnCase || {};
    const sourceId = text(source.id || source.productId || source.orderId || source.returnId || source.sku);
    const draftTask = temporaryTask(definition, sourceId, options.test);
    upsertTask(draftTask);

    const useV2 = ["elyon-manager", "elyon-draft-quality-guard"].includes(agentId);
    const endpoint = useV2 ? API_V2 : API_LEGACY;
    const payload = useV2 ? {
      action: definition.action,
      title: draftTask.title,
      sourceId,
      input,
      tasks: readTasks(),
      test: options.test === true,
      agent: { provider: options.test ? "local" : agent.provider, model: options.test ? "" : agent.model, allowFallback: agent.allowFallback, maxTokens: agent.maxTokens },
    } : {
      action: definition.action,
      agentId: definition.backendId,
      title: draftTask.title,
      sourceId,
      input,
      agent: { provider: options.test ? "local" : agent.provider, model: options.test ? "" : agent.model, allowFallback: agent.allowFallback, temperature: agent.temperature, maxTokens: agent.maxTokens },
    };

    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.task) {
        upsertTask({ ...draftTask, status: "failed", errors: [data.message || data.error || `HTTP ${response.status}`], updatedAt: nowIso() });
        return toast(data.message || "Agenten-Aufruf fehlgeschlagen.");
      }
      const task = { ...data.task, id: draftTask.id, agentId: definition.id, title: draftTask.title, createdAt: draftTask.createdAt, updatedAt: nowIso() };
      upsertTask(task);
      const nextSettings = migrateSettings();
      nextSettings.agents[agentId].lastRun = nowIso();
      nextSettings.agents[agentId].lastResult = task.result?.summary || "Analyse abgeschlossen";
      nextSettings.agents[agentId].todayUsage = Number(nextSettings.agents[agentId].todayUsage || 0) + (task.provider === "local" ? 0 : 0.01);
      writeJson(SETTINGS_KEY, nextSettings);
      toast(`${definition.name}: Ergebnis liegt zur Prüfung bereit.`);
    } catch (error) {
      upsertTask({ ...draftTask, status: "failed", errors: [error?.message || "Netzwerkfehler"], updatedAt: nowIso() });
      toast("Agenten-Endpunkt ist nicht erreichbar.");
    }
  }

  function latestManagerPlan() {
    return latestTask("elyon-manager")?.result?.generatedContent?.managerPlan || null;
  }

  function runNextAgent() {
    const nextId = latestManagerPlan()?.nextAgentId;
    if (!nextId || !agentById(nextId)) return toast("Der Elyon Manager hat aktuell keinen startbaren nächsten Fachagenten festgelegt.");
    runAgent(nextId);
  }

  function cardHtml(definition, order) {
    const settings = migrateSettings();
    const agent = settings.agents[definition.id];
    const last = latestTask(definition.id);
    const paused = agent.paused || agent.enabled === false || agent.active === false;
    return `<article class="aiw-card aiw-v2-card" data-agent-id="${definition.id}" data-order="${order}"><div class="aiw-card-head"><div class="aiw-icon">${definition.icon}</div><div><h3>${escapeHtml(definition.name)}</h3><div class="aiw-role">${escapeHtml(definition.role)}</div></div></div><div class="aiw-meta"><span>Phase ${definition.phase}</span><span>${paused ? "pausiert" : "aktiv"}</span><span>${escapeHtml(statusLabel(last))}</span></div><div class="aiw-fields"><label>Provider<select data-field="provider"><option value="openai" ${agent.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="deepseek" ${agent.provider === "deepseek" ? "selected" : ""}>DeepSeek</option><option value="qwen" ${agent.provider === "qwen" ? "selected" : ""}>Qwen</option><option value="local" ${agent.provider === "local" ? "selected" : ""}>Lokal</option></select></label><label>Modell<input data-field="model" value="${escapeHtml(agent.model || "")}" placeholder="passendes Modell wählen"></label><label>Autonomie<select data-field="autonomyLevel"><option value="0" ${agent.autonomyLevel === 0 ? "selected" : ""}>0 · Aus</option><option value="1" ${agent.autonomyLevel === 1 ? "selected" : ""}>1 · Manuell</option><option value="2" ${agent.autonomyLevel === 2 ? "selected" : ""}>2 · Vorschläge</option><option value="3" ${agent.autonomyLevel === 3 ? "selected" : ""}>3 · interne Entwürfe</option><option value="4" disabled>4 · gesperrt</option></select></label><label>Tageslimit €<input data-field="dailyLimit" type="number" min="0" step="0.05" value="${Number(agent.dailyLimit || 0).toFixed(2)}"></label></div><div class="aiw-actions"><button data-action="run" ${paused || agent.autonomyLevel === 0 ? "disabled" : ""}>Ausführen</button><button class="aiw-secondary" data-action="advanced">⚙️ Einstellungen</button><button class="${paused ? "aiw-secondary" : "aiw-danger"}" data-action="pause">${paused ? "Aktivieren" : "Pausieren"}</button></div></article>`;
  }

  function managerHtml() {
    const definition = agentById("elyon-manager");
    const settings = migrateSettings();
    const agent = settings.agents[definition.id];
    const plan = latestManagerPlan();
    const last = latestTask(definition.id);
    const paused = agent.paused || agent.enabled === false || agent.active === false;
    return `<article class="aiw-v2-manager aiw-card" data-agent-id="elyon-manager"><div class="aiw-v2-manager-main"><div class="aiw-card-head"><div class="aiw-icon">${definition.icon}</div><div><h3>${definition.name}</h3><div class="aiw-role">${definition.role}</div></div></div><div class="aiw-meta"><span>Hauptagent</span><span>${paused ? "pausiert" : "aktiv"}</span><span>${escapeHtml(statusLabel(last))}</span><span>externe Aktionen gesperrt</span></div><div class="aiw-v2-manager-status"><strong>${escapeHtml(plan?.status || "Noch kein Workflow-Check")}</strong><p>${escapeHtml(last?.result?.summary || "Der Elyon Manager prüft Produktreife, Fachagenten-Ergebnisse, Blocker und den nächsten sicheren Prozessschritt.")}</p></div><div class="aiw-fields"><label>Provider<select data-field="provider"><option value="openai" ${agent.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="deepseek" ${agent.provider === "deepseek" ? "selected" : ""}>DeepSeek</option><option value="qwen" ${agent.provider === "qwen" ? "selected" : ""}>Qwen</option><option value="local" ${agent.provider === "local" ? "selected" : ""}>Lokal</option></select></label><label>Modell<input data-field="model" value="${escapeHtml(agent.model || "")}" placeholder="Orchestrierung ist regelbasiert"></label><label>Autonomie<select data-field="autonomyLevel"><option value="0" ${agent.autonomyLevel === 0 ? "selected" : ""}>0 · Aus</option><option value="1" ${agent.autonomyLevel === 1 ? "selected" : ""}>1 · Manuell</option><option value="2" ${agent.autonomyLevel === 2 ? "selected" : ""}>2 · Vorschläge</option><option value="3" ${agent.autonomyLevel === 3 ? "selected" : ""}>3 · interne Delegation</option><option value="4" disabled>4 · gesperrt</option></select></label><label>Tageslimit €<input data-field="dailyLimit" type="number" min="0" step="0.05" value="${Number(agent.dailyLimit || 0).toFixed(2)}"></label></div><div class="aiw-actions"><button data-action="run" ${paused || agent.autonomyLevel === 0 ? "disabled" : ""}>Workflow prüfen</button><button class="aiw-secondary" data-action="next" ${plan?.nextAgentId ? "" : "disabled"}>Nächsten Fachagenten starten</button><button class="aiw-secondary" data-action="advanced">⚙️ Manager einstellen</button><button class="${paused ? "aiw-secondary" : "aiw-danger"}" data-action="pause">${paused ? "Aktivieren" : "Pausieren"}</button></div></div><div class="aiw-v2-next"><small>Nächster empfohlener Schritt</small><strong>${escapeHtml(plan?.nextAgentName || "Workflow zuerst prüfen")}</strong><small>${plan?.blockers?.length ? `${plan.blockers.length} Blocker erkannt` : plan?.warnings?.length ? `${plan.warnings.length} offene Hinweise` : "Keine automatische externe Aktion"}</small></div></article>`;
  }

  function bindCard(card) {
    const agentId = card.dataset.agentId;
    card.querySelectorAll("[data-field]").forEach((field) => field.addEventListener("change", () => updateSetting(agentId, field.dataset.field, field.value)));
    card.querySelector('[data-action="run"]')?.addEventListener("click", () => runAgent(agentId));
    card.querySelector('[data-action="next"]')?.addEventListener("click", runNextAgent);
    card.querySelector('[data-action="pause"]')?.addEventListener("click", () => toggleAgent(agentId));
    card.querySelector('[data-action="advanced"]')?.addEventListener("click", () => window.ElyonAIWorkforceV2Settings?.open?.(agentId));
  }

  function decorateTasks() {
    const taskMap = new Map(readTasks().map((task) => [task.id, task]));
    document.querySelectorAll(".aiw-task[data-task-id]").forEach((node) => {
      const task = taskMap.get(node.dataset.taskId);
      const visibleId = LEGACY_DISPLAY[task?.agentId] || task?.agentId;
      const definition = agentById(visibleId);
      const small = node.querySelector("small");
      if (definition && small) small.textContent = `${definition.name} · ${task.provider || "lokal"}${task.model ? ` · ${task.model}` : ""} · ${new Date(task.updatedAt || task.createdAt).toLocaleString("de-DE")}`;
    });
  }

  function renderV2() {
    const shell = document.getElementById("elyonAiWorkforce");
    const grid = document.getElementById("aiwAgentGrid");
    if (!shell || !grid) return false;
    installStyles();
    migrateSettings();
    shell.classList.add("aiw-v2");
    const head = shell.querySelector(".aiw-head");
    if (head) head.innerHTML = `<div><h2>Elyon Agententeam</h2><p>Der Elyon Manager ist die zentrale Steuerung. Fachagenten arbeiten in klarer Reihenfolge; externe Veröffentlichungen, Bestellungen, Nachrichten und Erstattungen bleiben gesperrt.</p></div><div class="aiw-badges"><span class="aiw-badge">Agent System V2</span><span class="aiw-badge">1 Hauptagent</span><span class="aiw-badge">7 Fachagenten</span><span class="aiw-badge">Manuelle Freigabe</span></div>`;
    grid.innerHTML = `${managerHtml()}<div class="aiw-v2-flow"><span class="aiw-v2-flow-step">Product Data</span><span class="aiw-v2-flow-arrow">→</span><span class="aiw-v2-flow-step">Compliance</span><span class="aiw-v2-flow-arrow">→</span><span class="aiw-v2-flow-step">Profit</span><span class="aiw-v2-flow-arrow">→</span><span class="aiw-v2-flow-step">Listing</span><span class="aiw-v2-flow-arrow">→</span><span class="aiw-v2-flow-step">Draft QA</span><span class="aiw-v2-flow-arrow">→</span><span class="aiw-v2-flow-step">Manuelle Freigabe</span></div><section class="aiw-v2-group"><div class="aiw-v2-group-head"><div><h3>Produktprüfung und Wirtschaftlichkeit</h3><p>Die Grundlagen müssen stimmen, bevor ein Listing entsteht.</p></div></div><div class="aiw-v2-cards">${AGENTS.filter((agent) => agent.group === "product").map((agent, index) => cardHtml(agent, index + 1)).join("")}</div></section><section class="aiw-v2-group"><div class="aiw-v2-group-head"><div><h3>Listing und Entwurfsqualität</h3><p>Erstellung und finale Qualitätskontrolle sind getrennt.</p></div></div><div class="aiw-v2-cards operations">${AGENTS.filter((agent) => agent.group === "listing").map((agent, index) => cardHtml(agent, index + 4)).join("")}</div></section><section class="aiw-v2-group"><div class="aiw-v2-group-head"><div><h3>Verkauf und Kundenbetrieb</h3><p>Bestellungen und Support werden erst bei echten Vorgängen aktiv.</p></div></div><div class="aiw-v2-cards operations">${AGENTS.filter((agent) => agent.group === "operations").map((agent, index) => cardHtml(agent, index + 6)).join("")}</div></section><div class="aiw-v2-security"><strong>Feste Sicherheitsgrenze:</strong> Kein Agent darf automatisch veröffentlichen, Preise live ändern, beim Lieferanten bestellen, Kunden anschreiben, erstatten, Produkte löschen oder rechtliche Daten ändern.</div>`;
    grid.querySelectorAll("[data-agent-id]").forEach(bindCard);
    window.ElyonAiProviderModelGuard?.syncWorkforce?.();
    decorateTasks();
    return true;
  }

  function watch() {
    renderV2();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const grid = document.getElementById("aiwAgentGrid");
        if (grid && !grid.querySelector('[data-agent-id="elyon-manager"]')) renderV2();
        decorateTasks();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 400, 900, 1800].forEach((delay) => setTimeout(renderV2, delay));
  }

  window.ElyonAIWorkforceV2 = { agents: AGENTS, render: renderV2, runAgent, runNextAgent, settings: migrateSettings, tasks: readTasks };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch, { once: true });
  else watch();
})();
