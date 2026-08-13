(() => {
  "use strict";

  const TAB_ID = "virtualAgentsTab";
  const ROOT_ID = "virtualAgentsSettingsRoot";
  const MENU_ID = "mainMenu";
  const OPTION_LABEL = "9. Virtuelle Mitarbeiter / KI-Agenten";
  const STYLE_ID = "elyonVirtualAgentsPolicyStyles";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const INTEGRATION_KEY = "elyon_jarvis_integration_registry_v1";
  const PANEL_ID = "elyonAiWorkforceTeamV6Panel";
  const CONFIG_SECTION_ID = "elyonAgentResourceConfig";
  let requestedTab = "";
  let tabObserver = null;
  let menuObserver = null;
  let scheduled = false;
  let workforceObserver = null;

  const SKILL_TO_BACKEND = {
    "elyon-manager": "elyon-operations-manager",
    "elyon-product-data-specialist": "elyon-product-data-checker",
    "elyon-compliance-specialist": "elyon-compliance-guard",
    "elyon-profit-specialist": "elyon-profit-analyst",
    "elyon-listing-specialist": "elyon-listing-pro",
    "elyon-draft-quality-guard": "elyon-draft-quality-guard",
    "elyon-order-specialist": "elyon-order-coordinator",
    "elyon-customer-support-specialist": "elyon-support-assistant",
  };

  const FALLBACK_MODELS = [
    { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra", provider: "OpenRouter", tier: "FREE" },
    { id: "gpt-oss-20b-free", name: "GPT-OSS 20B", provider: "OpenRouter", tier: "FREE" },
    { id: "north-mini-code-free", name: "North Mini Code", provider: "OpenRouter", tier: "FREE" },
    { id: "lfm-2-5-2-6b-free", name: "LFM2.5-2.6B", provider: "OpenRouter", tier: "FREE" },
    { id: "nemotron-nano-12b-vl-free", name: "Nemotron Nano 12B VL", provider: "OpenRouter", tier: "FREE" },
    { id: "openrouter-free-router", name: "Free Models Router", provider: "OpenRouter", tier: "FREE" },
    { id: "nemotron-3-5-lightning-free", name: "Nemotron 3.5 Lightning", provider: "OpenRouter", tier: "FREE" },
    { id: "gemma-4-31b-free", name: "Gemma 4 31B", provider: "OpenRouter", tier: "FREE" },
  ];

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  function integrationRegistry() {
    const registry = readJson(INTEGRATION_KEY, {});
    return registry && typeof registry === "object" ? registry : {};
  }

  function availableModels() {
    const models = integrationRegistry().models;
    const active = Array.isArray(models) ? models.filter((model) => model?.enabled !== false) : [];
    return active.length ? active : FALLBACK_MODELS;
  }

  function availableProviders() {
    const apis = integrationRegistry().apis;
    const providers = Array.isArray(apis)
      ? apis.filter((api) => api?.enabled !== false && /AI|OpenRouter|OpenAI|DeepSeek|Model/i.test(`${api?.category || ""} ${api?.name || ""}`))
      : [];
    const normalized = providers.map((api) => ({
      id: text(api.id || api.name).toLowerCase(),
      name: text(api.name, api.id),
    }));
    const defaults = [
      { id: "openrouter", name: "OpenRouter · Integration Center" },
      { id: "openai", name: "OpenAI" },
      { id: "deepseek", name: "DeepSeek" },
      { id: "local", name: "Lokal" },
    ];
    defaults.forEach((item) => {
      if (!normalized.some((entry) => entry.id === item.id)) normalized.push(item);
    });
    return normalized;
  }

  function settingsRoot() {
    const settings = readJson(SETTINGS_KEY, {});
    settings.agents = settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    return settings;
  }

  function currentAgent(agentId) {
    const settings = settingsRoot();
    const current = settings.agents[agentId] && typeof settings.agents[agentId] === "object" ? settings.agents[agentId] : {};
    return {
      ...current,
      resourceProvider: text(current.resourceProvider || current.integrationProvider || current.provider, "openrouter").toLowerCase(),
      model: text(current.model),
      fallbackModel: text(current.fallbackModel, "openrouter-free-router"),
      allowFallback: current.allowFallback !== false,
      dailyLimit: Math.max(0, Number(current.dailyLimit ?? 0.25) || 0),
      memoryEnabled: current.memoryEnabled !== false,
      memoryWrite: current.memoryWrite === true,
      tools: {
        ebayRead: current.tools?.ebayRead !== false,
        cjRead: current.tools?.cjRead !== false,
        webResearch: current.tools?.webResearch !== false,
        productMasterRead: current.tools?.productMasterRead !== false,
        createDraft: current.tools?.createDraft === true,
        publishLive: false,
      },
    };
  }

  function updateAgent(agentId, patch = {}) {
    const settings = settingsRoot();
    const current = settings.agents[agentId] && typeof settings.agents[agentId] === "object" ? settings.agents[agentId] : {};
    const next = { ...current, ...patch };
    if (patch.tools) next.tools = { ...(current.tools || {}), ...patch.tools, publishLive: false };
    settings.agents[agentId] = next;
    writeJson(SETTINGS_KEY, settings);
    window.dispatchEvent(new CustomEvent("elyon:ai-agent-resource-settings-changed", { detail: { agentId, settings: next } }));
    return next;
  }

  function providerOptions(selected) {
    return availableProviders().map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? "selected" : ""}>${escapeHtml(provider.name)}</option>`).join("");
  }

  function modelOptions(selected, includeDefault = true) {
    const options = availableModels().map((model) => {
      const id = text(model.id || model.modelId || model.name);
      const name = text(model.name, id);
      const provider = text(model.provider, "OpenRouter");
      const tier = text(model.tier || model.pricingTier);
      return `<option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(name)} · ${escapeHtml(provider)}${tier ? ` · ${escapeHtml(tier)}` : ""}</option>`;
    }).join("");
    return `${includeDefault ? `<option value="" ${selected ? "" : "selected"}>Zentrale Vorgabe / Provider-Default</option>` : ""}${options}`;
  }

  function installStyleOverride() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TAB_ID}.active,#${TAB_ID}.active.elyon-role-hidden,#${TAB_ID}[hidden].active{display:block!important}
      .elyon-integration-field-note{display:block;margin-top:4px;color:#60a5fa;font-size:8px;line-height:1.35}
      .elyon-agent-resource-config{margin-top:14px;padding:14px;border-radius:14px;background:rgba(37,99,235,.06);border:1px solid rgba(96,165,250,.18)}
      .elyon-agent-resource-config h3{margin:0 0 5px;font-size:12px;color:#dbeafe}.elyon-agent-resource-config>p{margin:0 0 12px;color:#8194aa;font-size:9px;line-height:1.5}
      .elyon-agent-resource-skill{padding:12px 0;border-top:1px solid rgba(148,163,184,.1)}.elyon-agent-resource-skill:first-of-type{border-top:0;padding-top:0}
      .elyon-agent-resource-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:9px}.elyon-agent-resource-head strong{font-size:10px}.elyon-agent-resource-badge{font-size:8px;padding:4px 6px;border-radius:999px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.18);color:#bbf7d0}
      .elyon-agent-resource-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.elyon-agent-resource-grid label{display:grid;gap:4px;color:#9fb1c6;font-size:8px}.elyon-agent-resource-grid select,.elyon-agent-resource-grid input{margin:0!important;padding:8px 9px!important;border-radius:9px!important;font-size:9px!important}
      .elyon-agent-resource-checks{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}.elyon-agent-resource-checks label{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.025);color:#aebdce;font-size:8px}.elyon-agent-resource-checks input{margin:0;width:auto}.elyon-agent-resource-note{margin-top:9px;padding:8px 9px;border-radius:9px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);color:#d7c79a;font-size:8px;line-height:1.45}.elyon-agent-resource-save{margin-top:10px;padding:8px 10px!important;border-radius:9px!important;font-size:9px!important}
      .elyon-model-picker{width:100%;margin-top:4px!important;padding:8px 9px!important;border-radius:10px!important;font-size:12px!important}
      @media(max-width:640px){.elyon-agent-resource-grid,.elyon-agent-resource-checks{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function exposeTab() {
    const tab = document.getElementById(TAB_ID);
    if (!tab) return false;
    tab.classList.remove("elyon-role-hidden");
    tab.hidden = false;
    tab.removeAttribute("aria-hidden");
    tab.dataset.elyonModuleState = "active";
    return true;
  }

  function ensureMenuOption() {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return false;
    let option = [...menu.options].find((entry) => entry.value === TAB_ID);
    if (!option) {
      option = document.createElement("option");
      option.value = TAB_ID;
      option.textContent = OPTION_LABEL;
      const settingsOption = [...menu.options].find((entry) => entry.value === "settingsTab");
      if (settingsOption?.nextSibling) menu.insertBefore(option, settingsOption.nextSibling);
      else menu.appendChild(option);
    }
    if (requestedTab === TAB_ID) menu.value = TAB_ID;
    return true;
  }

  function syncRoleMetadata() {
    const registry = window.ElyonSellerModules;
    if (!registry) return;
    if (Array.isArray(registry.inactive)) registry.inactive = registry.inactive.filter((module) => module?.id !== TAB_ID);
    if (Array.isArray(registry.active) && !registry.active.some((module) => module?.id === TAB_ID)) {
      registry.active.push({ id: TAB_ID, label: "Virtuelle Mitarbeiter", role: "KI-Analysen, Entwürfe, Freigaben und sichere interne Aufgaben" });
    }
  }

  function patchLegacyCard(card) {
    if (!(card instanceof Element)) return;
    const agentId = text(card.dataset.agentId);
    if (!agentId) return;
    const current = currentAgent(agentId);
    const providerSelect = card.querySelector('[data-field="provider"]');
    if (providerSelect) {
      providerSelect.innerHTML = providerOptions(current.resourceProvider);
      providerSelect.value = current.resourceProvider;
      if (!providerSelect.dataset.integrationBound) {
        providerSelect.dataset.integrationBound = "1";
        providerSelect.addEventListener("change", (event) => {
          event.stopImmediatePropagation();
          const value = text(event.target.value).toLowerCase();
          if (value === "openrouter") updateAgent(agentId, { resourceProvider: "openrouter", integrationProvider: "openrouter" });
          else updateAgent(agentId, { resourceProvider: value, integrationProvider: "", provider: value });
          patchWorkforceCards();
        }, true);
      }
      const label = providerSelect.closest("label");
      if (label && !label.querySelector(".elyon-integration-field-note")) label.insertAdjacentHTML("beforeend", '<small class="elyon-integration-field-note">Provider aus dem Integration Center</small>');
    }

    const modelInput = card.querySelector('[data-field="model"]');
    if (modelInput && modelInput.tagName === "INPUT") {
      const picker = document.createElement("select");
      picker.className = "elyon-model-picker";
      picker.dataset.integrationModelPicker = agentId;
      picker.innerHTML = modelOptions(current.model);
      picker.value = current.model;
      picker.addEventListener("change", () => {
        updateAgent(agentId, { model: picker.value, resourceProvider: picker.value ? "openrouter" : current.resourceProvider, integrationProvider: picker.value ? "openrouter" : current.integrationProvider });
        patchWorkforceCards();
      });
      modelInput.hidden = true;
      modelInput.insertAdjacentElement("afterend", picker);
      const label = modelInput.closest("label");
      if (label && !label.querySelector(".elyon-integration-field-note")) label.insertAdjacentHTML("beforeend", '<small class="elyon-integration-field-note">Aktive Modelle aus Jarvis Integration Center</small>');
    } else if (!card.querySelector(`[data-integration-model-picker="${CSS.escape(agentId)}"]`)) {
      const existing = card.querySelector(`[data-integration-model-picker="${CSS.escape(agentId)}"]`);
      if (existing) existing.value = current.model;
    }
  }

  function patchWorkforceCards() {
    document.querySelectorAll("#aiwAgentGrid .aiw-card[data-agent-id]").forEach(patchLegacyCard);
  }

  function renderResourceSkill(skillId) {
    const backendId = SKILL_TO_BACKEND[skillId] || skillId;
    const current = currentAgent(backendId);
    const skillLabel = document.querySelector(`[data-v6-skill-settings="${CSS.escape(skillId)}"]`)?.closest(".aiw-v6-skill-row")?.querySelector("strong")?.textContent || skillId;
    return `<div class="elyon-agent-resource-skill" data-agent-resource="${escapeHtml(backendId)}">
      <div class="elyon-agent-resource-head"><strong>${escapeHtml(skillLabel)}</strong><span class="elyon-agent-resource-badge">Integration Center</span></div>
      <div class="elyon-agent-resource-grid">
        <label>Provider<select data-resource-field="provider">${providerOptions(current.resourceProvider)}</select></label>
        <label>Primäres Modell<select data-resource-field="model">${modelOptions(current.model)}</select></label>
        <label>Fallback-Modell<select data-resource-field="fallbackModel"><option value="">Kein spezieller Fallback</option>${modelOptions(current.fallbackModel, false)}</select></label>
        <label>Tageslimit €<input data-resource-field="dailyLimit" type="number" min="0" step="0.05" value="${current.dailyLimit.toFixed(2)}"></label>
        <label>Fallback erlauben<select data-resource-field="allowFallback"><option value="true" ${current.allowFallback ? "selected" : ""}>Ja</option><option value="false" ${!current.allowFallback ? "selected" : ""}>Nein</option></select></label>
      </div>
      <div class="elyon-agent-resource-checks">
        <label><input type="checkbox" data-resource-tool="ebayRead" ${current.tools.ebayRead ? "checked" : ""}> eBay lesen</label>
        <label><input type="checkbox" data-resource-tool="cjRead" ${current.tools.cjRead ? "checked" : ""}> CJ lesen</label>
        <label><input type="checkbox" data-resource-tool="webResearch" ${current.tools.webResearch ? "checked" : ""}> Web-Recherche</label>
        <label><input type="checkbox" data-resource-tool="productMasterRead" ${current.tools.productMasterRead ? "checked" : ""}> Product Master lesen</label>
        <label><input type="checkbox" data-resource-tool="memoryEnabled" ${current.memoryEnabled ? "checked" : ""}> Memory lesen</label>
        <label><input type="checkbox" data-resource-tool="memoryWrite" ${current.memoryWrite ? "checked" : ""}> Erfahrungen speichern</label>
        <label><input type="checkbox" data-resource-tool="createDraft" ${current.tools.createDraft ? "checked" : ""}> eBay-Entwurf vorbereiten</label>
        <label title="Live-Publishing bleibt systemweit gesperrt"><input type="checkbox" disabled> eBay live veröffentlichen</label>
      </div>
      <div class="elyon-agent-resource-note">Diese Auswahl kommt aus dem Jarvis Integration Center. Live-Publishing bleibt systemweit gesperrt.</div>
      <button type="button" class="aiw-secondary elyon-agent-resource-save" data-resource-save="${escapeHtml(backendId)}">KI, Tools & Memory speichern</button>
    </div>`;
  }

  function enhanceDetailsPanel() {
    const panel = document.getElementById(PANEL_ID);
    const inner = panel?.querySelector(".aiw-v6-panel-inner");
    if (!inner) return false;
    inner.querySelector(`#${CONFIG_SECTION_ID}`)?.remove();
    const skillButtons = [...inner.querySelectorAll("[data-v6-skill-settings]")];
    if (!skillButtons.length) return false;
    const section = document.createElement("section");
    section.id = CONFIG_SECTION_ID;
    section.className = "elyon-agent-resource-config";
    section.innerHTML = `<h3>KI-Modelle, Tools & Memory</h3><p>Die Einstellungen sind jetzt direkt mit dem Jarvis Integration Center verbunden.</p>${skillButtons.map((button) => renderResourceSkill(button.dataset.v6SkillSettings)).join("")}`;
    const activity = [...inner.querySelectorAll(".aiw-v6-section")].find((node) => /Letzte Aktivität/i.test(node.querySelector("h3")?.textContent || ""));
    if (activity) inner.insertBefore(section, activity); else inner.appendChild(section);
    return true;
  }

  function saveResourceSection(button) {
    const block = button.closest("[data-agent-resource]");
    if (!block) return;
    const agentId = text(block.dataset.agentResource);
    const field = (name) => block.querySelector(`[data-resource-field="${name}"]`);
    const tool = (name) => block.querySelector(`[data-resource-tool="${name}"]`);
    const provider = text(field("provider")?.value, "openrouter").toLowerCase();
    updateAgent(agentId, {
      resourceProvider: provider,
      integrationProvider: provider === "openrouter" ? "openrouter" : "",
      provider: provider === "openrouter" ? currentAgent(agentId).provider : provider,
      model: text(field("model")?.value),
      fallbackModel: text(field("fallbackModel")?.value),
      allowFallback: field("allowFallback")?.value !== "false",
      dailyLimit: Math.max(0, Number(field("dailyLimit")?.value) || 0),
      memoryEnabled: tool("memoryEnabled")?.checked !== false,
      memoryWrite: tool("memoryWrite")?.checked === true,
      tools: {
        ebayRead: tool("ebayRead")?.checked !== false,
        cjRead: tool("cjRead")?.checked !== false,
        webResearch: tool("webResearch")?.checked !== false,
        productMasterRead: tool("productMasterRead")?.checked !== false,
        createDraft: tool("createDraft")?.checked === true,
        publishLive: false,
      },
    });
    button.textContent = "✓ Gespeichert";
    patchWorkforceCards();
    window.setTimeout(() => { if (button.isConnected) button.textContent = "KI, Tools & Memory speichern"; }, 1400);
  }

  function installAgentConfigBridge() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const save = target?.closest("[data-resource-save]");
      if (save) {
        event.preventDefault();
        saveResourceSection(save);
        return;
      }
      const details = target?.closest("[data-v6-details]");
      if (details) [0, 20, 80, 180].forEach((delay) => window.setTimeout(enhanceDetailsPanel, delay));
    }, true);

    window.addEventListener("elyon:ai-workforce-team-v6-rendered", () => {
      patchWorkforceCards();
      window.setTimeout(enhanceDetailsPanel, 30);
    });
    window.addEventListener("storage", (event) => {
      if (event.key === INTEGRATION_KEY || event.key === SETTINGS_KEY) {
        patchWorkforceCards();
        if (document.getElementById(PANEL_ID)) enhanceDetailsPanel();
      }
    });

    if (!workforceObserver) {
      workforceObserver = new MutationObserver(() => {
        patchWorkforceCards();
        if (document.getElementById(PANEL_ID)) enhanceDetailsPanel();
      });
      workforceObserver.observe(document.body, { childList: true, subtree: true });
    }
    [100, 500, 1200, 2400].forEach((delay) => window.setTimeout(patchWorkforceCards, delay));
  }

  function showDedicatedTab() {
    const tab = document.getElementById(TAB_ID);
    if (!tab) return false;
    document.querySelectorAll(".tab").forEach((node) => node.classList.remove("active"));
    exposeTab();
    tab.classList.add("active");
    tab.scrollIntoView?.({ block: "start", behavior: "smooth" });
    window.ElyonAIWorkforceMountFix?.refresh?.();
    window.ElyonAIWorkforce?.mount?.();
    window.setTimeout(patchWorkforceCards, 40);
    return true;
  }

  function activate() {
    scheduled = false;
    installStyleOverride();
    exposeTab();
    ensureMenuOption();
    syncRoleMetadata();
    if (requestedTab === TAB_ID) showDedicatedTab();
  }

  function scheduleActivate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(activate);
  }

  function observePolicyRewrites() {
    const tab = document.getElementById(TAB_ID);
    const menu = document.getElementById(MENU_ID);
    if (tab && !tabObserver) {
      tabObserver = new MutationObserver(scheduleActivate);
      tabObserver.observe(tab, { attributes: true, attributeFilter: ["class", "hidden", "aria-hidden"] });
    }
    if (menu && !menuObserver) {
      menuObserver = new MutationObserver(scheduleActivate);
      menuObserver.observe(menu, { childList: true });
    }
    window.setTimeout(() => {
      tabObserver?.disconnect();
      menuObserver?.disconnect();
      tabObserver = null;
      menuObserver = null;
      activate();
    }, 2600);
  }

  function install() {
    activate();
    observePolicyRewrites();
    installAgentConfigBridge();

    document.addEventListener("change", (event) => {
      if (event.target?.id !== MENU_ID) return;
      requestedTab = event.target.value === TAB_ID ? TAB_ID : "";
      if (requestedTab) window.setTimeout(showDedicatedTab, 0);
    }, true);

    [100, 650, 1750, 2400].forEach((delay) => window.setTimeout(activate, delay));
    window.addEventListener("elyon:tab-changed", (event) => {
      if (event.detail?.tabId === TAB_ID || event.detail === TAB_ID) {
        requestedTab = TAB_ID;
        scheduleActivate();
      }
    });

    window.ElyonVirtualAgentsPolicy = {
      activate,
      show: () => {
        requestedTab = TAB_ID;
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.value = TAB_ID;
        activate();
      },
      root: () => document.getElementById(ROOT_ID),
      enhanceAgentDetails: enhanceDetailsPanel,
      refreshIntegrationOptions: patchWorkforceCards,
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
