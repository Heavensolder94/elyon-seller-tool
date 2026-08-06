(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const RUN_KEY = "elyon_ai_workforce_run_v3";
  const STYLE_ID = "elyonAiWorkforceWorkspaceV3Styles";
  const AUTONOMY_MODAL_ID = "elyonAiWorkforceAutonomyV3Modal";
  const DANGER_MODAL_ID = "elyonAiWorkforceDangerV3Modal";
  const UNLOCK_PHRASE = "ELYON EXTERN FREIGEBEN";

  const MODES = [
    { id: "off", level: 0, label: "Aus", description: "Der Mitarbeiter arbeitet nicht." },
    { id: "manual", level: 1, label: "Manuell", description: "Arbeitet ausschließlich nach deinem Klick." },
    { id: "assisted", level: 2, label: "Assistiert", description: "Erkennt Aufgaben und erstellt Vorschläge, startet aber nichts selbst." },
    { id: "semi", level: 3, label: "Teilautomatisch", description: "Führt einen sicheren internen Schritt aus und wartet dann auf Freigabe." },
    { id: "auto_internal", level: 4, label: "Vollautomatisch intern", description: "Steuert den gesamten internen Workflow bis zum festgelegten Stopppunkt." },
    { id: "auto_external", level: 5, label: "Vollautomatisch extern", description: "Darf zusätzlich einzeln freigeschaltete externe Aktionen ausführen." },
  ];

  const AGENTS = [
    { id: "elyon-manager", name: "Elyon Manager", icon: "🧠", group: "manager", role: "Steuert Abläufe, Stopppunkte, Freigaben und Fachagenten." },
    { id: "elyon-product-data-specialist", name: "Product Data", icon: "🧩", group: "product", role: "Prüft Produktdaten, Varianten, Bilder und Lieferantenangaben." },
    { id: "elyon-compliance-specialist", name: "Compliance", icon: "🛡️", group: "product", role: "Prüft GPSR, Hersteller, CE, Pflichtangaben und Risiken." },
    { id: "elyon-profit-specialist", name: "Profit", icon: "📊", group: "product", role: "Prüft Gewinn, Marge, Reserven und Preisszenarien." },
    { id: "elyon-listing-specialist", name: "Listing", icon: "✍️", group: "listing", role: "Erstellt Titel, Beschreibung, SEO und Merkmale." },
    { id: "elyon-draft-quality-guard", name: "Draft QA", icon: "🔎", group: "listing", role: "Prüft den fertigen Entwurf vor der Freigabe." },
    { id: "elyon-order-specialist", name: "Orders", icon: "📦", group: "operations", role: "Überwacht Bestellungen, Fristen und Tracking." },
    { id: "elyon-customer-support-specialist", name: "Support", icon: "💬", group: "operations", role: "Erstellt Antwortentwürfe für Kundenfälle." },
  ];

  const PRODUCT_FLOW = ["elyon-manager", "elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist", "elyon-listing-specialist", "elyon-draft-quality-guard"];
  const OPERATIONS_FLOW = ["elyon-manager", "elyon-order-specialist", "elyon-customer-support-specialist"];

  const EXTERNAL_ACTIONS = [
    { id: "createEbayDraft", label: "eBay-Entwurf erstellen", description: "Erstellt einen unveröffentlichten eBay-Entwurf, sofern ein ausführender Connector registriert ist." },
    { id: "updateLivePrice", label: "Live-Preis ändern", description: "Ändert einen aktiven Angebotspreis innerhalb der festgelegten Grenze." },
    { id: "publishListing", label: "Listing veröffentlichen", description: "Veröffentlicht einen geprüften Entwurf bei eBay." },
    { id: "sendCustomerMessage", label: "Kundennachricht senden", description: "Versendet einen freigegebenen Standardfall automatisch." },
    { id: "placeSupplierOrder", label: "Lieferantenbestellung auslösen", description: "Bestellt beim Lieferanten innerhalb der erlaubten Grenzen." },
    { id: "issueRefund", label: "Erstattung durchführen", description: "Führt eine Erstattung bis zum eingestellten Maximalbetrag aus." },
  ];

  const DEFAULT_MODES = {
    "elyon-manager": "auto_internal",
    "elyon-product-data-specialist": "auto_internal",
    "elyon-compliance-specialist": "auto_internal",
    "elyon-profit-specialist": "auto_internal",
    "elyon-listing-specialist": "auto_internal",
    "elyon-draft-quality-guard": "auto_internal",
    "elyon-order-specialist": "semi",
    "elyon-customer-support-specialist": "assisted",
  };

  const state = { view: "product", running: false, renderQueued: false, lastAutoTriggerAt: 0 };
  const executors = new Map();

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

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const modeById = (id) => MODES.find((mode) => mode.id === id) || MODES[1];
  const agentById = (id) => AGENTS.find((agent) => agent.id === id);
  const nowIso = () => new Date().toISOString();

  function defaultAutonomy(agentId) {
    const isManager = agentId === "elyon-manager";
    return {
      mode: DEFAULT_MODES[agentId] || "manual",
      triggers: { onOpen: false, onProductApproved: isManager, onDataChanged: false, onNewOrder: agentId === "elyon-order-specialist", onNewSupportCase: agentId === "elyon-customer-support-specialist" },
      workflow: { startNextAgent: isManager, continueOnPass: true, continueOnWarning: false, stopOnBlocker: true, stopOnLowConfidence: true, confidenceThreshold: 0.75, maximumSteps: isManager ? 8 : 1, maximumParallelAgents: 1, endPoint: isManager ? "draft_quality" : "agent_result" },
      recovery: { retryOnFailure: true, maximumRetries: 1, useFallbackProvider: true, pauseAfterRepeatedFailure: true },
      permissions: { readData: true, saveResults: true, createTasks: true, updateInternalDrafts: ["elyon-manager", "elyon-product-data-specialist", "elyon-listing-specialist"].includes(agentId), updateInternalStatus: isManager, startOtherAgents: isManager, overwriteExistingResults: false },
      budget: { maximumCostPerTask: 0.25, maximumCostPerWorkflow: 1.5, preferLowCostModel: true, strongModelOnlyOnUncertainty: true },
    };
  }

  function ensureSettings() {
    const settings = readJson(SETTINGS_KEY, {});
    settings.agents = settings.agents && typeof settings.agents === "object" ? { ...settings.agents } : {};
    const firstMigration = Number(settings.workforceWorkspaceVersion || 0) < 3;
    AGENTS.forEach((definition) => {
      const current = settings.agents[definition.id] && typeof settings.agents[definition.id] === "object" ? settings.agents[definition.id] : {};
      const defaults = defaultAutonomy(definition.id);
      const previousLevel = Number(current.autonomyLevel ?? 1);
      let migratedMode = current.autonomyMode || current.autonomy?.mode;
      if (!migratedMode) {
        if (previousLevel <= 0 || current.active === false || current.enabled === false) migratedMode = "off";
        else if (firstMigration) migratedMode = DEFAULT_MODES[definition.id] || "manual";
        else migratedMode = previousLevel === 1 ? "manual" : previousLevel === 2 ? "assisted" : "semi";
      }
      const existing = current.autonomy && typeof current.autonomy === "object" ? current.autonomy : {};
      current.autonomyMode = migratedMode;
      current.autonomy = {
        ...defaults,
        ...existing,
        mode: migratedMode,
        triggers: { ...defaults.triggers, ...(existing.triggers || {}) },
        workflow: { ...defaults.workflow, ...(existing.workflow || {}) },
        recovery: { ...defaults.recovery, ...(existing.recovery || {}) },
        permissions: { ...defaults.permissions, ...(existing.permissions || {}) },
        budget: { ...defaults.budget, ...(existing.budget || {}) },
      };
      current.autonomyLevel = Math.min(3, modeById(migratedMode).level);
      current.active = migratedMode !== "off" && current.active !== false;
      current.enabled = migratedMode !== "off" && current.enabled !== false;
      current.paused = migratedMode === "off" ? true : current.paused === true;
      settings.agents[definition.id] = current;
    });
    settings.workforceWorkspaceVersion = 3;
    settings.mainAgentId = "elyon-manager";
    settings.dangerZone = settings.dangerZone && typeof settings.dangerZone === "object" ? settings.dangerZone : {};
    settings.dangerZone.externalAutomation = {
      unlocked: false,
      unlockedAt: null,
      unlockedBy: null,
      permissions: Object.fromEntries(EXTERNAL_ACTIONS.map((action) => [action.id, false])),
      limits: { maximumPriceChangePercent: 5, maximumRefundEur: 0, maximumOrderEur: 0 },
      ...(settings.dangerZone.externalAutomation || {}),
      permissions: { ...Object.fromEntries(EXTERNAL_ACTIONS.map((action) => [action.id, false])), ...(settings.dangerZone.externalAutomation?.permissions || {}) },
      limits: { maximumPriceChangePercent: 5, maximumRefundEur: 0, maximumOrderEur: 0, ...(settings.dangerZone.externalAutomation?.limits || {}) },
    };
    writeJson(SETTINGS_KEY, settings);
    return settings;
  }

  function getRun() {
    const run = readJson(RUN_KEY, null);
    return run && typeof run === "object" ? run : null;
  }

  function saveRun(run) {
    writeJson(RUN_KEY, run);
    queueRender();
  }

  function tasks() {
    const list = readJson(TASKS_KEY, []);
    return Array.isArray(list) ? list : [];
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

  function currentProduct() {
    const products = collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]);
    const selectedId = text(window.elyonSelectedProductId || localStorage.getItem("elyonSelectedProductId") || localStorage.getItem("elyon_active_product_id"));
    return products.find((item) => selectedId && [item?.id, item?.productId, item?.sku].map(text).includes(selectedId)) || products.find((item) => ["ready_for_seller_tool", "bereit_manuell_einstellen"].includes(item?.status)) || products[0] || null;
  }

  function latestTask(agentId) {
    return tasks().find((task) => task?.agentId === agentId) || null;
  }

  function taskStatus(task) {
    return text(task?.result?.status || task?.status, "idle");
  }

  function statusClass(status) {
    if (["passed", "completed", "approved", "draft_ready"].includes(status)) return "good";
    if (["blocked", "failed", "rejected"].includes(status)) return "bad";
    if (["warning", "manualReviewRequired", "approval_required"].includes(status)) return "warn";
    if (["analyzing", "running"].includes(status)) return "running";
    return "idle";
  }

  function statusLabel(status) {
    const labels = { idle: "Nicht gestartet", queued: "Wartet", analyzing: "Läuft", running: "Läuft", passed: "Bestanden", warning: "Warnung", blocked: "Blockiert", failed: "Fehler", manualReviewRequired: "Prüfung nötig", approval_required: "Freigabe nötig", draft_ready: "Entwurf fertig", approved: "Freigegeben", completed: "Abgeschlossen", paused: "Pausiert", stopped: "Gestoppt" };
    return labels[status] || status;
  }

  function setMode(agentId, modeId) {
    const settings = ensureSettings();
    const agent = settings.agents[agentId];
    if (!agent) return;
    if (modeId === "auto_external" && !settings.dangerZone.externalAutomation.unlocked) {
      openDangerZone();
      return;
    }
    agent.autonomyMode = modeId;
    agent.autonomy = { ...(agent.autonomy || defaultAutonomy(agentId)), mode: modeId };
    agent.autonomyLevel = Math.min(3, modeById(modeId).level);
    agent.active = modeId !== "off";
    agent.enabled = modeId !== "off";
    agent.paused = modeId === "off";
    settings.agents[agentId] = agent;
    writeJson(SETTINGS_KEY, settings);
    queueRender();
  }

  function updateAutonomy(agentId, path, value) {
    const settings = ensureSettings();
    const agent = settings.agents[agentId];
    const parts = path.split(".");
    let cursor = agent.autonomy;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) cursor[part] = value;
      else cursor = cursor[part] ||= {};
    });
    settings.agents[agentId] = agent;
    writeJson(SETTINGS_KEY, settings);
  }

  function runSummary(run) {
    if (!run) return "Noch kein Workflow gestartet.";
    if (run.status === "running") return `${run.workflowType === "product" ? "Produktworkflow" : "Betriebsworkflow"} läuft – Schritt ${Math.min(run.currentIndex + 1, run.sequence.length)} von ${run.sequence.length}.`;
    if (run.status === "waiting_approval") return "Der Workflow wartet auf deine Freigabe.";
    if (run.status === "blocked") return run.message || "Der Workflow wurde durch einen Blocker angehalten.";
    if (run.status === "completed") return "Der Workflow wurde vollständig abgeschlossen.";
    if (run.status === "paused") return "Der Workflow ist pausiert und kann fortgesetzt werden.";
    return run.message || `Workflowstatus: ${run.status}.`;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #elyonAiWorkforce.aiw-workspace-v3{padding:0;background:transparent;border:0;box-shadow:none}.aiw-workspace-v3>.aiw-head,.aiw-workspace-v3>.aiw-workbook{display:none!important}#aiwAgentGrid.aiw-v3-root{display:block!important;margin:0}
      .aiw-v3{--bg:#07101d;--panel:#0d1828;--line:rgba(148,163,184,.14);--muted:#8fa2b8;--text:#e8eef7;display:grid;gap:14px;color:var(--text)}.aiw-v3-command{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(130deg,rgba(30,64,175,.18),rgba(7,16,29,.96));box-shadow:0 18px 50px rgba(0,0,0,.22)}.aiw-v3-brand{display:flex;gap:12px;align-items:center}.aiw-v3-brand-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:rgba(59,130,246,.13);font-size:22px}.aiw-v3-brand h2{margin:0;font-size:18px}.aiw-v3-brand p{margin:3px 0 0;color:var(--muted);font-size:11px}.aiw-v3-command-right{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.aiw-v3-command select,.aiw-v3 button{margin:0}.aiw-v3-mode{min-width:190px;padding:10px 12px;border-radius:12px}.aiw-v3-primary{background:linear-gradient(135deg,#2563eb,#3b82f6)!important}.aiw-v3-danger-button{background:rgba(239,68,68,.1)!important;border:1px solid rgba(239,68,68,.22)!important;color:#fecaca!important}
      .aiw-v3-layout{display:grid;grid-template-columns:190px minmax(0,1fr) 270px;gap:14px;align-items:start}.aiw-v3-nav,.aiw-v3-side,.aiw-v3-main{border:1px solid var(--line);border-radius:18px;background:rgba(13,24,40,.92)}.aiw-v3-nav{padding:10px;position:sticky;top:12px}.aiw-v3-nav button{width:100%;display:flex;gap:9px;align-items:center;text-align:left;padding:11px 12px;border-radius:11px;background:transparent!important;border:0!important;color:#aebdce!important}.aiw-v3-nav button.active{background:rgba(59,130,246,.13)!important;color:#dbeafe!important}.aiw-v3-nav-sep{height:1px;background:var(--line);margin:8px 4px}.aiw-v3-nav small{display:block;padding:8px 12px 5px;color:#5f738b;font-weight:800;text-transform:uppercase;font-size:9px;letter-spacing:.08em}
      .aiw-v3-main{padding:16px;min-height:560px}.aiw-v3-hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(220px,.5fr);gap:12px}.aiw-v3-hero-card,.aiw-v3-current{padding:15px;border:1px solid var(--line);border-radius:15px;background:rgba(7,16,29,.58)}.aiw-v3-kicker{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#7ea7d8;font-weight:900}.aiw-v3-hero h3{margin:6px 0 5px;font-size:18px}.aiw-v3-hero p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.aiw-v3-controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.aiw-v3-controls button{padding:9px 12px;border-radius:10px;font-size:11px}.aiw-v3-current strong{display:block;margin:7px 0;color:#f8fafc}.aiw-v3-current span{font-size:11px;color:var(--muted)}
      .aiw-v3-pipeline{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-top:14px}.aiw-v3-step{padding:10px 8px;border-radius:12px;border:1px solid var(--line);background:rgba(7,16,29,.48);min-width:0}.aiw-v3-step-top{display:flex;justify-content:space-between;gap:4px;align-items:center}.aiw-v3-step strong{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aiw-v3-step small{display:block;margin-top:5px;color:var(--muted);font-size:9px}.aiw-v3-dot{width:8px;height:8px;border-radius:50%;background:#475569}.aiw-v3-step.good .aiw-v3-dot{background:#22c55e}.aiw-v3-step.warn .aiw-v3-dot{background:#f59e0b}.aiw-v3-step.bad .aiw-v3-dot{background:#ef4444}.aiw-v3-step.running{border-color:rgba(96,165,250,.45)}.aiw-v3-step.running .aiw-v3-dot{background:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,.12)}
      .aiw-v3-section{margin-top:16px}.aiw-v3-section-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:8px}.aiw-v3-section h3{margin:0;font-size:13px}.aiw-v3-section p{margin:3px 0 0;color:var(--muted);font-size:10px}.aiw-v3-agent-list{display:grid;gap:7px}.aiw-v3-agent{display:grid;grid-template-columns:minmax(150px,1fr) 120px 150px auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:rgba(7,16,29,.42)}.aiw-v3-agent-name{display:flex;gap:9px;align-items:center;min-width:0}.aiw-v3-agent-name i{font-style:normal}.aiw-v3-agent-name strong{font-size:12px}.aiw-v3-agent-name small{display:block;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.aiw-v3-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--muted)}.aiw-v3-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#475569}.aiw-v3-status.good::before{background:#22c55e}.aiw-v3-status.warn::before{background:#f59e0b}.aiw-v3-status.bad::before{background:#ef4444}.aiw-v3-status.running::before{background:#60a5fa}.aiw-v3-agent select{width:100%;padding:8px 9px;border-radius:9px;font-size:10px}.aiw-v3-agent-actions{display:flex;gap:5px}.aiw-v3-agent-actions button{padding:7px 9px;border-radius:9px;font-size:10px;white-space:nowrap}
      .aiw-v3-side{padding:13px;position:sticky;top:12px;display:grid;gap:11px}.aiw-v3-side-card{padding:12px;border:1px solid var(--line);border-radius:13px;background:rgba(7,16,29,.48)}.aiw-v3-side-card h4{margin:0 0 9px;font-size:11px}.aiw-v3-side-card p{margin:0;color:var(--muted);font-size:10px;line-height:1.5}.aiw-v3-side-list{display:grid;gap:6px}.aiw-v3-side-item{padding:8px;border-radius:9px;background:rgba(255,255,255,.035);font-size:10px;color:#c6d2e0}.aiw-v3-side-item.bad{color:#fecaca;background:rgba(239,68,68,.07)}.aiw-v3-side-item.warn{color:#fde68a;background:rgba(245,158,11,.07)}.aiw-v3-external-state{display:flex;justify-content:space-between;gap:8px;align-items:center}.aiw-v3-pill{padding:4px 7px;border-radius:999px;background:rgba(148,163,184,.1);font-size:9px;font-weight:900}.aiw-v3-pill.unlocked{background:rgba(239,68,68,.12);color:#fecaca}.aiw-v3-activity{max-height:220px;overflow:auto}
      .aiw-v3-modal{position:fixed;inset:0;z-index:19000;background:rgba(2,6,23,.82);backdrop-filter:blur(8px);display:flex;justify-content:flex-end}.aiw-v3-modal-panel{width:min(720px,100%);height:100%;overflow:auto;background:#0b1422;border-left:1px solid var(--line);padding:20px}.aiw-v3-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-20px;background:#0b1422;padding:20px 0 13px;z-index:2;border-bottom:1px solid var(--line)}.aiw-v3-modal-head h2{margin:0}.aiw-v3-modal-head p{margin:5px 0 0;color:var(--muted);font-size:11px}.aiw-v3-modal-section{margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:15px;background:rgba(15,31,50,.55)}.aiw-v3-modal-section h3{margin:0 0 10px;font-size:12px}.aiw-v3-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.aiw-v3-check{display:flex;gap:8px;align-items:flex-start;padding:9px;border-radius:10px;background:rgba(255,255,255,.035);font-size:10px}.aiw-v3-field{display:grid;gap:5px;font-size:10px}.aiw-v3-field input,.aiw-v3-field select{margin:0;padding:9px;border-radius:9px}.aiw-v3-modal-actions{position:sticky;bottom:-20px;background:#0b1422;border-top:1px solid var(--line);padding:13px 0 20px;margin-top:14px;display:flex;gap:8px}.aiw-v3-warning{padding:11px;border-radius:11px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:#fde68a;font-size:10px;line-height:1.5}.aiw-v3-danger{padding:11px;border-radius:11px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.22);color:#fecaca;font-size:10px;line-height:1.5}
      @media(max-width:1120px){.aiw-v3-layout{grid-template-columns:150px minmax(0,1fr)}.aiw-v3-side{grid-column:1/-1;position:static;grid-template-columns:repeat(3,minmax(0,1fr))}.aiw-v3-pipeline{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.aiw-v3-command{align-items:flex-start}.aiw-v3-command,.aiw-v3-command-right{display:grid}.aiw-v3-layout{grid-template-columns:1fr}.aiw-v3-nav{position:static;display:flex;overflow:auto}.aiw-v3-nav small,.aiw-v3-nav-sep{display:none}.aiw-v3-nav button{min-width:max-content}.aiw-v3-hero{grid-template-columns:1fr}.aiw-v3-pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}.aiw-v3-agent{grid-template-columns:1fr 110px}.aiw-v3-agent>select{grid-column:1}.aiw-v3-agent-actions{grid-column:2;grid-row:1/3;display:grid}.aiw-v3-side{grid-template-columns:1fr}.aiw-v3-form-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.querySelector(".aiw-v3-toast")?.remove();
    const node = document.createElement("div");
    node.className = "aiw-toast aiw-v3-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4000);
  }

  function modeOptions(selected, allowExternal) {
    return MODES.map((mode) => `<option value="${mode.id}" ${mode.id === selected ? "selected" : ""} ${mode.id === "auto_external" && !allowExternal ? "disabled" : ""}>${mode.level} · ${mode.label}</option>`).join("");
  }

  function pipelineHtml(sequence, run) {
    return sequence.map((agentId, index) => {
      const definition = agentById(agentId);
      const history = run?.history?.find((entry) => entry.agentId === agentId);
      const current = run?.status === "running" && run.currentIndex === index;
      const task = history?.taskId ? tasks().find((entry) => entry.id === history.taskId) : latestTask(agentId);
      const status = current ? "running" : taskStatus(task);
      return `<div class="aiw-v3-step ${statusClass(status)}"><div class="aiw-v3-step-top"><strong>${escapeHtml(definition?.name || agentId)}</strong><span class="aiw-v3-dot"></span></div><small>${escapeHtml(statusLabel(status))}</small></div>`;
    }).join("");
  }

  function relevantAgents() {
    if (state.view === "team") return AGENTS.filter((agent) => agent.group !== "manager");
    if (state.view === "operations") return AGENTS.filter((agent) => agent.group === "operations");
    return AGENTS.filter((agent) => ["product", "listing"].includes(agent.group));
  }

  function agentRowsHtml(settings) {
    const unlocked = settings.dangerZone.externalAutomation.unlocked;
    return relevantAgents().map((definition) => {
      const agent = settings.agents[definition.id];
      const status = taskStatus(latestTask(definition.id));
      return `<div class="aiw-v3-agent" data-agent-id="${definition.id}"><div class="aiw-v3-agent-name"><i>${definition.icon}</i><div><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(definition.role)}</small></div></div><span class="aiw-v3-status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span><select data-agent-mode="${definition.id}">${modeOptions(agent.autonomyMode, unlocked)}</select><div class="aiw-v3-agent-actions"><button data-agent-run="${definition.id}">Start</button><button class="aiw-secondary" data-agent-autonomy="${definition.id}">Autonomie</button><button class="aiw-secondary" data-agent-specialist="${definition.id}">Fachregeln</button></div></div>`;
    }).join("");
  }

  function sideItems(items, kind, emptyText) {
    if (!items.length) return `<p>${escapeHtml(emptyText)}</p>`;
    return `<div class="aiw-v3-side-list">${items.slice(0, 8).map((item) => `<div class="aiw-v3-side-item ${kind}">${escapeHtml(item)}</div>`).join("")}</div>`;
  }

  function render() {
    const shell = document.getElementById("elyonAiWorkforce");
    const grid = document.getElementById("aiwAgentGrid");
    if (!shell || !grid || !window.ElyonAIWorkforceV2) return false;
    installStyles();
    const settings = ensureSettings();
    const manager = settings.agents["elyon-manager"];
    const run = getRun();
    const product = currentProduct();
    const sequence = state.view === "operations" ? OPERATIONS_FLOW : PRODUCT_FLOW;
    const lastManager = latestTask("elyon-manager");
    const blockers = [...(run?.blockers || []), ...(lastManager?.result?.blockers || [])];
    const warnings = [...(run?.warnings || []), ...(lastManager?.result?.warnings || [])];
    const approvals = tasks().filter((task) => ["approval_required", "manualReviewRequired", "draft_ready"].includes(task?.status) || task?.result?.status === "manualReviewRequired").slice(0, 6);
    const recent = tasks().slice(0, 7);
    const external = settings.dangerZone.externalAutomation;
    const activeExternalCount = Object.values(external.permissions || {}).filter(Boolean).length;

    shell.classList.add("aiw-workspace-v3");
    grid.className = "aiw-v3-root";
    grid.innerHTML = `<div class="aiw-v3" data-agent-id="elyon-manager"><header class="aiw-v3-command"><div class="aiw-v3-brand"><div class="aiw-v3-brand-icon">🧠</div><div><h2>Elyon Arbeitszentrale</h2><p>Ein Hauptagent steuert Prüfungen, Entwürfe, Stopppunkte und Freigaben.</p></div></div><div class="aiw-v3-command-right"><select class="aiw-v3-mode" id="aiwV3ManagerMode">${modeOptions(manager.autonomyMode, external.unlocked)}</select><button class="aiw-secondary" data-v3-action="autonomy-manager">Autonomie einstellen</button><button class="aiw-v3-danger-button" data-v3-action="danger">Danger Zone</button></div></header><div class="aiw-v3-layout"><nav class="aiw-v3-nav"><small>Arbeitsbereiche</small><button data-v3-view="product" class="${state.view === "product" ? "active" : ""}">◫ Produktworkflow</button><button data-v3-view="operations" class="${state.view === "operations" ? "active" : ""}">◎ Laufender Betrieb</button><button data-v3-view="team" class="${state.view === "team" ? "active" : ""}">◉ Mitarbeiterteam</button><div class="aiw-v3-nav-sep"></div><button data-v3-action="manager-settings">⚙ Manager-Fachregeln</button><button data-v3-action="reset-run">↻ Lauf zurücksetzen</button></nav><main class="aiw-v3-main"><section class="aiw-v3-hero"><div class="aiw-v3-hero-card"><span class="aiw-v3-kicker">${state.view === "operations" ? "Betriebssteuerung" : state.view === "team" ? "Teamsteuerung" : "Produktsteuerung"}</span><h3>${escapeHtml(runSummary(run))}</h3><p>${escapeHtml(lastManager?.result?.summary || "Der Elyon Manager führt interne Schritte selbstständig aus und stoppt an deinen festgelegten Grenzen.")}</p><div class="aiw-v3-controls"><button class="aiw-v3-primary" data-v3-action="start" ${state.running ? "disabled" : ""}>▶ ${state.view === "operations" ? "Betrieb prüfen" : "Workflow starten"}</button><button class="aiw-secondary" data-v3-action="pause" ${run?.status !== "running" ? "disabled" : ""}>Ⅱ Pausieren</button><button class="aiw-secondary" data-v3-action="resume" ${!["paused", "waiting_approval"].includes(run?.status) ? "disabled" : ""}>▶ Fortsetzen</button><button class="aiw-secondary" data-v3-action="stop" ${!run || ["completed", "stopped"].includes(run.status) ? "disabled" : ""}>■ Stoppen</button></div></div><div class="aiw-v3-current"><span class="aiw-v3-kicker">Aktueller Datensatz</span><strong>${escapeHtml(product?.title || product?.name || product?.sku || (state.view === "operations" ? "Bestellungen und Supportfälle" : "Kein Produkt ausgewählt"))}</strong><span>${product ? escapeHtml(product.sku || product.id || product.productId || "Produktdaten erkannt") : "Öffne oder wähle einen Datensatz, damit der Workflow gezielt arbeitet."}</span></div></section>${state.view !== "team" ? `<div class="aiw-v3-pipeline">${pipelineHtml(sequence, run)}</div>` : ""}<section class="aiw-v3-section"><div class="aiw-v3-section-head"><div><h3>${state.view === "team" ? "Alle Fachmitarbeiter" : state.view === "operations" ? "Betriebsteam" : "Fachmitarbeiter im Produktworkflow"}</h3><p>Die Hauptansicht zeigt nur Modus, Status und Arbeitsaktionen. Technische Details liegen in den Einstellungen.</p></div></div><div class="aiw-v3-agent-list">${agentRowsHtml(settings)}</div></section></main><aside class="aiw-v3-side"><section class="aiw-v3-side-card"><h4>Blocker</h4>${sideItems(blockers, "bad", "Keine aktiven Blocker.")}</section><section class="aiw-v3-side-card"><h4>Freigaben & Hinweise</h4>${approvals.length ? `<div class="aiw-v3-side-list">${approvals.map((task) => `<div class="aiw-v3-side-item warn">${escapeHtml(task.title || agentById(task.agentId)?.name || "Prüfung nötig")}</div>`).join("")}</div>` : sideItems(warnings, "warn", "Keine offenen Freigaben.")}</section><section class="aiw-v3-side-card"><div class="aiw-v3-external-state"><h4>Externe Vollautomatik</h4><span class="aiw-v3-pill ${external.unlocked ? "unlocked" : ""}">${external.unlocked ? "entsperrt" : "gesperrt"}</span></div><p>${external.unlocked ? `${activeExternalCount} externe Aktionen sind einzeln erlaubt. Nicht verbundene Aktionen werden nicht ausgeführt.` : "Externe Aktionen bleiben vollständig gesperrt. Vollautomatisch intern funktioniert unabhängig davon."}</p></section><section class="aiw-v3-side-card aiw-v3-activity"><h4>Letzte Aktivität</h4>${recent.length ? `<div class="aiw-v3-side-list">${recent.map((task) => `<div class="aiw-v3-side-item">${escapeHtml(task.title || task.agentId)} · ${escapeHtml(statusLabel(taskStatus(task)))}</div>`).join("")}</div>` : "<p>Noch keine Agentenaktivität.</p>"}</section></aside></div></div>`;
    bindUi();
    return true;
  }

  function bindUi() {
    document.querySelectorAll("[data-v3-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.v3View; render(); }));
    document.getElementById("aiwV3ManagerMode")?.addEventListener("change", (event) => setMode("elyon-manager", event.target.value));
    document.querySelectorAll("[data-agent-mode]").forEach((select) => select.addEventListener("change", () => setMode(select.dataset.agentMode, select.value)));
    document.querySelectorAll("[data-agent-run]").forEach((button) => button.addEventListener("click", () => runSingleAgent(button.dataset.agentRun)));
    document.querySelectorAll("[data-agent-autonomy]").forEach((button) => button.addEventListener("click", () => openAutonomy(button.dataset.agentAutonomy)));
    document.querySelectorAll("[data-agent-specialist]").forEach((button) => button.addEventListener("click", () => window.ElyonAIWorkforceV2Settings?.open?.(button.dataset.agentSpecialist)));
    document.querySelectorAll("[data-v3-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.v3Action)));
  }

  function handleAction(action) {
    if (action === "start") startWorkflow(state.view === "operations" ? "operations" : "product");
    if (action === "pause") pauseWorkflow();
    if (action === "resume") resumeWorkflow();
    if (action === "stop") stopWorkflow();
    if (action === "reset-run") { localStorage.removeItem(RUN_KEY); state.running = false; render(); }
    if (action === "danger") openDangerZone();
    if (action === "autonomy-manager") openAutonomy("elyon-manager");
    if (action === "manager-settings") window.ElyonAIWorkforceV2Settings?.open?.("elyon-manager");
  }

  async function runSingleAgent(agentId) {
    const settings = ensureSettings();
    if (settings.agents[agentId]?.autonomyMode === "off") return toast("Dieser Mitarbeiter ist ausgeschaltet.");
    await runAgentAndCapture(agentId);
    render();
  }

  async function runAgentAndCapture(agentId, workflowType = "product") {
    const before = new Set(tasks().map((task) => task.id));
    const startedAt = Date.now();
    if (agentId === "elyon-manager" && workflowType === "operations" && typeof window.ElyonAIWorkforceV2.runOperations === "function") await window.ElyonAIWorkforceV2.runOperations();
    else await window.ElyonAIWorkforceV2.runAgent(agentId);
    const candidates = tasks().filter((task) => task.agentId === agentId && !before.has(task.id));
    return candidates.find((task) => new Date(task.createdAt || task.updatedAt || 0).getTime() >= startedAt - 1000) || candidates[0] || latestTask(agentId);
  }

  function evaluateTask(task, autonomy) {
    if (!task) return { decision: "stop", reason: "Für diesen Schritt wurde kein Ergebnis gespeichert." };
    const resultStatus = text(task.result?.status || task.status);
    const blockers = Array.isArray(task.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    const warnings = Array.isArray(task.result?.warnings) ? task.result.warnings.filter(Boolean) : [];
    const confidence = Number(task.result?.confidence);
    if (resultStatus === "failed" || task.status === "failed") return { decision: "retry", reason: task.errors?.[0] || "Der Agentenaufruf ist fehlgeschlagen.", blockers, warnings };
    if (blockers.length || resultStatus === "blocked") return { decision: autonomy.workflow.stopOnBlocker ? "block" : "continue", reason: blockers[0] || "Der Fachagent hat einen Blocker gemeldet.", blockers, warnings };
    if (Number.isFinite(confidence) && confidence < Number(autonomy.workflow.confidenceThreshold || 0.75) && autonomy.workflow.stopOnLowConfidence) return { decision: "approval", reason: `Konfidenz ${Math.round(confidence * 100)} % liegt unter der Grenze.`, blockers, warnings };
    if (["warning", "manualReviewRequired"].includes(resultStatus) || warnings.length) return { decision: autonomy.workflow.continueOnWarning ? "continue" : "approval", reason: warnings[0] || "Der Fachagent verlangt eine Prüfung.", blockers, warnings };
    return { decision: "continue", reason: "Schritt erfolgreich abgeschlossen.", blockers, warnings };
  }

  async function startWorkflow(type) {
    const settings = ensureSettings();
    const manager = settings.agents["elyon-manager"];
    const mode = modeById(manager.autonomyMode);
    if (mode.level === 0) return toast("Der Elyon Manager ist ausgeschaltet.");
    if (state.running) return;
    const sequence = type === "operations" ? OPERATIONS_FLOW : PRODUCT_FLOW;
    const run = { id: `workflow-${Date.now()}`, workflowType: type, status: "running", mode: manager.autonomyMode, sequence, currentIndex: 0, history: [], blockers: [], warnings: [], estimatedCost: 0, createdAt: nowIso(), updatedAt: nowIso(), message: "Workflow wurde gestartet." };
    saveRun(run);
    state.running = true;
    await executeRun(run);
  }

  async function executeRun(run) {
    const settings = ensureSettings();
    const manager = settings.agents["elyon-manager"];
    const managerAutonomy = manager.autonomy || defaultAutonomy("elyon-manager");
    const mode = modeById(manager.autonomyMode);
    const oneStepOnly = mode.id === "semi";
    const managerOnly = ["manual", "assisted"].includes(mode.id);
    let executed = 0;
    try {
      while (run.currentIndex < run.sequence.length) {
        const fresh = getRun();
        if (!fresh || ["paused", "stopped"].includes(fresh.status)) break;
        run = fresh;
        const agentId = run.sequence[run.currentIndex];
        if (run.workflowType === "operations") {
          const hasOrders = collection(["elyonOrders", "ebayOrders", "elyonSales"]).length > 0;
          const hasSupport = collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]).length > 0;
          if ((agentId === "elyon-order-specialist" && !hasOrders) || (agentId === "elyon-customer-support-specialist" && !hasSupport)) {
            run.history.push({ agentId, status: "skipped", message: "Keine passenden Vorgänge vorhanden.", at: nowIso() });
            run.currentIndex += 1;
            run.updatedAt = nowIso();
            saveRun(run);
            continue;
          }
        }
        const agent = settings.agents[agentId];
        if (!agent || agent.autonomyMode === "off") {
          run.status = "blocked";
          run.blockers.push(`${agentById(agentId)?.name || agentId} ist ausgeschaltet.`);
          run.message = run.blockers.at(-1);
          saveRun(run);
          break;
        }
        if (run.currentIndex >= Number(managerAutonomy.workflow.maximumSteps || 8)) {
          run.status = "waiting_approval";
          run.message = "Das maximale Schrittlimit wurde erreicht.";
          saveRun(run);
          break;
        }
        const task = await runWithRecovery(agentId, agent.autonomy || defaultAutonomy(agentId), run.workflowType);
        const evaluation = evaluateTask(task, agent.autonomy || defaultAutonomy(agentId));
        run.history.push({ agentId, taskId: task?.id || null, status: taskStatus(task), decision: evaluation.decision, message: evaluation.reason, at: nowIso() });
        run.blockers.push(...(evaluation.blockers || []));
        run.warnings.push(...(evaluation.warnings || []));
        run.estimatedCost = Number(run.estimatedCost || 0) + (task?.provider === "local" ? 0 : 0.01);
        run.updatedAt = nowIso();
        executed += 1;
        if (run.estimatedCost > Number(managerAutonomy.budget.maximumCostPerWorkflow || 1.5)) {
          run.status = "waiting_approval";
          run.message = "Das Workflow-Kostenlimit wurde erreicht.";
          saveRun(run);
          break;
        }
        if (evaluation.decision === "block") {
          run.status = "blocked";
          run.message = evaluation.reason;
          saveRun(run);
          break;
        }
        if (evaluation.decision === "approval" || oneStepOnly || managerOnly) {
          run.currentIndex += 1;
          run.status = "waiting_approval";
          run.message = managerOnly ? "Der Elyon Manager hat den nächsten Schritt vorbereitet." : evaluation.reason;
          saveRun(run);
          break;
        }
        run.currentIndex += 1;
        run.message = evaluation.reason;
        saveRun(run);
        if (executed >= Number(managerAutonomy.workflow.maximumSteps || 8)) break;
      }
      if (run.currentIndex >= run.sequence.length && run.status === "running") {
        run.status = "completed";
        run.message = run.workflowType === "product" ? "Interner Produktworkflow vollständig abgeschlossen." : "Betriebsprüfung vollständig abgeschlossen.";
        run.completedAt = nowIso();
        saveRun(run);
        if (mode.id === "auto_external") await executeExternalActions(run);
      }
    } finally {
      state.running = false;
      render();
    }
  }

  async function runWithRecovery(agentId, autonomy, workflowType = "product") {
    const retries = autonomy.recovery.retryOnFailure ? Number(autonomy.recovery.maximumRetries || 0) : 0;
    let lastTask = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      lastTask = await runAgentAndCapture(agentId, workflowType);
      if (taskStatus(lastTask) !== "failed") return lastTask;
    }
    if (autonomy.recovery.pauseAfterRepeatedFailure) {
      const settings = ensureSettings();
      settings.agents[agentId].paused = true;
      writeJson(SETTINGS_KEY, settings);
    }
    return lastTask;
  }

  function pauseWorkflow() {
    const run = getRun();
    if (!run || run.status !== "running") return;
    run.status = "paused";
    run.message = "Workflow manuell pausiert.";
    run.updatedAt = nowIso();
    saveRun(run);
  }

  function stopWorkflow() {
    const run = getRun();
    if (!run) return;
    run.status = "stopped";
    run.message = "Workflow manuell gestoppt.";
    run.updatedAt = nowIso();
    saveRun(run);
    state.running = false;
  }

  async function resumeWorkflow() {
    const run = getRun();
    if (!run || !["paused", "waiting_approval"].includes(run.status) || state.running) return;
    run.status = "running";
    run.message = "Workflow wird fortgesetzt.";
    run.updatedAt = nowIso();
    saveRun(run);
    state.running = true;
    await executeRun(run);
  }

  async function executeExternalActions(run) {
    const settings = ensureSettings();
    const external = settings.dangerZone.externalAutomation;
    if (!external.unlocked) return;
    const enabled = EXTERNAL_ACTIONS.filter((action) => external.permissions[action.id]);
    if (!enabled.length) return toast("Externe Vollautomatik ist aktiv, aber keine externe Aktion wurde einzeln erlaubt.");
    for (const action of enabled) {
      const executor = executors.get(action.id) || discoverExecutor(action.id);
      if (typeof executor !== "function") {
        run.warnings.push(`${action.label}: Kein ausführender Connector verbunden.`);
        continue;
      }
      try {
        const result = await executor({ run, settings, product: currentProduct(), limits: external.limits });
        run.history.push({ agentId: "external", actionId: action.id, status: "completed", message: result?.message || `${action.label} ausgeführt.`, at: nowIso() });
      } catch (error) {
        run.blockers.push(`${action.label}: ${error?.message || "Ausführung fehlgeschlagen."}`);
        run.status = "blocked";
        run.message = run.blockers.at(-1);
        break;
      }
    }
    run.updatedAt = nowIso();
    saveRun(run);
  }

  function discoverExecutor(actionId) {
    if (actionId === "createEbayDraft") return window.ElyonSellerAutoLister?.createDraft || window.ElyonSellerSellingFlow?.createDraft || null;
    if (actionId === "publishListing") return window.ElyonSellerAutoLister?.publish || null;
    if (actionId === "updateLivePrice") return window.ElyonEbayListingSync?.updatePrice || null;
    if (actionId === "sendCustomerMessage") return window.ElyonCustomerSupport?.sendApprovedMessage || null;
    if (actionId === "placeSupplierOrder") return window.ElyonSupplierOrders?.placeApprovedOrder || null;
    if (actionId === "issueRefund") return window.ElyonOrderRefunds?.issueApprovedRefund || null;
    return null;
  }

  function openAutonomy(agentId) {
    const settings = ensureSettings();
    const agent = settings.agents[agentId];
    const definition = agentById(agentId);
    if (!agent || !definition) return;
    document.getElementById(AUTONOMY_MODAL_ID)?.remove();
    const autonomy = agent.autonomy || defaultAutonomy(agentId);
    const backdrop = document.createElement("div");
    backdrop.id = AUTONOMY_MODAL_ID;
    backdrop.className = "aiw-v3-modal";
    backdrop.innerHTML = `<aside class="aiw-v3-modal-panel"><div class="aiw-v3-modal-head"><div><h2>${definition.icon} ${escapeHtml(definition.name)} · Autonomie</h2><p>Arbeitsmodus, automatische Fortsetzung, Rechte, Fehlerbehandlung und Budget getrennt steuern.</p></div><button data-modal-close>✕</button></div><section class="aiw-v3-modal-section"><h3>Arbeitsmodus</h3><label class="aiw-v3-field"><span>Autonomiestufe</span><select data-auto-mode>${modeOptions(agent.autonomyMode, settings.dangerZone.externalAutomation.unlocked)}</select></label><div class="aiw-v3-warning" style="margin-top:9px">${escapeHtml(modeById(agent.autonomyMode).description)}</div></section><section class="aiw-v3-modal-section"><h3>Automatische Fortsetzung</h3><div class="aiw-v3-form-grid">${checkbox("workflow.startNextAgent", "Nächsten Fachagenten automatisch starten", autonomy.workflow.startNextAgent)}${checkbox("workflow.continueOnPass", "Nach bestandenem Ergebnis fortfahren", autonomy.workflow.continueOnPass)}${checkbox("workflow.continueOnWarning", "Bei Warnungen fortfahren", autonomy.workflow.continueOnWarning)}${checkbox("workflow.stopOnBlocker", "Bei Blockern stoppen", autonomy.workflow.stopOnBlocker)}${checkbox("workflow.stopOnLowConfidence", "Bei niedriger Konfidenz stoppen", autonomy.workflow.stopOnLowConfidence)}${numberField("workflow.confidenceThreshold", "Mindest-Konfidenz", autonomy.workflow.confidenceThreshold, 0, 1, .05)}${numberField("workflow.maximumSteps", "Maximale Schritte pro Lauf", autonomy.workflow.maximumSteps, 1, 20, 1)}${numberField("workflow.maximumParallelAgents", "Maximale parallele Agenten", autonomy.workflow.maximumParallelAgents, 1, 3, 1)}</div></section><section class="aiw-v3-modal-section"><h3>Interne Rechte</h3><div class="aiw-v3-form-grid">${checkbox("permissions.readData", "Daten lesen", autonomy.permissions.readData)}${checkbox("permissions.saveResults", "Ergebnisse speichern", autonomy.permissions.saveResults)}${checkbox("permissions.createTasks", "Aufgaben anlegen", autonomy.permissions.createTasks)}${checkbox("permissions.updateInternalDrafts", "Interne Entwürfe aktualisieren", autonomy.permissions.updateInternalDrafts)}${checkbox("permissions.updateInternalStatus", "Interne Status ändern", autonomy.permissions.updateInternalStatus)}${checkbox("permissions.startOtherAgents", "Andere Agenten starten", autonomy.permissions.startOtherAgents)}${checkbox("permissions.overwriteExistingResults", "Vorhandene Ergebnisse überschreiben", autonomy.permissions.overwriteExistingResults)}</div></section><section class="aiw-v3-modal-section"><h3>Fehler und Kosten</h3><div class="aiw-v3-form-grid">${checkbox("recovery.retryOnFailure", "Fehlgeschlagene Schritte wiederholen", autonomy.recovery.retryOnFailure)}${numberField("recovery.maximumRetries", "Maximale Wiederholungen", autonomy.recovery.maximumRetries, 0, 3, 1)}${checkbox("recovery.useFallbackProvider", "Alternativen Provider verwenden", autonomy.recovery.useFallbackProvider)}${checkbox("recovery.pauseAfterRepeatedFailure", "Nach wiederholtem Fehler pausieren", autonomy.recovery.pauseAfterRepeatedFailure)}${numberField("budget.maximumCostPerTask", "Maximales Budget je Aufgabe €", autonomy.budget.maximumCostPerTask, 0, 20, .05)}${numberField("budget.maximumCostPerWorkflow", "Maximales Workflow-Budget €", autonomy.budget.maximumCostPerWorkflow, 0, 100, .1)}${checkbox("budget.preferLowCostModel", "Günstiges Modell bevorzugen", autonomy.budget.preferLowCostModel)}${checkbox("budget.strongModelOnlyOnUncertainty", "Starkes Modell nur bei Unsicherheit", autonomy.budget.strongModelOnlyOnUncertainty)}</div></section><section class="aiw-v3-modal-section"><h3>Auslöser</h3><div class="aiw-v3-form-grid">${checkbox("triggers.onOpen", "Beim Öffnen prüfen", autonomy.triggers.onOpen)}${checkbox("triggers.onProductApproved", "Bei Produktfreigabe starten", autonomy.triggers.onProductApproved)}${checkbox("triggers.onDataChanged", "Bei Datenänderung erneut prüfen", autonomy.triggers.onDataChanged)}${checkbox("triggers.onNewOrder", "Bei neuer Bestellung starten", autonomy.triggers.onNewOrder)}${checkbox("triggers.onNewSupportCase", "Bei neuem Supportfall starten", autonomy.triggers.onNewSupportCase)}</div></section><div class="aiw-v3-modal-actions"><button data-modal-save>Speichern</button><button class="aiw-secondary" data-modal-close>Schließen</button></div></aside>`;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-modal-close]")) backdrop.remove();
      if (event.target.closest("[data-modal-save]")) {
        const selectedMode = backdrop.querySelector("[data-auto-mode]")?.value || agent.autonomyMode;
        if (selectedMode === "auto_external" && !settings.dangerZone.externalAutomation.unlocked) return openDangerZone();
        setMode(agentId, selectedMode);
        backdrop.querySelectorAll("[data-auto-path]").forEach((control) => updateAutonomy(agentId, control.dataset.autoPath, control.type === "checkbox" ? control.checked : Number(control.value)));
        backdrop.remove();
        toast(`${definition.name}: Autonomie gespeichert.`);
      }
    });
    document.body.appendChild(backdrop);
  }

  function checkbox(path, label, checked) {
    return `<label class="aiw-v3-check"><input type="checkbox" data-auto-path="${path}" ${checked ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`;
  }

  function numberField(path, label, value, min, max, step) {
    return `<label class="aiw-v3-field"><span>${escapeHtml(label)}</span><input type="number" data-auto-path="${path}" value="${escapeHtml(value)}" min="${min}" max="${max}" step="${step}"></label>`;
  }

  function openDangerZone() {
    const settings = ensureSettings();
    const external = settings.dangerZone.externalAutomation;
    document.getElementById(DANGER_MODAL_ID)?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = DANGER_MODAL_ID;
    backdrop.className = "aiw-v3-modal";
    backdrop.innerHTML = `<aside class="aiw-v3-modal-panel"><div class="aiw-v3-modal-head"><div><h2>⚠ Externe Vollautomatik</h2><p>Dieser Bereich ist getrennt von der internen Vollautomatik und standardmäßig vollständig gesperrt.</p></div><button data-danger-close>✕</button></div>${external.unlocked ? dangerPermissionsHtml(external) : `<section class="aiw-v3-modal-section"><div class="aiw-v3-danger"><strong>Wirkung der Entsperrung:</strong><br>Nur einzeln aktivierte Aktionen dürfen ausgeführt werden. Eine Aktion ohne verbundenen ausführenden Connector bleibt wirkungslos und wird als Hinweis protokolliert.</div><label class="aiw-v3-field" style="margin-top:12px"><span>Zum Entsperren exakt eingeben: <strong>${UNLOCK_PHRASE}</strong></span><input data-danger-phrase autocomplete="off" placeholder="Freigabephrase"></label></section><div class="aiw-v3-modal-actions"><button class="aiw-v3-danger-button" data-danger-unlock>Danger Zone entsperren</button><button class="aiw-secondary" data-danger-close>Abbrechen</button></div>`}</aside>`;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-danger-close]")) backdrop.remove();
      if (event.target.closest("[data-danger-unlock]")) {
        const phrase = backdrop.querySelector("[data-danger-phrase]")?.value || "";
        if (phrase !== UNLOCK_PHRASE) return toast("Freigabephrase stimmt nicht.");
        const next = ensureSettings();
        next.dangerZone.externalAutomation.unlocked = true;
        next.dangerZone.externalAutomation.unlockedAt = nowIso();
        next.dangerZone.externalAutomation.unlockedBy = "seller-user";
        writeJson(SETTINGS_KEY, next);
        backdrop.remove();
        openDangerZone();
      }
      if (event.target.closest("[data-danger-save]")) {
        const next = ensureSettings();
        backdrop.querySelectorAll("[data-external-permission]").forEach((control) => { next.dangerZone.externalAutomation.permissions[control.dataset.externalPermission] = control.checked; });
        next.dangerZone.externalAutomation.limits.maximumPriceChangePercent = Number(backdrop.querySelector('[data-external-limit="price"]')?.value || 0);
        next.dangerZone.externalAutomation.limits.maximumRefundEur = Number(backdrop.querySelector('[data-external-limit="refund"]')?.value || 0);
        next.dangerZone.externalAutomation.limits.maximumOrderEur = Number(backdrop.querySelector('[data-external-limit="order"]')?.value || 0);
        writeJson(SETTINGS_KEY, next);
        backdrop.remove();
        render();
      }
      if (event.target.closest("[data-danger-lock]")) {
        const next = ensureSettings();
        next.dangerZone.externalAutomation.unlocked = false;
        next.dangerZone.externalAutomation.permissions = Object.fromEntries(EXTERNAL_ACTIONS.map((action) => [action.id, false]));
        if (next.agents["elyon-manager"]?.autonomyMode === "auto_external") {
          next.agents["elyon-manager"].autonomyMode = "auto_internal";
          next.agents["elyon-manager"].autonomy.mode = "auto_internal";
          next.agents["elyon-manager"].autonomyLevel = 3;
        }
        writeJson(SETTINGS_KEY, next);
        backdrop.remove();
        render();
      }
    });
    document.body.appendChild(backdrop);
  }

  function dangerPermissionsHtml(external) {
    return `<section class="aiw-v3-modal-section"><div class="aiw-v3-danger"><strong>Danger Zone ist entsperrt.</strong><br>Aktiviere ausschließlich Aktionen, deren Folgen du bewusst vollautomatisch erlauben möchtest.</div><div class="aiw-v3-form-grid" style="margin-top:12px">${EXTERNAL_ACTIONS.map((action) => `<label class="aiw-v3-check"><input type="checkbox" data-external-permission="${action.id}" ${external.permissions[action.id] ? "checked" : ""}><span><strong>${escapeHtml(action.label)}</strong><br><small>${escapeHtml(action.description)}</small></span></label>`).join("")}</div></section><section class="aiw-v3-modal-section"><h3>Grenzen</h3><div class="aiw-v3-form-grid"><label class="aiw-v3-field"><span>Maximale Live-Preisänderung %</span><input type="number" data-external-limit="price" min="0" max="100" step=".5" value="${external.limits.maximumPriceChangePercent}"></label><label class="aiw-v3-field"><span>Maximale Erstattung €</span><input type="number" data-external-limit="refund" min="0" step=".5" value="${external.limits.maximumRefundEur}"></label><label class="aiw-v3-field"><span>Maximale Lieferantenbestellung €</span><input type="number" data-external-limit="order" min="0" step="1" value="${external.limits.maximumOrderEur}"></label></div></section><div class="aiw-v3-modal-actions"><button data-danger-save>Rechte speichern</button><button class="aiw-v3-danger-button" data-danger-lock>Danger Zone wieder sperren</button><button class="aiw-secondary" data-danger-close>Schließen</button></div>`;
  }

  function bindTriggers() {
    const trigger = (type, eventName) => window.addEventListener(eventName, () => {
      const settings = ensureSettings();
      const manager = settings.agents["elyon-manager"];
      if (modeById(manager.autonomyMode).level < 4 || state.running || Date.now() - state.lastAutoTriggerAt < 5000) return;
      const enabled = eventName === "elyon:product-approved" ? manager.autonomy.triggers.onProductApproved : manager.autonomy.triggers.onDataChanged;
      if (!enabled) return;
      state.lastAutoTriggerAt = Date.now();
      startWorkflow(type);
    });
    trigger("product", "elyon:product-approved");
    trigger("product", "elyon:product-updated");
    window.addEventListener("elyon:new-order", () => {
      const settings = ensureSettings();
      if (modeById(settings.agents["elyon-order-specialist"].autonomyMode).level >= 4) startWorkflow("operations");
    });
    window.addEventListener("elyon:return-created", () => {
      const settings = ensureSettings();
      if (modeById(settings.agents["elyon-customer-support-specialist"].autonomyMode).level >= 4) startWorkflow("operations");
    });
  }

  function registerExternalAction(actionId, executor) {
    if (!EXTERNAL_ACTIONS.some((action) => action.id === actionId) || typeof executor !== "function") return false;
    executors.set(actionId, executor);
    return true;
  }

  function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      render();
    });
  }

  function install() {
    ensureSettings();
    installStyles();
    render();
    bindTriggers();
    const observer = new MutationObserver(() => {
      const grid = document.getElementById("aiwAgentGrid");
      if (grid && !grid.querySelector(".aiw-v3")) queueRender();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRender);
    [100, 500, 1200].forEach((delay) => setTimeout(render, delay));
  }

  window.ElyonAIWorkforceWorkspaceV3 = { render, startWorkflow, pauseWorkflow, resumeWorkflow, stopWorkflow, openAutonomy, openDangerZone, registerExternalAction, settings: ensureSettings, run: getRun, modes: MODES };
  window.ElyonAIWorkforceExternalActions = { register: registerExternalAction, list: () => EXTERNAL_ACTIONS.map((action) => ({ ...action, connected: executors.has(action.id) || Boolean(discoverExecutor(action.id)) })) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
