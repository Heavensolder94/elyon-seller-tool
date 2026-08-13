(() => {
  "use strict";

  const TAB_ID = "virtualAgentsTab";
  const ROOT_ID = "virtualAgentsSettingsRoot";
  const MENU_ID = "mainMenu";
  const OPTION_LABEL = "9. Virtuelle Mitarbeiter / KI-Agenten";
  const STYLE_ID = "elyonVirtualAgentsPolicyStyles";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const INTEGRATION_KEY = "elyon_jarvis_integration_registry_v1";
  const CONFIG_SECTION_ID = "elyonAgentResourceConfig";
  let requestedTab = "";
  let tabObserver = null;
  let menuObserver = null;
  let scheduled = false;

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

  const DEFAULT_MODELS = [
    { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra", provider: "openrouter", tier: "FREE" },
    { id: "gpt-oss-20b-free", name: "GPT-OSS 20B", provider: "openrouter", tier: "FREE" },
    { id: "north-mini-code-free", name: "North Mini Code", provider: "openrouter", tier: "FREE" },
    { id: "lfm-2-5-2-6b-free", name: "LFM2.5-2.6B", provider: "openrouter", tier: "FREE" },
    { id: "nemotron-nano-12b-vl-free", name: "Nemotron Nano 12B VL", provider: "openrouter", tier: "FREE" },
    { id: "openrouter-free-router", name: "OpenRouter Free Models Router", provider: "openrouter", tier: "FREE" },
  ];

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

  function availableModels() {
    const registry = readJson(INTEGRATION_KEY, {});
    const models = Array.isArray(registry?.models) ? registry.models.filter((model) => model?.enabled !== false) : [];
    return models.length ? models : DEFAULT_MODELS;
  }

  function backendSetting(agentId) {
    const settings = readJson(SETTINGS_KEY, {});
    const agents = settings?.agents && typeof settings.agents === "object" ? settings.agents : {};
    const current = agents[agentId] && typeof agents[agentId] === "object" ? agents[agentId] : {};
    return {
      provider: text(current.provider, "openrouter"),
      model: text(current.model),
      fallbackModel: text(current.fallbackModel, "openrouter-free-router"),
      allowFallback: current.allowFallback !== false,
      dailyLimit: Number(current.dailyLimit ?? 0.25) || 0,
      autonomyLevel: Number(current.autonomyLevel ?? 1) || 0,
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

  function saveBackendSetting(agentId, values) {
    const settings = readJson(SETTINGS_KEY, {});
    settings.agents = settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    const current = settings.agents[agentId] && typeof settings.agents[agentId] === "object" ? settings.agents[agentId] : {};
    settings.agents[agentId] = {
      ...current,
      provider: text(values.provider, current.provider || "openrouter"),
      model: text(values.model),
      fallbackModel: text(values.fallbackModel, "openrouter-free-router"),
      allowFallback: values.allowFallback !== false,
      dailyLimit: Math.max(0, Number(values.dailyLimit) || 0),
      memoryEnabled: values.memoryEnabled !== false,
      memoryWrite: values.memoryWrite === true,
      tools: {
        ...(current.tools || {}),
        ebayRead: values.tools?.ebayRead !== false,
        cjRead: values.tools?.cjRead !== false,
        webResearch: values.tools?.webResearch !== false,
        productMasterRead: values.tools?.productMasterRead !== false,
        createDraft: values.tools?.createDraft === true,
        publishLive: false,
      },
    };
    writeJson(SETTINGS_KEY, settings);
    window.dispatchEvent(new CustomEvent("elyon:ai-agent-resource-settings-changed", { detail: { agentId } }));
  }

  function installStyleOverride() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TAB_ID}.active,
      #${TAB_ID}.active.elyon-role-hidden,
      #${TAB_ID}[hidden].active {
        display: block !important;
      }
      .elyon-agent-resource-config{margin-top:14px;padding:14px;border-radius:14px;background:rgba(37,99,235,.06);border:1px solid rgba(96,165,250,.18)}
      .elyon-agent-resource-config h3{margin:0 0 5px;font-size:12px;color:#dbeafe}.elyon-agent-resource-config>p{margin:0 0 12px;color:#8194aa;font-size:9px;line-height:1.5}
      .elyon-agent-resource-skill{padding:12px 0;border-top:1px solid rgba(148,163,184,.1)}.elyon-agent-resource-skill:first-of-type{border-top:0;padding-top:0}
      .elyon-agent-resource-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:9px}.elyon-agent-resource-head strong{font-size:10px}.elyon-agent-resource-badge{font-size:8px;padding:4px 6px;border-radius:999px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.18);color:#bbf7d0}
      .elyon-agent-resource-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.elyon-agent-resource-grid label{display:grid;gap:4px;color:#9fb1c6;font-size:8px}.elyon-agent-resource-grid select,.elyon-agent-resource-grid input{margin:0!important;padding:8px 9px!important;border-radius:9px!important;font-size:9px!important}
      .elyon-agent-resource-checks{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}.elyon-agent-resource-checks label{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.025);color:#aebdce;font-size:8px}.elyon-agent-resource-checks input{margin:0;width:auto}.elyon-agent-resource-note{margin-top:9px;padding:8px 9px;border-radius:9px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);color:#d7c79a;font-size:8px;line-height:1.45}.elyon-agent-resource-save{margin-top:10px;padding:8px 10px!important;border-radius:9px!important;font-size:9px!important}
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
    if (Array.isArray(registry.inactive)) {
      registry.inactive = registry.inactive.filter((module) => module?.id !== TAB_ID);
    }
    if (Array.isArray(registry.active) && !registry.active.some((module) => module?.id === TAB_ID)) {
      registry.active.push({
        id: TAB_ID,
        label: "Virtuelle Mitarbeiter",
        role: "KI-Analysen, Entwürfe, Freigaben und sichere interne Aufgaben",
      });
    }
  }

  function modelOptions(selected) {
    return availableModels().map((model) => {
      const id = text(model.id || model.modelId || model.name);
      const name = text(model.name, id);
      const provider = text(model.provider, "OpenRouter");
      const tier = text(model.tier || model.pricingTier, "");
      return `<option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(name)} · ${escapeHtml(provider)}${tier ? ` · ${escapeHtml(tier)}` : ""}</option>`;
    }).join("");
  }

  function renderResourceSkill(skillId) {
    const backendId = SKILL_TO_BACKEND[skillId] || skillId;
    const current = backendSetting(backendId);
    const skillLabel = document.querySelector(`[data-v6-skill-settings="${CSS.escape(skillId)}"]`)?.closest(".aiw-v6-skill-row")?.querySelector("strong")?.textContent || skillId;
    return `<div class="elyon-agent-resource-skill" data-agent-resource="${escapeHtml(backendId)}">
      <div class="elyon-agent-resource-head"><strong>${escapeHtml(skillLabel)}</strong><span class="elyon-agent-resource-badge">KI & Tools</span></div>
      <div class="elyon-agent-resource-grid">
        <label>Primäres Modell<select data-resource-field="model"><option value="">Zentrale Vorgabe / Provider-Default</option>${modelOptions(current.model)}</select></label>
        <label>Fallback<select data-resource-field="fallbackModel"><option value="">Kein spezieller Fallback</option>${modelOptions(current.fallbackModel)}</select></label>
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
      <div class="elyon-agent-resource-note">Die Modell- und Tool-Konfiguration wird direkt am bestehenden Mitarbeiter gespeichert. Live-Publishing bleibt unabhängig von dieser Einstellung gesperrt.</div>
      <button type="button" class="aiw-secondary elyon-agent-resource-save" data-resource-save="${escapeHtml(backendId)}">KI & Tools speichern</button>
    </div>`;
  }

  function enhanceDetailsPanel() {
    const panel = document.getElementById("elyonAiWorkforceTeamV6Panel");
    const inner = panel?.querySelector(".aiw-v6-panel-inner");
    if (!inner || inner.querySelector(`#${CONFIG_SECTION_ID}`)) return false;
    const skillButtons = [...inner.querySelectorAll("[data-v6-skill-settings]")];
    if (!skillButtons.length) return false;
    const section = document.createElement("section");
    section.id = CONFIG_SECTION_ID;
    section.className = "elyon-agent-resource-config";
    section.innerHTML = `<h3>KI-Modelle, Tools & Memory</h3><p>Hier stellst du die vorhandenen technischen Skills dieses Mitarbeiters ein. Die Modellliste kommt aus dem Jarvis Integration Center.</p>${skillButtons.map((button) => renderResourceSkill(button.dataset.v6SkillSettings)).join("")}`;
    const activity = [...inner.querySelectorAll(".aiw-v6-section")].find((node) => /Letzte Aktivität/i.test(node.querySelector("h3")?.textContent || ""));
    if (activity) inner.insertBefore(section, activity);
    else inner.appendChild(section);
    return true;
  }

  function saveResourceSection(button) {
    const block = button.closest("[data-agent-resource]");
    if (!block) return;
    const agentId = block.dataset.agentResource;
    const field = (name) => block.querySelector(`[data-resource-field="${name}"]`);
    const tool = (name) => block.querySelector(`[data-resource-tool="${name}"]`);
    saveBackendSetting(agentId, {
      provider: "openrouter",
      model: field("model")?.value || "",
      fallbackModel: field("fallbackModel")?.value || "",
      dailyLimit: field("dailyLimit")?.value || 0,
      allowFallback: field("allowFallback")?.value !== "false",
      memoryEnabled: tool("memoryEnabled")?.checked !== false,
      memoryWrite: tool("memoryWrite")?.checked === true,
      tools: {
        ebayRead: tool("ebayRead")?.checked !== false,
        cjRead: tool("cjRead")?.checked !== false,
        webResearch: tool("webResearch")?.checked !== false,
        productMasterRead: tool("productMasterRead")?.checked !== false,
        createDraft: tool("createDraft")?.checked === true,
      },
    });
    button.textContent = "✓ Gespeichert";
    window.setTimeout(() => { if (button.isConnected) button.textContent = "KI & Tools speichern"; }, 1400);
  }

  function installAgentConfigBridge() {
    document.addEventListener("click", (event) => {
      const save = event.target instanceof Element ? event.target.closest("[data-resource-save]") : null;
      if (save) {
        event.preventDefault();
        saveResourceSection(save);
        return;
      }
      const details = event.target instanceof Element ? event.target.closest("[data-v6-details]") : null;
      if (details) [0, 25, 90].forEach((delay) => window.setTimeout(enhanceDetailsPanel, delay));
    }, true);
    window.addEventListener("elyon:ai-workforce-team-v6-rendered", () => window.setTimeout(enhanceDetailsPanel, 40));
    const observer = new MutationObserver(() => {
      if (document.getElementById("elyonAiWorkforceTeamV6Panel")) enhanceDetailsPanel();
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
