(() => {
  "use strict";

  const ROOT_ID = "elyonAiWorkforceRoutingCenter";
  const STYLE_ID = "elyonAiWorkforceRoutingCenterStyles";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const REGISTRY_KEY = "elyon_jarvis_integration_registry_v1";
  const COOKIE_NAME = "elyon_ai_routing_v1";

  const BACKEND = {
    "elyon-manager": "elyon-operations-manager",
    "elyon-product-data-specialist": "elyon-product-data-checker",
    "elyon-compliance-specialist": "elyon-compliance-guard",
    "elyon-profit-specialist": "elyon-profit-analyst",
    "elyon-listing-specialist": "elyon-listing-pro",
    "elyon-draft-quality-guard": "elyon-draft-quality-guard",
    "elyon-order-specialist": "elyon-order-coordinator",
    "elyon-customer-support-specialist": "elyon-support-assistant",
  };

  const BACKEND_DEFAULT_PROVIDER = {
    "elyon-operations-manager": "deepseek",
    "elyon-product-data-checker": "deepseek",
    "elyon-compliance-guard": "deepseek",
    "elyon-profit-analyst": "openai",
    "elyon-listing-pro": "deepseek",
    "elyon-order-coordinator": "deepseek",
    "elyon-support-assistant": "openai",
  };

  const OPENROUTER_FALLBACK_MODELS = {
    "nemotron-3-ultra-free": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "gpt-oss-20b-free": "openai/gpt-oss-20b:free",
    "north-mini-code-free": "cohere/north-mini-code:free",
    "gemma-4-31b-free": "google/gemma-4-31b-it:free",
    "openrouter-free-router": "openrouter/free",
  };

  const AGENTS = {
    "elyon-manager": { name: "Elyon Manager", icon: "🧠" },
    "elyon-product-data-specialist": { name: "Product Data Specialist", icon: "🧩" },
    "elyon-compliance-specialist": { name: "Compliance Guard", icon: "🛡️" },
    "elyon-profit-specialist": { name: "Profit Analyst", icon: "📊" },
    "elyon-listing-specialist": { name: "Listing Specialist", icon: "✍️" },
    "elyon-draft-quality-guard": { name: "Draft Quality Guard", icon: "🔎", deterministic: true },
    "elyon-order-specialist": { name: "Order Coordinator", icon: "📦" },
    "elyon-customer-support-specialist": { name: "Customer Support", icon: "💬" },
  };

  const GROUPS = [
    { name: "Geschäftsleitung", agents: ["elyon-manager"] },
    { name: "Product Manager", agents: ["elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist"] },
    { name: "Listing Manager", agents: ["elyon-listing-specialist", "elyon-draft-quality-guard"] },
    { name: "Operations Manager", agents: ["elyon-order-specialist"] },
    { name: "Customer Care", agents: ["elyon-customer-support-specialist"] },
  ];

  const MODE_LABELS = {
    off: "Aus",
    manual: "Manuell",
    assisted: "Assistiert",
    semi: "Teilautomatisch",
    auto_internal: "Vollautomatisch intern",
    auto_external: "Vollautomatisch extern",
  };

  const state = { queued: false };
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const esc = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

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

  function registry() {
    try {
      const live = window.ElyonJarvisIntegrationCenter?.getRegistry?.();
      if (live && typeof live === "object") return live;
    } catch {}
    const stored = readJson(REGISTRY_KEY, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function settings() {
    const value = readJson(SETTINGS_KEY, {});
    return value && typeof value === "object" ? value : {};
  }

  function backendId(agentId) {
    return BACKEND[agentId] || agentId;
  }

  function mergedAgentSettings(agentId) {
    const data = settings();
    const agents = data.agents && typeof data.agents === "object" ? data.agents : {};
    const backend = agents[backendId(agentId)] && typeof agents[backendId(agentId)] === "object" ? agents[backendId(agentId)] : {};
    const visible = agents[agentId] && typeof agents[agentId] === "object" ? agents[agentId] : {};
    return { ...backend, ...visible };
  }

  function inferProvider(agent) {
    const explicit = text(agent.resourceProvider || agent.integrationProvider).toLowerCase();
    if (["openrouter", "openai", "deepseek", "local"].includes(explicit)) return explicit;
    if (text(agent.model).includes("/")) return "openrouter";
    const provider = text(agent.provider).toLowerCase();
    return ["openai", "deepseek", "local"].includes(provider) ? provider : "openrouter";
  }

  function routeFor(agentId) {
    const agent = mergedAgentSettings(agentId);
    return {
      provider: inferProvider(agent),
      model: text(agent.model),
      allowFallback: agent.allowFallback !== false && agent.autonomy?.recovery?.useFallbackProvider !== false,
      autonomy: text(agent.autonomyMode || agent.autonomy?.mode || (agentId === "elyon-manager" ? "auto_internal" : "manual")),
    };
  }

  function providerDefinitions() {
    const enabledApis = Array.isArray(registry().apis) ? registry().apis.filter((item) => item?.enabled !== false) : [];
    const out = [];
    enabledApis.forEach((item) => {
      const id = text(item.id || item.name).toLowerCase();
      if (!["openrouter", "openai", "deepseek"].includes(id) || out.some((entry) => entry.id === id)) return;
      out.push({ id, label: text(item.name, id) });
    });
    if (!out.some((item) => item.id === "openrouter")) out.unshift({ id: "openrouter", label: "OpenRouter" });
    if (!out.some((item) => item.id === "openai")) out.push({ id: "openai", label: "OpenAI" });
    if (!out.some((item) => item.id === "deepseek")) out.push({ id: "deepseek", label: "DeepSeek" });
    out.push({ id: "local", label: "Lokal" });
    return out;
  }

  function isChatRuntime(model) {
    const kind = text(model?.kind).toLowerCase();
    if (kind && !["chat", "router"].includes(kind)) return false;
    const role = text(model?.role).toLowerCase();
    if (/embed|rerank|memory embed|memory rerank/.test(role)) return false;
    const caps = Array.isArray(model?.capabilities) ? model.capabilities.map((item) => text(item).toLowerCase()) : [];
    if (caps.includes("embeddings") || caps.includes("rerank")) return false;
    return true;
  }

  function openRouterModels(currentModel = "") {
    const source = Array.isArray(window.ElyonOpenRouterModelCatalog?.models)
      ? window.ElyonOpenRouterModelCatalog.models
      : Array.isArray(registry().models) ? registry().models : [];
    const out = source
      .filter((model) => model?.enabled !== false && text(model.provider).toLowerCase() === "openrouter" && isChatRuntime(model))
      .map((model) => ({
        value: text(model.modelId || model.runtimeModel || model.providerModel || OPENROUTER_FALLBACK_MODELS[model.id]),
        label: `${text(model.name, model.id)}${model.tier ? ` · ${text(model.tier)}` : ""}`,
      }))
      .filter((model) => model.value);
    if (!out.some((model) => model.value === "openrouter/free")) out.unshift({ value: "openrouter/free", label: "Free Models Router · FREE" });
    if (currentModel && !out.some((model) => model.value === currentModel)) out.push({ value: currentModel, label: `${currentModel} · bestehende Auswahl` });
    return out;
  }

  function providerModels(provider, currentModel = "") {
    if (provider === "openrouter") return openRouterModels(currentModel);
    if (provider === "local") return [{ value: "", label: "Lokaler Fallback" }];
    const guard = window.ElyonAiProviderModelGuard?.providers?.[provider];
    const out = Array.isArray(guard?.models)
      ? guard.models.map((item) => ({ value: text(item.value), label: text(item.label, item.value) }))
      : [];
    if (!out.length) out.push({ value: "", label: "Provider-Default" });
    if (currentModel && !out.some((item) => item.value === currentModel)) out.push({ value: currentModel, label: `${currentModel} · bestehende Auswahl` });
    return out;
  }

  function optionMarkup(items, selected) {
    return items.map((item) => `<option value="${esc(item.value ?? item.id)}" ${(item.value ?? item.id) === selected ? "selected" : ""}>${esc(item.label)}</option>`).join("");
  }

  function saveRoute(agentId, patch) {
    if (AGENTS[agentId]?.deterministic) return false;
    const data = settings();
    data.agents = data.agents && typeof data.agents === "object" ? { ...data.agents } : {};
    const backend = backendId(agentId);
    const visibleCurrent = data.agents[agentId] && typeof data.agents[agentId] === "object" ? data.agents[agentId] : {};
    const backendCurrent = data.agents[backend] && typeof data.agents[backend] === "object" ? data.agents[backend] : {};
    const provider = ["openrouter", "openai", "deepseek", "local"].includes(text(patch.provider).toLowerCase()) ? text(patch.provider).toLowerCase() : inferProvider({ ...backendCurrent, ...visibleCurrent });
    const model = provider === "local" ? "" : text(patch.model);
    const allowFallback = patch.allowFallback !== false;
    const compatibilityProvider = provider === "openrouter"
      ? (["openai", "deepseek", "local"].includes(text(backendCurrent.provider).toLowerCase()) ? text(backendCurrent.provider).toLowerCase() : BACKEND_DEFAULT_PROVIDER[backend] || "openai")
      : provider;
    const routingPatch = {
      resourceProvider: provider,
      integrationProvider: provider === "openrouter" ? "openrouter" : "",
      provider: compatibilityProvider,
      model,
      allowFallback,
    };
    data.agents[agentId] = { ...visibleCurrent, ...routingPatch };
    data.agents[backend] = { ...backendCurrent, ...routingPatch };
    if (!writeJson(SETTINGS_KEY, data)) return false;
    syncServerRouting();
    window.dispatchEvent(new CustomEvent("elyon:ai-agent-resource-settings-changed", { detail: { agentId, backendId: backend, provider, model, allowFallback } }));
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-routing-updated", { detail: { agentId, backendId: backend, provider, model, allowFallback } }));
    queueRender();
    return true;
  }

  function serverRoutingPayload() {
    const agents = {};
    Object.keys(AGENTS).forEach((agentId) => {
      if (AGENTS[agentId].deterministic) return;
      const route = routeFor(agentId);
      agents[backendId(agentId)] = {
        provider: route.provider,
        model: route.model,
        allowFallback: route.allowFallback,
      };
    });
    return { version: 1, agents };
  }

  function syncServerRouting() {
    try {
      const value = encodeURIComponent(JSON.stringify(serverRoutingPayload()));
      document.cookie = `${COOKIE_NAME}=${value}; Path=/; SameSite=Lax; Max-Age=31536000`;
      return true;
    } catch {
      return false;
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{margin:0 0 18px;padding:16px;border:1px solid rgba(79,140,255,.22);border-radius:15px;background:linear-gradient(145deg,rgba(20,29,40,.96),rgba(13,20,29,.96));color:#eef3f8}
      .aiw-route-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.aiw-route-head h3{margin:0!important;font-size:15px!important}.aiw-route-head p{margin:5px 0 0!important;color:#8492a3!important;font-size:9px!important;line-height:1.5!important}.aiw-route-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.aiw-route-badge{padding:5px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#9fb0c3;font-size:8px;white-space:nowrap}.aiw-route-groups{display:grid;gap:10px;margin-top:14px}.aiw-route-group{border:1px solid rgba(255,255,255,.065);border-radius:11px;background:rgba(255,255,255,.018);overflow:hidden}.aiw-route-group h4{margin:0!important;padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.055);color:#cbd5e1;font-size:9px!important}.aiw-route-row{display:grid;grid-template-columns:minmax(180px,1.1fr) minmax(130px,.75fr) minmax(220px,1.4fr) auto auto;gap:8px;align-items:center;padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.045)}.aiw-route-row:last-child{border-bottom:0}.aiw-route-agent{display:flex;gap:8px;align-items:center;min-width:0}.aiw-route-agent span:first-child{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:rgba(79,140,255,.08)}.aiw-route-agent strong{display:block;font-size:9px}.aiw-route-agent small{display:block;margin-top:2px;color:#68788b;font-size:7px}.aiw-route-field{display:grid;gap:3px}.aiw-route-field span{color:#68788b;font-size:7px}.aiw-route-field select{width:100%;min-height:31px;margin:0;padding:5px 7px;border-radius:8px;background:#0b1119;border:1px solid rgba(255,255,255,.09);color:#dce5ef;font-size:8px}.aiw-route-fallback{display:flex;align-items:center;gap:5px;color:#8492a3;font-size:8px;white-space:nowrap}.aiw-route-fallback input{width:auto;margin:0}.aiw-route-auto{min-height:31px!important;padding:5px 8px!important;font-size:8px!important;white-space:nowrap}.aiw-route-deterministic{grid-column:2/-1;color:#7f8ea0;font-size:8px}.aiw-route-foot{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:10px;color:#68788b;font-size:8px}.aiw-route-link{background:transparent!important;border:0!important;color:#8fb7ff!important;padding:0!important;font-size:8px!important}
      @media(max-width:980px){.aiw-route-row{grid-template-columns:1fr 1fr}.aiw-route-agent{grid-column:1/-1}.aiw-route-deterministic{grid-column:1/-1}}@media(max-width:620px){.aiw-route-head{display:grid}.aiw-route-badges{justify-content:flex-start}.aiw-route-row{grid-template-columns:1fr}.aiw-route-agent,.aiw-route-deterministic{grid-column:1}.aiw-route-fallback{padding:4px 0}}
    `;
    document.head.appendChild(style);
  }

  function autonomyLabel(agentId) {
    const value = routeFor(agentId).autonomy;
    return MODE_LABELS[value] || value || "Manuell";
  }

  function rowMarkup(agentId) {
    const meta = AGENTS[agentId];
    if (!meta) return "";
    if (meta.deterministic) {
      return `<div class="aiw-route-row" data-routing-agent="${agentId}"><div class="aiw-route-agent"><span>${meta.icon}</span><div><strong>${esc(meta.name)}</strong><small>${esc(autonomyLabel(agentId))}</small></div></div><div class="aiw-route-deterministic">Deterministische Qualitätsprüfung · kein KI-Provider und kein Sprachmodell erforderlich.</div></div>`;
    }
    const route = routeFor(agentId);
    const models = providerModels(route.provider, route.model);
    const selectedModel = models.some((item) => item.value === route.model) ? route.model : models[0]?.value || "";
    return `<div class="aiw-route-row" data-routing-agent="${agentId}"><div class="aiw-route-agent"><span>${meta.icon}</span><div><strong>${esc(meta.name)}</strong><small>Autonomie: ${esc(autonomyLabel(agentId))}</small></div></div><label class="aiw-route-field"><span>Provider</span><select data-routing-provider>${optionMarkup(providerDefinitions(), route.provider)}</select></label><label class="aiw-route-field"><span>Modell</span><select data-routing-model>${optionMarkup(models, selectedModel)}</select></label><label class="aiw-route-fallback"><input type="checkbox" data-routing-fallback ${route.allowFallback ? "checked" : ""}> Fallback</label><button class="aiw-secondary aiw-route-auto" data-routing-autonomy>Autonomie</button></div>`;
  }

  function countOpenRouterModels() {
    return openRouterModels().filter((item) => item.value !== "openrouter/free").length;
  }

  function markup() {
    return `<div class="aiw-route-head"><div><h3>⚙ KI-Modelle & Autonomie</h3><p>Zentrale Modellzuweisung für deine virtuellen Mitarbeiter. Änderungen gelten für den sichtbaren Mitarbeiter, den technischen Backend-Agenten und echte Agentenläufe.</p></div><div class="aiw-route-badges"><span class="aiw-route-badge">7 KI-Routen</span><span class="aiw-route-badge">${countOpenRouterModels()} OpenRouter-Modelle</span><span class="aiw-route-badge">Server verbunden</span></div></div><div class="aiw-route-groups">${GROUPS.map((group) => `<section class="aiw-route-group"><h4>${esc(group.name)}</h4>${group.agents.map(rowMarkup).join("")}</section>`).join("")}</div><div class="aiw-route-foot"><span>Draft Quality Guard bleibt deterministisch. Sicherheits- und Freigaberegeln werden durch die Modellwahl nicht verändert.</span><button class="aiw-route-link" data-routing-refresh>Modelle neu einlesen</button></div>`;
  }

  function ensureRoot() {
    const workforce = document.getElementById("elyonAiWorkforce");
    if (!workforce) return null;
    let root = document.getElementById(ROOT_ID);
    if (root && workforce.contains(root)) return root;
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.dataset.elyonWorkforceRoutingCenter = "true";
    const team = workforce.querySelector(".aiw-v6-team");
    if (team?.parentElement) team.insertAdjacentElement("beforebegin", root);
    else workforce.appendChild(root);
    bindRoot(root);
    return root;
  }

  function render() {
    installStyles();
    const root = ensureRoot();
    if (!root) return false;
    root.innerHTML = markup();
    syncServerRouting();
    return true;
  }

  function queueRender() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(() => {
      state.queued = false;
      render();
    });
  }

  function saveFromRow(row) {
    const agentId = text(row?.dataset.routingAgent);
    if (!agentId || AGENTS[agentId]?.deterministic) return;
    const provider = text(row.querySelector("[data-routing-provider]")?.value, routeFor(agentId).provider);
    const model = text(row.querySelector("[data-routing-model]")?.value);
    const allowFallback = row.querySelector("[data-routing-fallback]")?.checked !== false;
    saveRoute(agentId, { provider, model, allowFallback });
  }

  function openAutonomy(agentId) {
    const workspace = window.ElyonAIWorkforceWorkspaceV3;
    if (!workspace || typeof workspace.openAutonomy !== "function") return false;
    workspace.openAutonomy(agentId);
    queueMicrotask(() => window.ElyonAIWorkforceWorkspaceV3Policy?.decorateAutonomy?.(agentId));
    return true;
  }

  function bindRoot(root) {
    if (root.dataset.routingBound === "1") return;
    root.dataset.routingBound = "1";
    root.addEventListener("change", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest("[data-routing-agent]");
      if (!row) return;
      if (target.matches("[data-routing-provider]")) {
        const provider = text(target.value);
        const modelSelect = row.querySelector("[data-routing-model]");
        const models = providerModels(provider, "");
        if (modelSelect) modelSelect.innerHTML = optionMarkup(models, models[0]?.value || "");
      }
      saveFromRow(row);
    });
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const row = target.closest("[data-routing-agent]");
      if (target.closest("[data-routing-autonomy]") && row) {
        event.preventDefault();
        openAutonomy(text(row.dataset.routingAgent));
        return;
      }
      if (target.closest("[data-routing-refresh]")) {
        event.preventDefault();
        window.ElyonOpenRouterModelCatalog?.sync?.();
        queueRender();
      }
    });
  }

  function install() {
    installStyles();
    syncServerRouting();
    queueRender();
    window.addEventListener("elyon:ai-workforce-team-v6-rendered", queueRender);
    window.addEventListener("elyon:ai-agent-resource-settings-changed", queueRender);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") queueRender();
    });
    window.addEventListener("elyon:tab-changed", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab" || event.detail?.id === "virtualAgentsTab") queueRender();
    });
    window.addEventListener("storage", (event) => {
      if ([SETTINGS_KEY, REGISTRY_KEY].includes(event.key)) queueRender();
    });
  }

  window.ElyonAIWorkforceRoutingCenter = {
    render: queueRender,
    getRoute: routeFor,
    saveRoute,
    listModels: providerModels,
    syncServerRouting,
    openAutonomy,
    groups: GROUPS,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
