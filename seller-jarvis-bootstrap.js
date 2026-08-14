(() => {
  "use strict";

  const REGISTRY_KEY = "elyon_jarvis_integration_registry_v1";
  const VERSION = "phase-e5-v1-openrouter-registry-v2";
  const MODEL_ROWS = [
    ["nemotron-3-ultra-free","nvidia/nemotron-3-ultra-550b-a55b:free","Nemotron 3 Ultra","OpenRouter","NVIDIA","Brain","chat","configured",true,100,["Reasoning","Agents","Tools","Long Context"]],
    ["nemotron-3-super-free","nvidia/nemotron-3-super-120b-a12b:free","Nemotron 3 Super","OpenRouter","NVIDIA","Brain","chat","configured",true,95,["Reasoning","Agents","Tools","Long Context"]],
    ["gpt-oss-20b-free","openai/gpt-oss-20b:free","GPT-OSS 20B","OpenRouter","OpenAI","General Worker","chat","configured",true,90,["Tools","JSON","Reasoning"]],
    ["north-mini-code-free","cohere/north-mini-code:free","North Mini Code","OpenRouter","Cohere","Developer","chat","configured",true,90,["Coding","Tools","Agents"]],
    ["laguna-s-2-1-free","poolside/laguna-s-2.1:free","Laguna S 2.1","OpenRouter","Poolside","Developer","chat","configured",true,92,["Coding","Reasoning","Tools","Agents"]],
    ["laguna-xs-2-1-free","poolside/laguna-xs-2.1:free","Laguna XS 2.1","OpenRouter","Poolside","Developer","chat","configured",true,86,["Coding","Reasoning","Tools","Fast Tasks"]],
    ["nemotron-3-5-lightning-free","","Nemotron 3.5 Lightning","OpenRouter","NVIDIA","Reasoning / Coding","chat","catalog_only",true,80,["Reasoning","Coding"]],
    ["ling-3-0-flash-free","inclusionai/ling-3.0-flash:free","Ling 3.0 Flash","OpenRouter","inclusionAI","Fast Worker","chat","unavailable",false,78,["Fast Tasks","Tools","Agents","Coding"]],
    ["nemotron-3-nano-30b-a3b-free","nvidia/nemotron-3-nano-30b-a3b:free","Nemotron 3 Nano 30B A3B","OpenRouter","NVIDIA","Fast Worker","chat","configured",true,82,["Agents","Reasoning","Fast Tasks"]],
    ["nemotron-3-nano-omni-free","nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free","Nemotron 3 Nano Omni","OpenRouter","NVIDIA","Multimodal","chat","configured",true,90,["Text","Vision","Video","Audio","Reasoning"]],
    ["gemma-4-26b-a4b-free","google/gemma-4-26b-a4b-it:free","Gemma 4 26B A4B","OpenRouter","Google","Generalist","chat","configured",true,82,["Text","Vision","Video","Tools","Reasoning"]],
    ["gemma-4-31b-free","google/gemma-4-31b-it:free","Gemma 4 31B","OpenRouter","Google","Generalist","chat","configured",true,84,["Text","Vision","Analysis","Tools","Reasoning"]],
    ["nemotron-nano-12b-vl-free","nvidia/nemotron-nano-12b-v2-vl:free","Nemotron Nano 12B 2 VL","OpenRouter","NVIDIA","Vision","chat","configured",true,85,["Vision","Documents","Video","Reasoning"]],
    ["nemotron-nano-9b-v2-free","nvidia/nemotron-nano-9b-v2:free","Nemotron Nano 9B V2","OpenRouter","NVIDIA","Fast Worker","chat","configured",true,76,["Reasoning","Fast Tasks","Tools"]],
    ["lfm-2-5-2-6b-free","","LFM2.5-2.6B","OpenRouter","Liquid","Fast Worker","chat","catalog_only",true,70,["Fast Tasks","Agents"]],
    ["nemotron-3-embed-1b-free","nvidia/nemotron-3-embed-1b:free","Nemotron 3 Embed 1B","OpenRouter","NVIDIA","Memory Embed","embedding","configured",true,95,["Embeddings","RAG","Search"]],
    ["llama-nemotron-embed-vl-1b-v2-free","nvidia/llama-nemotron-embed-vl-1b-v2:free","Llama Nemotron Embed VL 1B V2","OpenRouter","NVIDIA","Memory Embed","embedding","configured",true,94,["Embeddings","Vision","Documents","RAG"]],
    ["nemotron-rerank-vl-free","nvidia/llama-nemotron-rerank-vl-1b-v2:free","Llama Nemotron Rerank VL 1B V2","OpenRouter","NVIDIA","Memory Rerank","rerank","configured",true,95,["Rerank","Vision","Documents","RAG"]],
    ["nemotron-3-5-content-safety-free","nvidia/nemotron-3.5-content-safety:free","Nemotron 3.5 Content Safety","OpenRouter","NVIDIA","Safety","safety","configured",false,100,["Safety","Moderation","Text","Vision"]],
    ["openrouter-free-router","openrouter/free","Free Models Router","OpenRouter","OpenRouter","Fallback","router","configured",true,50,["Routing","Fallback"]],
    ["fish-audio-s2-1-pro-free","s2.1-pro-free","S2.1 Pro Free","Fish Audio","Fish Audio","Voice","speech","provider_key_required",false,70,["TTS","Voice","Multilingual"]]
  ];

  const FILES = [
    "/seller-jarvis-client.js",
    "/seller-jarvis-ui.js",
    "/seller-jarvis-ui-response-adapter.js",
    "/seller-jarvis-command-center.js",
    "/seller-jarvis-integration-center.js",
    "/seller-ai-workforce-builder-integration.js",
    "/seller-jarvis-companion-handoff.js",
    "/seller-jarvis-e1-cloud.js",
    "/seller-jarvis-e4-control.js",
    "/seller-jarvis-e5-pipeline.js",
  ];

  function modelFromRow(row) {
    const [id, modelId, name, provider, vendor, role, kind, status, enabled, priority, capabilities] = row;
    return { id, ...(modelId ? { modelId } : {}), name, provider, vendor, role, tier: "FREE", kind, status, enabled, priority, capabilities };
  }

  function syncModelCatalog() {
    const canonical = MODEL_ROWS.map(modelFromRow);
    let registry = {};
    try { registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || "{}") || {}; } catch { registry = {}; }
    const existing = Array.isArray(registry.models) ? registry.models : [];
    const previousById = new Map(existing.filter(Boolean).map((model) => [String(model.id || ""), model]));
    const canonicalIds = new Set(canonical.map((model) => model.id));
    registry.models = canonical.map((model) => {
      const previous = previousById.get(model.id) || {};
      const forceDisabled = model.status === "unavailable" || model.status === "provider_key_required";
      return { ...previous, ...model, enabled: forceDisabled ? false : (typeof previous.enabled === "boolean" ? previous.enabled : model.enabled) };
    });
    existing.forEach((model) => {
      const id = String(model?.id || "");
      if (id && !canonicalIds.has(id)) registry.models.push(model);
    });
    try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry)); } catch { return false; }
    window.ElyonOpenRouterModelCatalog = Object.freeze({ version: 2, models: canonical, sync: syncModelCatalog });
    return true;
  }

  function existing(path) {
    return [...document.scripts].some((script) => {
      try { return new URL(script.src, window.location.href).pathname === path; }
      catch { return false; }
    });
  }

  function load(path) {
    if (existing(path)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${path}?v=${VERSION}`;
      script.defer = true;
      script.dataset.elyonJarvisModule = path;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error(`Jarvis-Modul konnte nicht geladen werden: ${path}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function boot() {
    try {
      syncModelCatalog();
      for (const file of FILES) await load(file);
      window.ElyonJarvisUI?.refresh?.();
      window.ElyonJarvisUIResponseAdapter?.refreshSystemStatus?.();
      window.ElyonJarvisCommandCenter?.refresh?.();
      window.ElyonJarvisIntegrationCenter?.refresh?.();
      window.ElyonAIWorkforceBuilderIntegration?.refresh?.();
      window.ElyonJarvisE4Cloud?.render?.();
      window.ElyonJarvisE4Control?.render?.();
      window.ElyonJarvisE5Pipeline?.render?.();
    } catch (error) {
      console.warn("[Elyon Jarvis] Integration Center Bootstrap fehlgeschlagen", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();