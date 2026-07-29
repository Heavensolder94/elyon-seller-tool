(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const MAX_TASKS = 150;
  const LEGACY_MAP = {
    "soul-seo": "elyon-listing-pro",
    "soul-guard": "elyon-compliance-guard",
    "soul-finance": "elyon-profit-analyst",
    "soul-operations": "elyon-operations-manager",
    "soul-support": "elyon-support-assistant",
    "soul-scout": "elyon-product-data-checker",
  };
  const AGENTS = [
    { id: "elyon-listing-pro", name: "Listing Pro", phase: 1, provider: "deepseek", icon: "✍️", role: "Titel, SEO und Beschreibung faktengebunden vorbereiten", action: "analyze_listing" },
    { id: "elyon-compliance-guard", name: "Compliance Guard", phase: 1, provider: "deepseek", icon: "🛡️", role: "GPSR, Hersteller, Pflichtmerkmale und Risiken prüfen", action: "analyze_product" },
    { id: "elyon-profit-analyst", name: "Profit Analyst", phase: 1, provider: "openai", icon: "📊", role: "Gewinn, Marge, Break-even und Preisvarianten berechnen", action: "analyze_product" },
    { id: "elyon-operations-manager", name: "Operations Manager", phase: 2, provider: "qwen", icon: "🧭", role: "Tagesbriefing und offene Seller-Aufgaben priorisieren", action: "create_daily_briefing" },
    { id: "elyon-order-coordinator", name: "Order Coordinator", phase: 3, provider: "qwen", icon: "📦", role: "Orders, Versandfristen und Tracking-Lücken prüfen", action: "analyze_order" },
    { id: "elyon-support-assistant", name: "Support Assistant", phase: 3, provider: "openai", icon: "💬", role: "Freigabepflichtige Antwortentwürfe vorbereiten", action: "analyze_return" },
  ];

  const state = {
    filter: "all",
    providerStatus: null,
    mounted: false,
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
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
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function migrateSettings(input = readJson(SETTINGS_KEY, {})) {
    const settings = input && typeof input === "object" ? { ...input } : {};
    settings.agents = settings.agents && typeof settings.agents === "object" ? { ...settings.agents } : {};

    AGENTS.forEach((definition) => {
      const legacyId = Object.keys(LEGACY_MAP).find((key) => LEGACY_MAP[key] === definition.id);
      const legacy = legacyId && settings.agents[legacyId] && typeof settings.agents[legacyId] === "object" ? settings.agents[legacyId] : {};
      const current = settings.agents[definition.id] && typeof settings.agents[definition.id] === "object" ? settings.agents[definition.id] : {};
      const source = { ...legacy, ...current };
      const oldModel = text(source.model).toLowerCase();
      const oldModelIsProvider = ["openai", "deepseek", "qwen", "local"].includes(oldModel);
      settings.agents[definition.id] = {
        ...source,
        id: definition.id,
        name: text(source.name, definition.name),
        description: text(source.description, definition.role),
        active: source.active !== false,
        enabled: source.enabled !== false,
        paused: source.paused === true,
        autonomyLevel: Math.max(0, Math.min(3, Number(source.autonomyLevel ?? 1) || 0)),
        provider: text(source.provider, oldModelIsProvider ? oldModel : definition.provider).toLowerCase(),
        model: oldModelIsProvider ? "" : text(source.model),
        allowFallback: source.allowFallback !== false,
        temperature: Math.max(0, Math.min(2, Number(source.temperature ?? 0.2) || 0.2)),
        maxTokens: Math.max(200, Math.min(12000, Number(source.maxTokens ?? 4000) || 4000)),
        dailyLimit: Math.max(0, Number(source.dailyLimit ?? 0.25) || 0),
        todayUsage: Math.max(0, Number(source.todayUsage ?? 0) || 0),
        phase: definition.phase,
      };
    });

    settings.agentMigrationVersion = 1;
    settings.agentAliases = { ...LEGACY_MAP };
    if (settings.securityMode === undefined) settings.securityMode = true;
    if (settings.sandboxMode === undefined) settings.sandboxMode = true;
    if (settings.autonomyLocked === undefined) settings.autonomyLocked = true;
    writeJson(SETTINGS_KEY, settings);
    return settings;
  }

  function readTasks() {
    const tasks = readJson(TASKS_KEY, []);
    return Array.isArray(tasks) ? tasks : [];
  }

  function writeTasks(tasks) {
    return writeJson(TASKS_KEY, (Array.isArray(tasks) ? tasks : []).slice(0, MAX_TASKS));
  }

  function upsertTask(task) {
    if (!task || !task.id) return;
    const tasks = readTasks();
    const index = tasks.findIndex((entry) => entry && entry.id === task.id);
    if (index >= 0) tasks[index] = { ...tasks[index], ...task, updatedAt: task.updatedAt || nowIso() };
    else tasks.unshift(task);
    writeTasks(tasks);
    renderTasks();
    renderCards();
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
    const selectedId = text(
      window.elyonSelectedProductId ||
      localStorage.getItem("elyonSelectedProductId") ||
      localStorage.getItem("elyon_active_product_id")
    );
    if (selectedId) {
      const match = products.find((item) => [item?.id, item?.productId, item?.sku].map(text).includes(selectedId));
      if (match) return match;
    }
    return products.find((item) => item?.status === "ready_for_seller_tool" || item?.status === "bereit_manuell_einstellen") || products[0] || {};
  }

  function dataset() {
    const products = collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]);
    const orders = collection(["elyonOrders", "ebayOrders", "elyonSales"]);
    const returns = collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]);
    const invoices = collection(["elyonInvoices", "sellerInvoices"]);
    return {
      products,
      orders,
      returns,
      invoices,
      tasks: readTasks(),
      agentResults: readTasks().filter((task) => task?.result),
    };
  }

  function contextForAgent(agentId) {
    const data = dataset();
    if (["elyon-listing-pro", "elyon-compliance-guard", "elyon-profit-analyst", "elyon-product-data-checker"].includes(agentId)) {
      return { product: selectedProduct(data.products) };
    }
    if (agentId === "elyon-order-coordinator") return { order: data.orders[0] || {} };
    if (agentId === "elyon-support-assistant") return { returnCase: data.returns[0] || {} };
    return { context: data };
  }

  function statusLabel(status) {
    const labels = {
      queued: "Wartet",
      analyzing: "Analysiert",
      draft_ready: "Entwurf fertig",
      approval_required: "Freigabe nötig",
      approved: "Freigegeben",
      rejected: "Verworfen",
      completed: "Abgeschlossen",
      failed: "Fehler",
      blocked: "Blockiert",
    };
    return labels[status] || text(status, "Unbekannt");
  }

  function resultStatusClass(status) {
    if (["passed", "approved", "completed", "draft_ready"].includes(status)) return "aiw-good";
    if (["blocked", "failed", "rejected"].includes(status)) return "aiw-bad";
    return "aiw-warn";
  }

  function installStyles() {
    if (document.getElementById("elyonAiWorkforceStyles")) return;
    const style = document.createElement("style");
    style.id = "elyonAiWorkforceStyles";
    style.textContent = `
      .aiw-shell{margin-top:18px;padding:18px;border-radius:24px;background:rgba(15,23,42,.72);border:1px solid rgba(96,165,250,.22);box-shadow:0 20px 60px rgba(0,0,0,.2)}
      .aiw-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.aiw-head h2{margin:0 0 6px}.aiw-head p{margin:0;color:#94a3b8;max-width:760px;font-size:13px;line-height:1.5}
      .aiw-badges{display:flex;gap:7px;flex-wrap:wrap}.aiw-badge{padding:6px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.2);background:rgba(2,6,23,.45);font-size:11px;font-weight:900;color:#cbd5e1}
      .aiw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}.aiw-card{padding:14px;border-radius:18px;background:rgba(2,6,23,.46);border:1px solid rgba(148,163,184,.14);display:grid;gap:10px}.aiw-card-head{display:flex;gap:10px;align-items:flex-start}.aiw-icon{font-size:22px}.aiw-card h3{margin:0;color:#e2e8f0;font-size:15px}.aiw-role{color:#94a3b8;font-size:12px;line-height:1.4}.aiw-meta{display:flex;gap:6px;flex-wrap:wrap}.aiw-meta span{font-size:10px;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.06);color:#cbd5e1}
      .aiw-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.aiw-fields label{font-size:10px;color:#94a3b8}.aiw-fields select,.aiw-fields input{margin:4px 0 0;padding:8px 9px;border-radius:10px;font-size:12px}.aiw-actions{display:flex;gap:8px;flex-wrap:wrap}.aiw-actions button{padding:9px 10px;border-radius:11px;font-size:12px}.aiw-secondary{background:rgba(255,255,255,.08)!important;border:1px solid rgba(255,255,255,.12)!important}.aiw-danger{background:rgba(239,68,68,.14)!important;border:1px solid rgba(239,68,68,.26)!important;color:#fecaca!important}
      .aiw-workbook{margin-top:18px;padding-top:16px;border-top:1px solid rgba(148,163,184,.14)}.aiw-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.aiw-toolbar select{width:auto;margin:0;padding:9px 11px}.aiw-task-list{display:grid;gap:9px;margin-top:12px}.aiw-task{padding:12px;border-radius:15px;background:rgba(2,6,23,.4);border:1px solid rgba(148,163,184,.14)}.aiw-task-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.aiw-task-title{font-weight:900;color:#e2e8f0}.aiw-task small{color:#94a3b8}.aiw-summary{margin-top:8px;color:#cbd5e1;font-size:12px;line-height:1.45}.aiw-detail{margin-top:8px}.aiw-detail summary{cursor:pointer;color:#bfdbfe;font-size:12px;font-weight:800}.aiw-detail pre{white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.4;color:#cbd5e1;background:rgba(0,0,0,.18);padding:10px;border-radius:12px;max-height:320px;overflow:auto}.aiw-task-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.aiw-task-actions button{padding:7px 9px;font-size:11px;border-radius:9px}.aiw-empty{padding:20px;border:1px dashed rgba(148,163,184,.25);border-radius:15px;text-align:center;color:#94a3b8;font-size:12px}
      .aiw-status{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900}.aiw-good{color:#86efac;background:rgba(34,197,94,.12)}.aiw-warn{color:#fde68a;background:rgba(250,204,21,.11)}.aiw-bad{color:#fca5a5;background:rgba(239,68,68,.12)}.aiw-toast{position:fixed;right:18px;bottom:18px;z-index:10000;padding:12px 14px;border-radius:14px;background:#0f172a;border:1px solid rgba(96,165,250,.35);color:#e2e8f0;box-shadow:0 18px 50px rgba(0,0,0,.35);font-size:13px;max-width:min(420px,90vw)}
      @media(max-width:1000px){.aiw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.aiw-grid{grid-template-columns:1fr}.aiw-fields{grid-template-columns:1fr}.aiw-shell{padding:14px}.aiw-task-top{display:grid}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.querySelector(".aiw-toast")?.remove();
    const node = document.createElement("div");
    node.className = "aiw-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4500);
  }

  function findMountHost() {
    const direct = [
      document.getElementById("settings"),
      document.getElementById("settingsTab"),
      document.getElementById("einstellungen"),
      document.querySelector('[data-tab="settings"]'),
      document.querySelector('[data-section="settings"]'),
    ].find(Boolean);
    if (direct) return direct;

    const heading = [...document.querySelectorAll("h1,h2,h3,summary")].find((node) => {
      const value = text(node.textContent).toLowerCase();
      return value.includes("ki und modelle") || value.includes("einstellungen") || value.includes("settings");
    });
    if (heading) return heading.closest(".tab,.card,.settings-section,section,main") || heading.parentElement;
    return document.querySelector(".container") || document.querySelector("main") || document.body;
  }

  function createShell() {
    const shell = document.createElement("section");
    shell.id = "elyonAiWorkforce";
    shell.className = "aiw-shell";
    shell.innerHTML = `
      <div class="aiw-head">
        <div><h2>Virtuelle Mitarbeiter</h2><p>Echte KI-Analysen mit strukturierter Ausgabe. Alle Ergebnisse bleiben Entwürfe und benötigen deine Prüfung. Veröffentlichungen, Bestellungen, Kundennachrichten und Rückerstattungen sind gesperrt.</p></div>
        <div class="aiw-badges"><span class="aiw-badge">AI Workforce V1</span><span class="aiw-badge">Autonomie max. Stufe 3</span><span class="aiw-badge">Manuelle Freigabe</span></div>
      </div>
      <div class="aiw-grid" id="aiwAgentGrid"></div>
      <div class="aiw-workbook">
        <div class="aiw-toolbar"><div><strong>Gemeinsame Arbeitsmappe</strong><div class="aiw-role">Ergebnisse, Freigaben, Blocker und Fehler aller Mitarbeiter</div></div>
          <div><select id="aiwTaskFilter"><option value="all">Alle Aufgaben</option><option value="approval_required">Freigabe nötig</option><option value="blocked">Blockiert</option><option value="failed">Fehler</option><option value="approved">Freigegeben</option><option value="completed">Abgeschlossen</option></select></div>
        </div>
        <div class="aiw-task-list" id="aiwTaskList"></div>
      </div>
    `;
    shell.querySelector("#aiwTaskFilter")?.addEventListener("change", (event) => {
      state.filter = event.target.value;
      renderTasks();
    });
    return shell;
  }

  function agentState(agentId) {
    return migrateSettings().agents[agentId] || {};
  }

  function latestTask(agentId) {
    return readTasks().find((task) => task?.agentId === agentId) || null;
  }

  function providerAvailability(provider) {
    if (!state.providerStatus) return "unbekannt";
    return state.providerStatus[provider] ? "bereit" : "nicht konfiguriert";
  }

  function renderCards() {
    const grid = document.getElementById("aiwAgentGrid");
    if (!grid) return;
    const settings = migrateSettings();
    grid.innerHTML = AGENTS.map((definition) => {
      const agent = settings.agents[definition.id] || {};
      const last = latestTask(definition.id);
      const isPaused = agent.paused === true || agent.enabled === false || agent.active === false;
      return `
        <article class="aiw-card" data-agent-id="${definition.id}">
          <div class="aiw-card-head"><div class="aiw-icon">${definition.icon}</div><div><h3>${escapeHtml(definition.name)}</h3><div class="aiw-role">${escapeHtml(definition.role)}</div></div></div>
          <div class="aiw-meta"><span>Phase ${definition.phase}</span><span>${isPaused ? "pausiert" : "aktiv"}</span><span>${escapeHtml(providerAvailability(agent.provider))}</span>${last ? `<span>${escapeHtml(statusLabel(last.status))}</span>` : ""}</div>
          <div class="aiw-fields">
            <label>Provider<select data-field="provider"><option value="openai" ${agent.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="deepseek" ${agent.provider === "deepseek" ? "selected" : ""}>DeepSeek</option><option value="qwen" ${agent.provider === "qwen" ? "selected" : ""}>Qwen</option><option value="local" ${agent.provider === "local" ? "selected" : ""}>Lokal</option></select></label>
            <label>Modell<input data-field="model" value="${escapeHtml(agent.model || "")}" placeholder="zentrale Vorgabe" /></label>
            <label>Autonomie<select data-field="autonomyLevel"><option value="0" ${agent.autonomyLevel === 0 ? "selected" : ""}>0 · Aus</option><option value="1" ${agent.autonomyLevel === 1 ? "selected" : ""}>1 · Manuell</option><option value="2" ${agent.autonomyLevel === 2 ? "selected" : ""}>2 · Vorschläge</option><option value="3" ${agent.autonomyLevel === 3 ? "selected" : ""}>3 · interne Entwürfe</option><option value="4" disabled>4 · gesperrt</option></select></label>
            <label>Tageslimit €<input data-field="dailyLimit" type="number" min="0" step="0.05" value="${Number(agent.dailyLimit || 0).toFixed(2)}" /></label>
          </div>
          <div class="aiw-actions"><button data-action="run" ${isPaused || agent.autonomyLevel === 0 ? "disabled" : ""}>Jetzt ausführen</button><button class="aiw-secondary" data-action="test">Test</button><button class="${isPaused ? "aiw-secondary" : "aiw-danger"}" data-action="pause">${isPaused ? "Aktivieren" : "Pausieren"}</button></div>
        </article>
      `;
    }).join("");

    grid.querySelectorAll(".aiw-card").forEach((card) => {
      const agentId = card.dataset.agentId;
      card.querySelectorAll("[data-field]").forEach((field) => {
        field.addEventListener("change", () => updateAgentSetting(agentId, field.dataset.field, field.value));
      });
      card.querySelector('[data-action="run"]')?.addEventListener("click", () => runAgent(agentId));
      card.querySelector('[data-action="test"]')?.addEventListener("click", () => runAgent(agentId, { test: true }));
      card.querySelector('[data-action="pause"]')?.addEventListener("click", () => toggleAgent(agentId));
    });
  }

  function taskResultText(task) {
    if (task?.result?.summary) return task.result.summary;
    if (task?.errors?.length) return task.errors.join(" ");
    return "Noch kein Ergebnis vorhanden.";
  }

  function renderTasks() {
    const list = document.getElementById("aiwTaskList");
    if (!list) return;
    const tasks = readTasks().filter((task) => state.filter === "all" || task.status === state.filter).slice(0, 40);
    if (!tasks.length) {
      list.innerHTML = '<div class="aiw-empty">Noch keine passenden Agenten-Aufgaben vorhanden.</div>';
      return;
    }
    list.innerHTML = tasks.map((task) => {
      const definition = AGENTS.find((agent) => agent.id === task.agentId);
      const canApprove = ["approval_required", "draft_ready"].includes(task.status);
      const canRetry = ["failed", "blocked", "rejected"].includes(task.status);
      return `
        <article class="aiw-task" data-task-id="${escapeHtml(task.id)}">
          <div class="aiw-task-top"><div><div class="aiw-task-title">${escapeHtml(task.title || definition?.name || task.agentId)}</div><small>${escapeHtml(definition?.name || task.agentId)} · ${escapeHtml(task.provider || "lokal")} ${task.model ? `· ${escapeHtml(task.model)}` : ""} · ${new Date(task.updatedAt || task.createdAt).toLocaleString("de-DE")}</small></div><span class="aiw-status ${resultStatusClass(task.status)}">${escapeHtml(statusLabel(task.status))}</span></div>
          <div class="aiw-summary">${escapeHtml(taskResultText(task))}</div>
          <details class="aiw-detail"><summary>Strukturiertes Ergebnis anzeigen</summary><pre>${escapeHtml(JSON.stringify(task.result || { warnings: task.warnings, errors: task.errors }, null, 2))}</pre></details>
          <div class="aiw-task-actions">${canApprove ? '<button data-action="approve">Freigeben</button><button class="aiw-danger" data-action="reject">Verwerfen</button>' : ""}${canRetry ? '<button class="aiw-secondary" data-action="retry">Erneut versuchen</button>' : ""}<button class="aiw-secondary" data-action="delete">Aus Mappe entfernen</button></div>
        </article>
      `;
    }).join("");

    list.querySelectorAll(".aiw-task").forEach((node) => {
      const taskId = node.dataset.taskId;
      node.querySelector('[data-action="approve"]')?.addEventListener("click", () => setTaskStatus(taskId, "approved"));
      node.querySelector('[data-action="reject"]')?.addEventListener("click", () => setTaskStatus(taskId, "rejected"));
      node.querySelector('[data-action="retry"]')?.addEventListener("click", () => retryTask(taskId));
      node.querySelector('[data-action="delete"]')?.addEventListener("click", () => deleteTask(taskId));
    });
  }

  function updateAgentSetting(agentId, field, rawValue) {
    const settings = migrateSettings();
    const agent = settings.agents[agentId];
    if (!agent) return;
    if (["autonomyLevel", "dailyLimit", "maxTokens", "temperature"].includes(field)) agent[field] = Number(rawValue);
    else agent[field] = rawValue;
    settings.agents[agentId] = agent;
    writeJson(SETTINGS_KEY, settings);
    renderCards();
  }

  function toggleAgent(agentId) {
    const settings = migrateSettings();
    const agent = settings.agents[agentId];
    if (!agent) return;
    const shouldEnable = agent.paused === true || agent.enabled === false || agent.active === false;
    agent.active = true;
    agent.enabled = shouldEnable;
    agent.paused = !shouldEnable;
    settings.agents[agentId] = agent;
    writeJson(SETTINGS_KEY, settings);
    renderCards();
    toast(shouldEnable ? `${agent.name} wurde aktiviert.` : `${agent.name} wurde pausiert.`);
  }

  function temporaryTask(agentId, title, sourceType, sourceId) {
    return {
      id: `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      type: "analysis",
      title,
      sourceType,
      sourceId: sourceId || "",
      priority: "medium",
      status: "analyzing",
      provider: agentState(agentId).provider,
      model: agentState(agentId).model || "",
      inputSnapshot: {},
      result: null,
      warnings: [],
      errors: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      approvedAt: null,
      approvedBy: null,
    };
  }

  async function runAgent(agentId, options = {}) {
    const definition = AGENTS.find((agent) => agent.id === agentId);
    const agent = agentState(agentId);
    if (!definition || !agent) return;
    if (agent.paused || agent.enabled === false || agent.active === false || agent.autonomyLevel === 0) {
      toast("Dieser Mitarbeiter ist pausiert oder ausgeschaltet.");
      return;
    }
    if (agent.dailyLimit > 0 && agent.todayUsage >= agent.dailyLimit) {
      toast("Das Tageslimit dieses Mitarbeiters ist erreicht.");
      return;
    }

    const context = contextForAgent(agentId);
    const source = context.product || context.order || context.returnCase || context.context || {};
    const sourceId = text(source.id || source.productId || source.orderId || source.returnId || "");
    const draftTask = temporaryTask(agentId, `${definition.name}${options.test ? " · Test" : ""}`, definition.action.replace("analyze_", ""), sourceId);
    upsertTask(draftTask);

    try {
      const response = await fetch("/api/ai-agent-run", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: definition.action,
          agentId,
          title: draftTask.title,
          sourceId,
          input: context,
          agent: {
            provider: options.test ? "local" : agent.provider,
            model: options.test ? "" : agent.model,
            allowFallback: agent.allowFallback,
            temperature: agent.temperature,
            maxTokens: agent.maxTokens,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.task) {
        upsertTask({
          ...draftTask,
          status: "failed",
          errors: [payload.message || payload.error || `HTTP ${response.status}`],
          updatedAt: nowIso(),
        });
        toast(payload.message || "Agenten-Aufruf fehlgeschlagen.");
        return;
      }
      const returnedTask = { ...payload.task, id: draftTask.id, createdAt: draftTask.createdAt, updatedAt: nowIso() };
      upsertTask(returnedTask);
      const settings = migrateSettings();
      const current = settings.agents[agentId];
      current.lastRun = nowIso();
      current.lastResult = returnedTask.result?.summary || "Analyse abgeschlossen";
      current.lastExecutionMode = returnedTask.provider === "local" ? "local" : "server-ai";
      current.todayUsage = Number(current.todayUsage || 0) + (returnedTask.provider === "local" ? 0 : 0.01);
      settings.agents[agentId] = current;
      writeJson(SETTINGS_KEY, settings);
      renderCards();
      toast(`${definition.name}: Ergebnis liegt zur Prüfung bereit.`);
    } catch (error) {
      upsertTask({ ...draftTask, status: "failed", errors: [error.message || "Netzwerkfehler"], updatedAt: nowIso() });
      toast("Agenten-Endpunkt ist nicht erreichbar.");
    }
  }

  function setTaskStatus(taskId, status) {
    const tasks = readTasks();
    const task = tasks.find((entry) => entry?.id === taskId);
    if (!task) return;
    task.status = status;
    task.updatedAt = nowIso();
    if (status === "approved") {
      task.approvedAt = nowIso();
      task.approvedBy = "seller-user";
    }
    writeTasks(tasks);
    renderTasks();
    renderCards();
    toast(status === "approved" ? "Ergebnis freigegeben. Es wurde keine externe Aktion ausgeführt." : "Ergebnis verworfen.");
  }

  function deleteTask(taskId) {
    writeTasks(readTasks().filter((task) => task?.id !== taskId));
    renderTasks();
    renderCards();
  }

  async function retryTask(taskId) {
    const task = readTasks().find((entry) => entry?.id === taskId);
    if (!task) return;
    await runAgent(task.agentId);
  }

  async function loadProviderStatus() {
    try {
      const response = await fetch("/api/ai-agent-run", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.providers) state.providerStatus = data.providers;
    } catch {
      state.providerStatus = null;
    }
    renderCards();
  }

  function enqueueTrigger(agentId, title, detail = {}) {
    const settings = migrateSettings();
    const agent = settings.agents[agentId];
    if (!agent || agent.autonomyLevel < 2 || agent.paused || agent.enabled === false) return null;
    const task = {
      ...temporaryTask(agentId, title, "trigger", text(detail.sourceId || detail.id)),
      status: "queued",
      inputSnapshot: detail,
      warnings: ["Automatischer Trigger hat nur eine Aufgabe erzeugt; es wurde keine externe Aktion ausgeführt."],
    };
    upsertTask(task);
    return task;
  }

  function bindTriggers() {
    const bindings = [
      ["elyon:product-approved", "elyon-compliance-guard", "Freigegebenes Produkt auf Compliance prüfen"],
      ["elyon:listing-updated", "elyon-listing-pro", "Geänderten Listing-Entwurf prüfen"],
      ["elyon:new-order", "elyon-order-coordinator", "Neue Bestellung prüfen"],
      ["elyon:return-created", "elyon-support-assistant", "Neuen Support- oder Retourenfall prüfen"],
    ];
    bindings.forEach(([eventName, agentId, title]) => {
      window.addEventListener(eventName, (event) => enqueueTrigger(agentId, title, event.detail || {}));
    });
  }

  function mount() {
    migrateSettings();
    installStyles();
    if (document.getElementById("elyonAiWorkforce")) {
      renderCards();
      renderTasks();
      return document.getElementById("elyonAiWorkforce");
    }
    const host = findMountHost();
    if (!host) return null;
    const shell = createShell();
    host.appendChild(shell);
    state.mounted = true;
    renderCards();
    renderTasks();
    loadProviderStatus();
    return shell;
  }

  function watchMount() {
    mount();
    const observer = new MutationObserver(() => {
      if (!document.getElementById("elyonAiWorkforce")) mount();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.ElyonAIWorkforce = {
    mount,
    runAgent,
    enqueueTrigger,
    tasks: readTasks,
    settings: migrateSettings,
    approveTask: (id) => setTaskStatus(id, "approved"),
    rejectTask: (id) => setTaskStatus(id, "rejected"),
  };

  bindTriggers();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchMount, { once: true });
  else watchMount();
})();
