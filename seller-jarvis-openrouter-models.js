(() => {
  "use strict";

  const STORAGE_KEY = "elyon_jarvis_integration_registry_v1";

  const MODELS = [
    {
      id: "nemotron-3-ultra-free",
      modelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
      name: "Nemotron 3 Ultra",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Brain",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 100,
      capabilities: ["Reasoning", "Agents", "Tools", "Long Context"]
    },
    {
      id: "nemotron-3-super-free",
      modelId: "nvidia/nemotron-3-super-120b-a12b:free",
      name: "Nemotron 3 Super",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Brain",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 95,
      capabilities: ["Reasoning", "Agents", "Tools", "Long Context"]
    },
    {
      id: "gpt-oss-20b-free",
      modelId: "openai/gpt-oss-20b:free",
      name: "GPT-OSS 20B",
      provider: "OpenRouter",
      vendor: "OpenAI",
      role: "General Worker",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 90,
      capabilities: ["Tools", "JSON", "Reasoning"]
    },
    {
      id: "north-mini-code-free",
      modelId: "cohere/north-mini-code:free",
      name: "North Mini Code",
      provider: "OpenRouter",
      vendor: "Cohere",
      role: "Developer",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 90,
      capabilities: ["Coding", "Tools", "Agents"]
    },
    {
      id: "laguna-s-2-1-free",
      modelId: "poolside/laguna-s-2.1:free",
      name: "Laguna S 2.1",
      provider: "OpenRouter",
      vendor: "Poolside",
      role: "Developer",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 92,
      capabilities: ["Coding", "Reasoning", "Tools", "Agents"]
    },
    {
      id: "laguna-xs-2-1-free",
      modelId: "poolside/laguna-xs-2.1:free",
      name: "Laguna XS 2.1",
      provider: "OpenRouter",
      vendor: "Poolside",
      role: "Developer",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 86,
      capabilities: ["Coding", "Reasoning", "Tools", "Fast Tasks"]
    },
    {
      id: "nemotron-3-5-lightning-free",
      name: "Nemotron 3.5 Lightning",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Reasoning / Coding",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 80,
      capabilities: ["Reasoning", "Coding"]
    },
    {
      id: "ling-3-0-flash-free",
      modelId: "inclusionai/ling-3.0-flash:free",
      name: "Ling 3.0 Flash",
      provider: "OpenRouter",
      vendor: "inclusionAI",
      role: "Fast Worker",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 78,
      capabilities: ["Fast Tasks", "Tools", "Agents", "Coding"]
    },
    {
      id: "nemotron-3-nano-30b-a3b-free",
      modelId: "nvidia/nemotron-3-nano-30b-a3b:free",
      name: "Nemotron 3 Nano 30B A3B",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Fast Worker",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 82,
      capabilities: ["Agents", "Reasoning", "Fast Tasks"]
    },
    {
      id: "nemotron-3-nano-omni-free",
      modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      name: "Nemotron 3 Nano Omni",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Multimodal",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 90,
      capabilities: ["Text", "Vision", "Video", "Audio", "Reasoning"]
    },
    {
      id: "gemma-4-26b-a4b-free",
      modelId: "google/gemma-4-26b-a4b-it:free",
      name: "Gemma 4 26B A4B",
      provider: "OpenRouter",
      vendor: "Google",
      role: "Generalist",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 82,
      capabilities: ["Text", "Vision", "Video", "Tools", "Reasoning"]
    },
    {
      id: "gemma-4-31b-free",
      modelId: "google/gemma-4-31b-it:free",
      name: "Gemma 4 31B",
      provider: "OpenRouter",
      vendor: "Google",
      role: "Generalist",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 84,
      capabilities: ["Text", "Vision", "Analysis", "Tools", "Reasoning"]
    },
    {
      id: "nemotron-nano-12b-vl-free",
      modelId: "nvidia/nemotron-nano-12b-v2-vl:free",
      name: "Nemotron Nano 12B 2 VL",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Vision",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 85,
      capabilities: ["Vision", "Documents", "Video", "Reasoning"]
    },
    {
      id: "nemotron-nano-9b-v2-free",
      modelId: "nvidia/nemotron-nano-9b-v2:free",
      name: "Nemotron Nano 9B V2",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Fast Worker",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 76,
      capabilities: ["Reasoning", "Fast Tasks", "Tools"]
    },
    {
      id: "lfm-2-5-2-6b-free",
      name: "LFM2.5-2.6B",
      provider: "OpenRouter",
      vendor: "Liquid",
      role: "Fast Worker",
      tier: "FREE",
      kind: "chat",
      status: "configured",
      enabled: true,
      priority: 70,
      capabilities: ["Fast Tasks", "Agents"]
    },
    {
      id: "nemotron-3-embed-1b-free",
      modelId: "nvidia/nemotron-3-embed-1b:free",
      name: "Nemotron 3 Embed 1B",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Memory Embed",
      tier: "FREE",
      kind: "embedding",
      status: "configured",
      enabled: true,
      priority: 95,
      capabilities: ["Embeddings", "RAG", "Search"]
    },
    {
      id: "llama-nemotron-embed-vl-1b-v2-free",
      modelId: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
      name: "Llama Nemotron Embed VL 1B V2",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Memory Embed",
      tier: "FREE",
      kind: "embedding",
      status: "configured",
      enabled: true,
      priority: 94,
      capabilities: ["Embeddings", "Vision", "Documents", "RAG"]
    },
    {
      id: "nemotron-rerank-vl-free",
      modelId: "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
      name: "Llama Nemotron Rerank VL 1B V2",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Memory Rerank",
      tier: "FREE",
      kind: "rerank",
      status: "configured",
      enabled: true,
      priority: 95,
      capabilities: ["Rerank", "Vision", "Documents", "RAG"]
    },
    {
      id: "nemotron-3-5-content-safety-free",
      modelId: "nvidia/nemotron-3.5-content-safety:free",
      name: "Nemotron 3.5 Content Safety",
      provider: "OpenRouter",
      vendor: "NVIDIA",
      role: "Safety",
      tier: "FREE",
      kind: "safety",
      status: "configured",
      enabled: false,
      priority: 100,
      capabilities: ["Safety", "Moderation", "Text", "Vision"]
    },
    {
      id: "openrouter-free-router",
      modelId: "openrouter/free",
      name: "Free Models Router",
      provider: "OpenRouter",
      vendor: "OpenRouter",
      role: "Fallback",
      tier: "FREE",
      kind: "router",
      status: "configured",
      enabled: true,
      priority: 50,
      capabilities: ["Routing", "Fallback"]
    },
    {
      id: "fish-audio-s2-1-pro-free",
      modelId: "s2.1-pro-free",
      name: "S2.1 Pro Free",
      provider: "Fish Audio",
      vendor: "Fish Audio",
      role: "Voice",
      tier: "FREE",
      kind: "speech",
      status: "provider_key_required",
      enabled: false,
      priority: 70,
      capabilities: ["TTS", "Voice", "Multilingual"]
    }
  ];

  function readRegistry() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function mergeModels(existingModels) {
    const existing = Array.isArray(existingModels) ? existingModels : [];
    const byId = new Map(existing.filter(Boolean).map((model) => [String(model.id || ""), model]));
    const canonicalIds = new Set(MODELS.map((model) => model.id));

    const merged = MODELS.map((model) => {
      const previous = byId.get(model.id) || {};
      return {
        ...previous,
        ...model,
        enabled: typeof previous.enabled === "boolean" ? previous.enabled : model.enabled
      };
    });

    existing.forEach((model) => {
      const id = String(model?.id || "");
      if (id && !canonicalIds.has(id)) merged.push(model);
    });

    return merged;
  }

  function sync() {
    const registry = readRegistry();
    registry.models = mergeModels(registry.models);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
    } catch {
      return false;
    }
    return true;
  }

  sync();

  window.ElyonOpenRouterModelCatalog = Object.freeze({
    version: 1,
    models: MODELS.map((model) => ({ ...model, capabilities: [...model.capabilities] })),
    sync
  });
})();