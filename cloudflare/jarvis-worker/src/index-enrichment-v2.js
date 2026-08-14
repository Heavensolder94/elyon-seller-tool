import baseWorker, { loadProductForTask } from "./index.js";
import { persistSellerProductPatch, runPostEnrichmentProductCheck } from "./index-enrichment.js";
import {
  buildAutoApplyPatch,
  classifyFindings,
  detectConcurrentConflicts,
  discoverEnrichmentTargets,
  snapshotTargetValues,
} from "./product-enrichment.js";
import { buildPreservingEnrichmentPatch } from "./enrichment-provenance-v2.js";
import { researchWithOpenRouter } from "./openrouter-enrichment-research-v2.js";
import { getTask, processEnrichmentMessageV2, processTaskMessageV2 } from "./enrichment-task-runtime-v2.js";
import { researchMarketScout } from "./market-scout-research.js";

const WORKER_VERSION = "0.6.0";
const ENRICHMENT_VERSION = "jarvis-product-enrichment-v1.1";
const MARKET_SCOUT_VERSION = "jarvis-market-scout-async-v1";
const ELYON_ARTICLE_NUMBER_PATTERN = /^ELY-\d{6,}$/i;

const text = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function provenanceFor({ product, autoApply, pendingReview, lowConfidence, conflicts, now }) {
  return buildPreservingEnrichmentPatch({
    product,
    version: ENRICHMENT_VERSION,
    now,
    findings: [...autoApply, ...pendingReview, ...lowConfidence, ...conflicts],
  });
}

async function runProductEnrichmentV2(task, env) {
  const productId = text(task.payload?.productId || task.payload?.product_id || task.payload?.id, 200);
  if (!productId) {
    const error = new Error("invalid_product_id");
    error.retryable = false;
    throw error;
  }

  const loaded = await loadProductForTask(env, productId);
  const { product, rawProduct, source } = loaded;
  const targets = discoverEnrichmentTargets(product, rawProduct, task.payload?.requestedFields);
  const baseline = snapshotTargetValues(product, rawProduct, targets);

  if (!targets.length) {
    const canonicalId = product.articleNumber || product.sku || product.id || productId;
    const postCheck = await runPostEnrichmentProductCheck(env, task, canonicalId);
    return {
      processed: true,
      handler: "product-enrichment",
      version: ENRICHMENT_VERSION,
      productId,
      productSource: source,
      researchedFields: 0,
      requestedFields: [],
      autoApplied: [],
      pendingReview: [],
      unresolved: [],
      lowConfidence: [],
      conflicts: [],
      persisted: false,
      noOp: true,
      citations: [],
      postCheck,
      cost: {
        provider: "openrouter",
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        webSearchRequests: 0,
        amount: 0,
        unit: "openrouter_credits",
      },
    };
  }

  const research = await researchWithOpenRouter({ env, product, rawProduct, fields: targets });
  const initial = classifyFindings({ product, rawProduct, findings: research.findings });

  const reloaded = await loadProductForTask(env, productId);
  const concurrency = detectConcurrentConflicts({
    baseline,
    currentProduct: reloaded.product,
    currentRawProduct: reloaded.rawProduct,
    findings: initial.autoApply,
  });

  const safeAutoApply = concurrency.safeFindings;
  const allConflicts = [...initial.existingValueConflicts, ...concurrency.conflicts];
  const { patch: fieldPatch, applied } = buildAutoApplyPatch({
    product: reloaded.product,
    findings: safeAutoApply,
  });
  const checkedAutoApply = safeAutoApply.filter((finding) => applied.includes(finding.field));
  const now = nowIso();
  const provenancePatch = provenanceFor({
    product: reloaded.product,
    autoApply: checkedAutoApply,
    pendingReview: initial.pendingReview,
    lowConfidence: initial.lowConfidence,
    conflicts: allConflicts,
    now,
  });

  const articleNumber = text(reloaded.product.articleNumber || reloaded.product.sku, 100).toUpperCase();
  const writable = source === "seller_tool_product_master" && ELYON_ARTICLE_NUMBER_PATTERN.test(articleNumber);
  const hasResearchMetadata = Object.keys(provenancePatch.enrichment?.fields || {}).length > 0;
  const hasWrite = checkedAutoApply.length > 0 || hasResearchMetadata;
  let persisted = false;

  if (writable && hasWrite) {
    await persistSellerProductPatch(env, reloaded.product, { ...fieldPatch, ...provenancePatch });
    persisted = true;
  }

  const canonicalId = articleNumber || reloaded.product.id || productId;
  const postCheck = await runPostEnrichmentProductCheck(env, task, canonicalId);

  return {
    processed: true,
    handler: "product-enrichment",
    version: ENRICHMENT_VERSION,
    productId,
    productSource: source,
    researchedFields: targets.length,
    requestedFields: targets,
    autoApplied: persisted ? checkedAutoApply.map((finding) => finding.field) : [],
    pendingReview: initial.pendingReview.map((finding) => ({
      field: finding.field,
      value: finding.value,
      confidence: finding.confidence,
      sourceType: finding.sourceType,
      sourceUrl: finding.sourceUrl || null,
      complianceSensitive: finding.complianceSensitive,
    })),
    unresolved: research.unresolved,
    lowConfidence: initial.lowConfidence.map((finding) => finding.field),
    conflicts: allConflicts.map((finding) => ({
      field: finding.field,
      existingValue: finding.existingValue || null,
      proposedValue: finding.value,
    })),
    persisted,
    writeBlockedReason: writable ? null : "product_master_identity_or_source_not_write_ready",
    citations: research.citations,
    postCheck,
    cost: {
      provider: research.provider,
      model: research.model,
      inputTokens: research.usage.inputTokens,
      outputTokens: research.usage.outputTokens,
      totalTokens: research.usage.totalTokens,
      webSearchRequests: research.usage.webSearchRequests,
      amount: research.usage.amount,
      unit: research.usage.unit,
      costDetails: research.usage.costDetails,
    },
  };
}

