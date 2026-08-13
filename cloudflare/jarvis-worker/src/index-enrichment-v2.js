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
import { processEnrichmentMessageV2 } from "./enrichment-task-runtime-v2.js";

const WORKER_VERSION = "0.5.1";
const ENRICHMENT_VERSION = "jarvis-product-enrichment-v1.1";
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

async function fetchHandler(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({
      ok: true,
      service: "elyon-jarvis-worker",
      version: WORKER_VERSION,
      productEnrichment: ENRICHMENT_VERSION,
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
      } else {
        baseMessages.push(message);
      }
    }
    if (baseMessages.length) await baseWorker.queue({ ...batch, messages: baseMessages }, env, ctx);
  },
};

export { runProductEnrichmentV2 };
