(() => {
  "use strict";

  const SETTINGS_KEY = "elyonSettings";
  const PROVIDER_SELECT_ID = "setAiProvider";
  const MODEL_SELECT_ID = "setAiModel";
  const DASHBOARD_ID = "aiDashboardModal";
  const PROVIDERS = {
    deepseek: {
      label: "DeepSeek",
      defaultModel: "deepseek-v4-flash",
      models: [
        { value: "deepseek-v4-flash", label: "DeepSeek v4 flash" },
        { value: "deepseek-v4-pro", label: "DeepSeek v4 pro" },
      ],
    },
    openai: {
      label: "OpenAI",
      defaultModel: "gpt-4o-mini",
      models: [
        { value: "gpt-4o-mini", label: "GPT-4o mini" },
        { value: "gpt-4o", label: "GPT-4o" },
      ],
    },
    qwen: {
      label: "Qwen",
      defaultModel: "qwen-flash",
      models: [
        { value: "qwen-flash", label: "Qwen Flash" },
        { value: "qwen-plus", label: "Qwen Plus" },
        { value: "qwen-max", label: "Qwen Max" },
      ],
    },
    local: {
      label: "Lokal",
      defaultModel: "local",
      models: [{ value: "local", label: "Lokales Modell" }],
    },
  };

  let scheduled = false;
  let observer = null;
  let lastCorrection = null;

  const text = (value) => String(value ?? "").trim();

  function readStoredSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function readRuntimeSettings() {
    const stored = readStoredSettings();
    try {
      if (typeof appSettings !== "undefined" && appSettings && typeof appSettings === "object") {
        return { ...stored, ...appSettings };
      }
    } catch {}
    return stored;
  }

  function normalizeProvider(value) {
    const provider = text(value).toLocaleLowerCase("de-DE");
    return Object.prototype.hasOwnProperty.call(PROVIDERS, provider) ? provider : "openai";
  }

  function modelDefinition(provider, model) {
    return PROVIDERS[provider].models.find((entry) => entry.value === model) || null;
  }

  function normalizePair(providerValue, modelValue) {
    const provider = normalizeProvider(providerValue);
    const requestedModel = text(modelValue);
    const validModel = modelDefinition(provider, requestedModel);
    return {
      provider,
      model: validModel ? validModel.value : PROVIDERS[provider].defaultModel,
      corrected: provider !== text(providerValue).toLocaleLowerCase("de-DE") || !validModel,
      previousProvider: text(providerValue),
      previousModel: requestedModel,
    };
  }

  function writeRuntimeSettings(pair) {
    try {
      if (typeof appSettings !== "undefined" && appSettings && typeof appSettings === "object") {
        if (appSettings.aiProvider !== pair.provider) appSettings.aiProvider = pair.provider;
        if (appSettings.aiModel !== pair.model) appSettings.aiModel = pair.model;
      }
    } catch {}

    try {
      const stored = readStoredSettings();
      if (stored.aiProvider !== pair.provider || stored.aiModel !== pair.model) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          ...stored,
          aiProvider: pair.provider,
          aiModel: pair.model,
        }));
      }
    } catch {}
  }

  function ensureProviderOption(select, provider) {
    if (!select || [...select.options].some((option) => option.value === provider)) return;
    const option = document.createElement("option");
    option.value = provider;
    option.textContent = PROVIDERS[provider].label;
    select.appendChild(option);
  }

  function syncModelOptions(select, provider, model) {
    if (!select) return;
    const definitions = PROVIDERS[provider].models;
    const desiredSignature = definitions.map((entry) => `${entry.value}:${entry.label}`).join("|");
    const currentSignature = [...select.options].map((option) => `${option.value}:${option.textContent}`).join("|");

    if (currentSignature !== desiredSignature) {
      const fragment = document.createDocumentFragment();
      definitions.forEach((entry) => {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.label;
        fragment.appendChild(option);
      });
      select.replaceChildren(fragment);
    }
    if (select.value !== model) select.value = model;
  }

  function syncControls(pair) {
    const providerSelect = document.getElementById(PROVIDER_SELECT_ID);
    const modelSelect = document.getElementById(MODEL_SELECT_ID);
    if (providerSelect) {
      ensureProviderOption(providerSelect, pair.provider);
      if (providerSelect.value !== pair.provider) providerSelect.value = pair.provider;
    }
    syncModelOptions(modelSelect, pair.provider, pair.model);
  }

  function displayModel(provider, model) {
    return modelDefinition(provider, model)?.label || model;
  }

  function syncDashboard(pair) {
    const dashboard = document.getElementById(DASHBOARD_ID);
    if (!dashboard) return;
    const providerValue = document.getElementById("aiDashProvider");
    const modelValue = document.getElementById("aiDashModel");
    const providerLabel = PROVIDERS[pair.provider].label;
    const modelLabel = displayModel(pair.provider, pair.model);
    if (providerValue && providerValue.textContent !== providerLabel) providerValue.textContent = providerLabel;
    if (modelValue && modelValue.textContent !== modelLabel) modelValue.textContent = modelLabel;

    dashboard.dataset.elyonAiProvider = pair.provider;
    dashboard.dataset.elyonAiModel = pair.model;
    dashboard.dataset.elyonAiPairValid = "true";

    if (lastCorrection && modelValue) {
      modelValue.title = `Ungültige Kombination automatisch korrigiert: ${lastCorrection.previousProvider || "unbekannt"} / ${lastCorrection.previousModel || "unbekannt"}`;
    }
  }

  function normalizeAndApply(overrides = {}) {
    const settings = readRuntimeSettings();
    const providerSelect = document.getElementById(PROVIDER_SELECT_ID);
    const modelSelect = document.getElementById(MODEL_SELECT_ID);
    const providerValue = overrides.provider ?? settings.aiProvider ?? providerSelect?.value ?? "openai";
    const modelValue = overrides.model ?? settings.aiModel ?? modelSelect?.value ?? "";
    const pair = normalizePair(providerValue, modelValue);

    if (pair.corrected) lastCorrection = pair;
    writeRuntimeSettings(pair);
    syncControls(pair);
    syncDashboard(pair);

    window.dispatchEvent(new CustomEvent("elyon:ai-settings-normalized", {
      detail: {
        provider: pair.provider,
        model: pair.model,
        corrected: pair.corrected,
        reason: text(overrides.reason) || "sync",
      },
    }));
    return pair;
  }

  function refreshAfterMain(pair) {
    [0, 40, 160].forEach((delay) => setTimeout(() => syncDashboard(pair), delay));
  }

  function handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    if (target.id === PROVIDER_SELECT_ID) {
      const pair = normalizeAndApply({
        provider: target.value,
        model: "",
        reason: "provider-change",
      });
      refreshAfterMain(pair);
      return;
    }

    if (target.id === MODEL_SELECT_ID) {
      const provider = document.getElementById(PROVIDER_SELECT_ID)?.value;
      const pair = normalizeAndApply({
        provider,
        model: target.value,
        reason: "model-change",
      });
      refreshAfterMain(pair);
    }
  }

  function handleClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (!button) return;
    if (!["saveSettings", "openAiDashboardBtn", "aiDashRefreshBtn", "aiDashTestOpenAiBtn", "aiDashTestDeepSeekBtn"].includes(button.id)) return;

    const providerSelect = document.getElementById(PROVIDER_SELECT_ID);
    const modelSelect = document.getElementById(MODEL_SELECT_ID);
    const pair = normalizeAndApply({
      provider: providerSelect?.value,
      model: modelSelect?.value,
      reason: button.id,
    });
    refreshAfterMain(pair);
  }

  function wrapGlobalFunction(name) {
    const original = window[name];
    if (typeof original !== "function" || original.elyonProviderModelGuardWrapped) return;
    const wrapped = function (...args) {
      const pair = normalizeAndApply({ reason: name });
      const result = original.apply(this, args);
      refreshAfterMain(pair);
      return result;
    };
    wrapped.elyonProviderModelGuardWrapped = true;
    wrapped.elyonOriginal = original;
    window[name] = wrapped;
  }

  function apply() {
    scheduled = false;
    const pair = normalizeAndApply({ reason: "refresh" });
    wrapGlobalFunction("openAiDashboard");
    wrapGlobalFunction("refreshAiDashboardStatus");
    refreshAfterMain(pair);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function install() {
    document.addEventListener("change", handleChange, true);
    document.addEventListener("click", handleClick, true);
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    apply();
    [120, 400, 900, 1800].forEach((delay) => setTimeout(scheduleApply, delay));
  }

  window.ElyonAiProviderModelGuard = {
    apply,
    normalize: normalizePair,
    providers: PROVIDERS,
    get current() {
      const settings = readRuntimeSettings();
      return normalizePair(settings.aiProvider, settings.aiModel);
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