async function runMarketScoutTask(task, env) {
  return researchMarketScout({ env, payload: task.payload || {} });
}

function corsHeaders() {
  return {
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function publicMarketScoutTask(task) {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    progress: Number(task.progress || 0),
    output: task.output ?? null,
    error: task.error ?? null,
    lastError: task.lastError ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt ?? null,
    finishedAt: task.finishedAt ?? null,
    attemptCount: Number(task.attemptCount || 0),
  };
}

async function marketScoutStatus(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "GET") return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405, headers: corsHeaders() });
  const id = text(url.pathname.slice("/market-scout/tasks/".length), 100);
  const token = text(url.searchParams.get("token"), 200);
  if (!id || !token) return Response.json({ ok: false, error: "market_scout_task_access_denied" }, { status: 403, headers: corsHeaders() });
  const task = await getTask(env, id);
  if (!task || task.type !== "market-scout") return Response.json({ ok: false, error: "task_not_found" }, { status: 404, headers: corsHeaders() });
  const expected = text(task.payload?.statusToken, 200);
  if (!expected || expected !== token) return Response.json({ ok: false, error: "market_scout_task_access_denied" }, { status: 403, headers: corsHeaders() });
  return Response.json({ ok: true, task: publicMarketScoutTask(task) }, { headers: corsHeaders() });
}

async function fetchHandler(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/market-scout/tasks/")) {
    try {
      return await marketScoutStatus(request, env, url);
    } catch (error) {
      return Response.json({ ok: false, error: text(error?.message, 200) || "market_scout_status_failed" }, { status: 500, headers: corsHeaders() });
    }
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({
      ok: true,
      service: "elyon-jarvis-worker",
      version: WORKER_VERSION,
      productEnrichment: ENRICHMENT_VERSION,
      marketScout: MARKET_SCOUT_VERSION,
      marketScoutAsync: true,
      openRouterResearch: env.OPENROUTER_API_KEY ? "configured" : "missing",
      complianceAutoApply: false,
      costAccounting: "usage.cost",
      provenanceRawReload: true,
    }, { headers: { "cache-control": "no-store" } });
  }

  if (request.method === "GET" && url.pathname === "/runtime/health") {
    const response = await baseWorker.fetch(request, env, ctx);
    const payload = await response.json().catch(() => ({}));
    return Response.json({
      ...payload,
      version: WORKER_VERSION,
      productEnrichment: {
        enabled: true,
        version: ENRICHMENT_VERSION,
        openRouterResearch: env.OPENROUTER_API_KEY ? "configured" : "missing",
        complianceAutoApply: false,
        costAccounting: true,
        provenanceRawReload: true,
      },
      marketScout: {
        enabled: true,
        version: MARKET_SCOUT_VERSION,
        asyncQueue: true,
        openRouterResearch: env.OPENROUTER_API_KEY ? "configured" : "missing",
        readOnly: true,
      },
    }, { status: response.status, headers: { "cache-control": "no-store" } });
  }

  return baseWorker.fetch(request, env, ctx);
}

export default {
  fetch: fetchHandler,
  async queue(batch, env, ctx) {
    const baseMessages = [];
    for (const message of batch.messages || []) {
      if (message?.body?.type === "product-enrichment") {
        await processEnrichmentMessageV2(message, env, runProductEnrichmentV2);
      } else if (message?.body?.type === "market-scout") {
        await processTaskMessageV2(message, env, {
          type: "market-scout",
          agentName: "market-scout-handler-v1",
          handler: runMarketScoutTask,
        });
      } else {
        baseMessages.push(message);
      }
    }
    if (baseMessages.length) await baseWorker.queue({ ...batch, messages: baseMessages }, env, ctx);
  },
};

export { runMarketScoutTask, runProductEnrichmentV2 };
