(() => {
  "use strict";

  const BUILDER_ID = "elyonAiAgentBuilderModal";
  const REGISTRY_KEY = "elyon_jarvis_integration_registry_v1";
  const CUSTOM_KEY = "elyon_ai_custom_agents_v1";
  const STYLE_ID = "elyonAiAgentBuilderIntegrationStyles";
  const FALLBACK_ATTR = "data-integration-fallback-model";

  const DEFAULT_MODELS = [
    { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra", provider: "OpenRouter", tier: "FREE" },
    { id: "gpt-oss-20b-free", name: "GPT-OSS 20B", provider: "OpenRouter", tier: "FREE" },
    { id: "north-mini-code-free", name: "North Mini Code", provider: "OpenRouter", tier: "FREE" },
    { id: "lfm-2-5-2-6b-free", name: "LFM2.5-2.6B", provider: "OpenRouter", tier: "FREE" },
    { id: "nemotron-nano-12b-vl-free", name: "Nemotron Nano 12B VL", provider: "OpenRouter", tier: "FREE" },
    { id: "openrouter-free-router", name: "OpenRouter Free Models Router", provider: "OpenRouter", tier: "FREE" },
    { id: "nemotron-3-5-lightning-free", name: "Nemotron 3.5 Lightning", provider: "OpenRouter", tier: "FREE" },
    { id: "gemma-4-31b-free", name: "Gemma 4 31B", provider: "OpenRouter", tier: "FREE" },
  ];

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed === null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  function models() {
    const registry = readJson(REGISTRY_KEY, {});
    const list = Array.isArray(registry?.models) ? registry.models.filter((model) => model?.enabled !== false) : [];
    return list.length ? list : DEFAULT_MODELS;
  }

  function openRouterModels() {
    return models().filter((model) => text(model.provider).toLowerCase() === "openrouter");
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUILDER_ID} .aiw-builder-check{display:flex!important;grid-template-columns:none!important;align-items:flex-start!important;gap:9px!important;min-width:0!important}
      #${BUILDER_ID} .aiw-builder-check input[type="checkbox"]{width:18px!important;height:18px!important;min-width:18px!important;margin:1px 0 0!important;padding:0!important;appearance:auto!important;-webkit-appearance:checkbox!important;accent-color:#2563eb!important}
      #${BUILDER_ID} .aiw-builder-check span{display:block!important;min-width:0!important;line-height:1.4!important;overflow-wrap:anywhere!important}
      #${BUILDER_ID} .elyon-builder-integration-note{grid-column:1/-1;padding:9px 10px;border-radius:10px;background:rgba(37,99,235,.08);border:1px solid rgba(96,165,250,.16);color:#9fb7d5;font-size:9px;line-height:1.45}
      #${BUILDER_ID} .elyon-builder-model-select{width:100%}
      @media(max-width:760px){#${BUILDER_ID} .aiw-builder-check{width:100%!important;padding:10px!important}#${BUILDER_ID} .aiw-builder-check input[type="checkbox"]{transform:none!important}}
    `;
    document.head.appendChild(style);
  }

  function optionMarkup(selected = "") {
    const list = openRouterModels();
    return `<option value="">Zentrale Vorgabe / Auto-Routing</option>${list.map((model) => {
      const id = text(model.modelId || model.runtimeModel || model.providerModel || model.id || model.name);
      const name = text(model.name, id);
      const tier = text(model.tier || model.pricingTier);
      return `<option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(name)}${tier ? ` · ${escapeHtml(tier)}` : ""}</option>`;
    }).filter(Boolean).join("")}`;
  }

  function replaceModelControl(root, provider) {
    const current = root.querySelector('[data-builder-field="model"]');
    if (!current) return;
    const label = current.closest(".aiw-builder-field");
    if (!label) return;
    const value = text(current.value);

    if (provider === "openrouter") {
      if (current.tagName === "SELECT" && current.dataset.integrationCenter === "1") {
        current.innerHTML = optionMarkup(value);
        current.value = value;
        return;
      }
      const select = document.createElement("select");
      select.dataset.builderField = "model";
      select.dataset.integrationCenter = "1";
      select.className = "elyon-builder-model-select";
      select.innerHTML = optionMarkup(value);
      select.value = value;
      current.replaceWith(select);
    } else if (current.tagName === "SELECT") {
      const input = document.createElement("input");
      input.dataset.builderField = "model";
      input.value = value;
      input.placeholder = "zentrale Vorgabe";
      current.replaceWith(input);
    }
  }

  function ensureFallbackField(root) {
    const provider = root.querySelector('[data-builder-field="provider"]');
    const modelField = root.querySelector('[data-builder-field="model"]');
    const modelLabel = modelField?.closest(".aiw-builder-field");
    if (!provider || !modelLabel) return;

    let fallback = root.querySelector(`[${FALLBACK_ATTR}]`);
    if (provider.value !== "openrouter") {
      fallback?.remove();
      return;
    }

    if (!fallback) {
      fallback = document.createElement("label");
      fallback.className = "aiw-builder-field";
      fallback.setAttribute(FALLBACK_ATTR, "1");
      fallback.innerHTML = '<span>Fallback-Modell</span><select data-integration-fallback-select class="elyon-builder-model-select"></select>';
      modelLabel.insertAdjacentElement("afterend", fallback);
    }

    const currentAgent = currentAgentByForm(root);
    const selected = text(currentAgent?.fallbackModel, "openrouter/free");
    const select = fallback.querySelector("[data-integration-fallback-select]");
    if (select) {
      select.innerHTML = `<option value="">Kein spezieller Fallback</option>${optionMarkup(selected).replace('<option value="">Zentrale Vorgabe / Auto-Routing</option>', '')}`;
      select.value = selected;
    }
  }

  function currentAgentByForm(root) {
    const name = text(root.querySelector('[data-builder-field="name"]')?.value);
    const list = readJson(CUSTOM_KEY, []);
    return Array.isArray(list) ? list.find((agent) => text(agent?.name) === name) || null : null;
  }

  function ensureIntegrationNote(root) {
    const grid = root.querySelector('[data-builder-tab="autonomy"] .aiw-builder-grid');
    if (!grid || grid.querySelector(".elyon-builder-integration-note")) return;
    const note = document.createElement("div");
    note.className = "elyon-builder-integration-note";
    note.innerHTML = '<strong>Jarvis Integration Center:</strong> Bei OpenRouter stammen Primär- und Fallback-Modell direkt aus den dort aktivierten Modellen.';
    grid.appendChild(note);
  }

  function enhance(root = document.getElementById(BUILDER_ID)) {
    if (!root) return false;
    installStyles();
    const provider = root.querySelector('[data-builder-field="provider"]');
    if (!provider) return false;

    if (![...provider.options].some((option) => option.value === "openrouter")) {
      const option = document.createElement("option");
      option.value = "openrouter";
      option.textContent = "OpenRouter · Integration Center";
      provider.insertBefore(option, provider.firstChild);
    }

    provider.dataset.integrationCenter = "1";
    replaceModelControl(root, provider.value);
    ensureFallbackField(root);
    ensureIntegrationNote(root);

    if (provider.dataset.integrationBound !== "1") {
      provider.dataset.integrationBound = "1";
      provider.addEventListener("change", () => {
        replaceModelControl(root, provider.value);
        ensureFallbackField(root);
      });
    }
    return true;
  }

  function persistFallbackAfterSave(root) {
    const provider = text(root.querySelector('[data-builder-field="provider"]')?.value);
    if (provider !== "openrouter") return;
    const fallbackModel = text(root.querySelector("[data-integration-fallback-select]")?.value);
    const name = text(root.querySelector('[data-builder-field="name"]')?.value);
    if (!name) return;

    setTimeout(() => {
      const current = readJson(CUSTOM_KEY, []);
      if (!Array.isArray(current)) return;
      let candidate = null;
      for (const agent of current) {
        if (text(agent?.name) === name && (!candidate || text(agent.updatedAt) > text(candidate.updatedAt))) candidate = agent;
      }
      if (!candidate) return;
      candidate.provider = "openrouter";
      candidate.fallbackModel = fallbackModel;
      writeJson(CUSTOM_KEY, current);
      window.dispatchEvent(new CustomEvent("elyon:ai-custom-agent-integration-changed", { detail: { agentId: candidate.id } }));
    }, 0);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-builder-save]")) {
      const root = target.closest(`#${BUILDER_ID}`);
      if (root) persistFallbackAfterSave(root);
    }
    if (target.closest("[data-agent-builder-create],[data-custom-create],[data-custom-edit],[data-v6-create-custom],[data-v6-custom-edit]")) {
      [0, 30, 100].forEach((delay) => setTimeout(() => enhance(), delay));
    }
  }, true);

  const observer = new MutationObserver(() => {
    const root = document.getElementById(BUILDER_ID);
    if (root) enhance(root);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("elyon:jarvis-integration-registry-changed", () => enhance());
  window.ElyonAIWorkforceBuilderIntegration = { refresh: enhance, models: openRouterModels };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => enhance(), { once: true });
  else enhance();
})();