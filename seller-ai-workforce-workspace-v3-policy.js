(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const REGISTRY_KEY = "elyon_jarvis_integration_registry_v1";
  const AUTONOMY_MODAL_ID = "elyonAiWorkforceAutonomyV3Modal";

  const BACKEND_AGENT_IDS = {
    "elyon-manager": "elyon-operations-manager",
    "elyon-product-data-specialist": "elyon-product-data-checker",
    "elyon-compliance-specialist": "elyon-compliance-guard",
    "elyon-profit-specialist": "elyon-profit-analyst",
    "elyon-listing-specialist": "elyon-listing-pro",
    "elyon-draft-quality-guard": "elyon-draft-quality-guard",
    "elyon-order-specialist": "elyon-order-coordinator",
    "elyon-customer-support-specialist": "elyon-support-assistant",
  };

  const OPENROUTER_RUNTIME_MODELS = {
    "nemotron-3-ultra-free": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "gpt-oss-20b-free": "openai/gpt-oss-20b:free",
    "north-mini-code-free": "cohere/north-mini-code:free",
    "openrouter-free-router": "openrouter/free",
    "gemma-4-31b-free": "google/gemma-4-31b-it:free",
  };

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

  function modeLevel(mode) {
    return { off: 0, manual: 1, assisted: 2, semi: 3, auto_internal: 4, auto_external: 5 }[mode] || 0;
  }

  function normalizeManagerTask(task) {
    if (!task || task.agentId !== "elyon-manager" || task.result?.status !== "manualReviewRequired") return false;
    const settings = readJson(SETTINGS_KEY, {});
    const manager = settings.agents?.["elyon-manager"] || {};
    if (modeLevel(manager.autonomyMode || manager.autonomy?.mode) < 4) return false;
    const blockers = Array.isArray(task.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    if (blockers.length) return false;
    const warnings = Array.isArray(task.result?.warnings) ? task.result.warnings.filter(Boolean) : [];
    const list = readJson(TASKS_KEY, []);
    if (!Array.isArray(list)) return false;
    const index = list.findIndex((entry) => entry?.id === task.id);
    if (index < 0) return false;
    list[index] = {
      ...list[index],
      result: {
        ...list[index].result,
        status: warnings.length ? "warning" : "passed",
        generatedContent: {
          ...(list[index].result?.generatedContent || {}),
          automaticContinuationApproved: true,
        },
      },
    };
    localStorage.setItem(TASKS_KEY, JSON.stringify(list));
    return true;
  }

  function integrationRegistry() {
    try {
      const live = window.ElyonJarvisIntegrationCenter?.getRegistry?.();
      if (live && typeof live === "object") return live;
    } catch {}
    const stored = readJson(REGISTRY_KEY, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function currentAgent(agentId) {
    const settings = readJson(SETTINGS_KEY, {});
    const backendId = BACKEND_AGENT_IDS[agentId] || agentId;
    const direct = settings.agents?.[agentId] && typeof settings.agents[agentId] === "object" ? settings.agents[agentId] : {};
    const backend = settings.agents?.[backendId] && typeof settings.agents[backendId] === "object" ? settings.agents[backendId] : {};
    return { ...backend, ...direct };
  }

  function providerDefinitions(currentProvider = "") {
    const registry = integrationRegistry();
    const activeApis = Array.isArray(registry.apis) ? registry.apis.filter((api) => api?.enabled !== false) : [];
    const definitions = [];
    activeApis.forEach((api) => {
      const id = text(api.id || api.name).toLowerCase();
      if (!["openrouter", "openai", "deepseek"].includes(id)) return;
      if (!definitions.some((entry) => entry.id === id)) definitions.push({ id, label: text(api.name, id) });
    });
    if (!definitions.some((entry) => entry.id === "openrouter")) definitions.unshift({ id: "openrouter", label: "OpenRouter" });
    if (currentProvider && !definitions.some((entry) => entry.id === currentProvider) && ["openai", "deepseek"].includes(currentProvider)) {
      definitions.push({ id: currentProvider, label: currentProvider === "openai" ? "OpenAI" : "DeepSeek" });
    }
    definitions.push({ id: "local", label: "Lokal" });
    return definitions;
  }

  function openRouterModels(currentModel = "") {
    const registry = integrationRegistry();
    const models = Array.isArray(registry.models) ? registry.models : [];
    const result = models
      .filter((model) => {
        if (model?.enabled === false || text(model.provider).toLowerCase() !== "openrouter") return false;
        const kind = text(model.kind).toLowerCase();
        return !kind || kind === "chat" || kind === "router";
      })
      .map((model) => ({
        value: text(model.modelId || model.runtimeModel || model.providerModel || OPENROUTER_RUNTIME_MODELS[model.id]),
        label: `${text(model.name, model.id)}${model.tier ? ` · ${text(model.tier)}` : ""}${model.role ? ` · ${text(model.role)}` : ""}`,
      }))
      .filter((model) => model.value);
    if (currentModel && !result.some((entry) => entry.value === currentModel) && currentModel.includes("/")) {
      result.push({ value: currentModel, label: `${currentModel} · bestehende Auswahl` });
    }
    return result;
  }

  function directProviderModels(provider, currentModel = "") {
    const guard = window.ElyonAiProviderModelGuard?.providers?.[provider];
    const models = Array.isArray(guard?.models) ? guard.models.map((entry) => ({ value: text(entry.value), label: text(entry.label, entry.value) })) : [];
    if (!models.length) models.push({ value: "", label: "Provider-Default" });
    if (currentModel && !models.some((entry) => entry.value === currentModel) && !currentModel.includes("/")) {
      models.push({ value: currentModel, label: `${currentModel} · bestehende Auswahl` });
    }
    return models;
  }

  function modelDefinitions(provider, currentModel = "") {
    if (provider === "openrouter") return openRouterModels(currentModel);
    if (provider === "local") return [{ value: "local", label: "Lokaler Fallback" }];
    return directProviderModels(provider, currentModel);
  }

  function inferredProvider(agent) {
    const resourceProvider = text(agent.resourceProvider || agent.integrationProvider).toLowerCase();
    if (["openrouter", "openai", "deepseek", "local"].includes(resourceProvider)) return resourceProvider;
    if (text(agent.model).includes("/")) return "openrouter";
    const provider = text(agent.provider).toLowerCase();
    return ["openai", "deepseek", "local"].includes(provider) ? provider : "openrouter";
  }

  function optionsHtml(definitions, selected) {
    return definitions.map((entry) => `<option value="${escapeHtml(entry.value ?? entry.id)}" ${(entry.value ?? entry.id) === selected ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("");
  }

  function persistRouting(agentId, provider, model) {
    const settings = readJson(SETTINGS_KEY, {});
    settings.agents = settings.agents && typeof settings.agents === "object" ? { ...settings.agents } : {};
    const backendId = BACKEND_AGENT_IDS[agentId] || agentId;
    const aliasCurrent = settings.agents[agentId] && typeof settings.agents[agentId] === "object" ? settings.agents[agentId] : {};
    const backendCurrent = settings.agents[backendId] && typeof settings.agents[backendId] === "object" ? settings.agents[backendId] : {};
    const fallbackEnabled = aliasCurrent.autonomy?.recovery?.useFallbackProvider !== false;
    const executionProvider = provider === "openrouter"
      ? (["openai", "deepseek", "local"].includes(text(backendCurrent.provider).toLowerCase()) ? text(backendCurrent.provider).toLowerCase() : "openai")
      : provider;
    const patch = {
      resourceProvider: provider,
      integrationProvider: provider === "openrouter" ? "openrouter" : "",
      provider: executionProvider,
      model,
      allowFallback: fallbackEnabled,
    };
    settings.agents[agentId] = { ...aliasCurrent, ...patch };
    settings.agents[backendId] = { ...backendCurrent, ...patch };
    writeJson(SETTINGS_KEY, settings);
    window.dispatchEvent(new CustomEvent("elyon:ai-agent-resource-settings-changed", { detail: { agentId, backendId, provider, model } }));
  }

  function decorateAutonomy(agentId) {
    const backdrop = document.getElementById(AUTONOMY_MODAL_ID);
    const panel = backdrop?.querySelector(".aiw-v3-modal-panel");
    if (!backdrop || !panel || panel.querySelector("[data-elyon-model-routing]")) return false;
    const agent = currentAgent(agentId);
    const provider = inferredProvider(agent);
    const currentModel = provider === "local" ? "local" : text(agent.model);
    const providers = providerDefinitions(provider);
    const models = modelDefinitions(provider, currentModel);
    const section = document.createElement("section");
    section.className = "aiw-v3-modal-section";
    section.dataset.elyonModelRouting = "true";
    const registryModels = Array.isArray(integrationRegistry().models) ? integrationRegistry().models : [];
    const unavailableCount = registryModels.filter((item) => {
      if (item?.enabled === false || text(item.provider).toLowerCase() !== "openrouter") return false;
      const kind = text(item.kind).toLowerCase();
      const wrongKind = Boolean(kind) && kind !== "chat" && kind !== "router";
      const missingRuntime = !text(item.modelId || item.runtimeModel || item.providerModel || OPENROUTER_RUNTIME_MODELS[item.id]);
      return wrongKind || missingRuntime;
    }).length;
    section.innerHTML = `<h3>KI-Provider & Modell</h3><div class="aiw-v3-form-grid"><label class="aiw-v3-field"><span>Provider</span><select data-elyon-agent-provider>${optionsHtml(providers, provider)}</select></label><label class="aiw-v3-field"><span>Primäres Modell</span><select data-elyon-agent-model>${optionsHtml(models, currentModel || models[0]?.value || "")}</select></label></div><div class="aiw-v3-warning" style="margin-top:9px">Quelle: Jarvis Integration Center. Bei OpenRouter nutzt „Alternativen Provider verwenden“ zuerst den Free Models Router.${unavailableCount ? ` ${unavailableCount} aktive Spezial-/Legacy-Modelle sind nicht als Chat-Runtime auswählbar.` : ""}</div>`;
    const firstSection = panel.querySelector(".aiw-v3-modal-section");
    firstSection?.insertAdjacentElement("afterend", section);

    const providerSelect = section.querySelector("[data-elyon-agent-provider]");
    const modelSelect = section.querySelector("[data-elyon-agent-model]");
    providerSelect?.addEventListener("change", () => {
      const nextModels = modelDefinitions(providerSelect.value, "");
      modelSelect.innerHTML = optionsHtml(nextModels, nextModels[0]?.value || "");
    });
    backdrop.addEventListener("click", (event) => {
      if (!event.target.closest("[data-modal-save]")) return;
      persistRouting(agentId, text(providerSelect?.value, provider), text(modelSelect?.value));
    });
    return true;
  }

  function installAutonomyBridge() {
    const workspace = window.ElyonAIWorkforceWorkspaceV3;
    if (workspace && typeof workspace.openAutonomy === "function" && workspace.openAutonomy.__elyonModelRoutingWrapped !== true) {
      const original = workspace.openAutonomy.bind(workspace);
      const wrapped = (agentId) => {
        const result = original(agentId);
        decorateAutonomy(agentId);
        return result;
      };
      wrapped.__elyonModelRoutingWrapped = true;
      workspace.openAutonomy = wrapped;
    }
    if (document.documentElement.dataset.elyonAutonomyModelRoutingBound === "1") return;
    document.documentElement.dataset.elyonAutonomyModelRoutingBound = "1";
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const agentButton = target.closest("[data-agent-autonomy]");
      if (agentButton) queueMicrotask(() => decorateAutonomy(agentButton.dataset.agentAutonomy));
      const managerButton = target.closest('[data-v3-action="autonomy-manager"]');
      if (managerButton) queueMicrotask(() => decorateAutonomy("elyon-manager"));
    });
  }

  window.addEventListener("elyon:ai-workforce-v2-task-updated", (event) => {
    if (normalizeManagerTask(event.detail)) {
      window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v3-manager-normalized", { detail: { taskId: event.detail.id } }));
    }
  });

  installAutonomyBridge();
  window.addEventListener("elyon:runtime-group-loaded", (event) => {
    if (event.detail?.tabId === "virtualAgentsTab") installAutonomyBridge();
  });

  window.ElyonAIWorkforceWorkspaceV3Policy = { normalizeManagerTask, decorateAutonomy, integrationRegistry };
})();