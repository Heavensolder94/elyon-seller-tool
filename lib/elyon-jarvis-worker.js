import { listCombinedAgentRegistry } from "./ai-agent-registry-store.js";
import { createJarvisPlan, summarizeJarvisRuns } from "./elyon-jarvis-core.js";
import { executePlan } from "../api/jarvis.js";
import {
  getJarvisControlSnapshot,
  recordJarvisAutopilotOutcome,
  reserveJarvisAutopilotSlot,
} from "./elyon-jarvis-control-store.js";
import { dispatchCompanyOsPipelineStart } from "./elyon-company-os-pipeline-bridge.js";
import {
  claimJarvisWorkerJob,
  finishJarvisWorkerJob,
  getJarvisWorkerEvent,
  listDueJarvisWorkerJobs,
} from "./elyon-jarvis-worker-store.js";

const MAX_BATCH = 2;
const MAX_RUNTIME_MS = 40_000;

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildInternalSellerRequest(env = process.env) {
  const token = text(env.ELYON_SELLER_ACCESS_TOKEN, 4000);
  if (!token) {
    const error = new Error("ELYON_SELLER_ACCESS_TOKEN fehlt für die interne E3/E4-Agentenausführung.");
    error.code = "jarvis_worker_seller_access_unconfigured";
    throw error;
  }
  return {
    method: "POST",
    query: {},
    body: {},
    headers: {
      "x-elyon-seller-token": token,
      "x-forwarded-proto": "https",
      host: "elyonsellertool.vercel.app",
    },
  };
}

function productInput(event = {}) {
  const payload = plainObject(event.payload);
  return {
    id: text(event.subjectId || event.sourceId, 300),
    companyOsProductId: text(event.subjectId || event.sourceId, 300),
    title: text(payload.title, 1000),
    supplier: text(payload.supplier || payload.source || "Company OS", 300),
    supplierUrl: text(payload.supplierUrl || payload.sourceUrl || payload.url, 3000),
    sourceUrl: text(payload.sourceUrl || payload.supplierUrl || payload.url, 3000),
    companyOsSection: text(payload.companyOsSection || payload.targetArea, 120),
    importMode: text(payload.importMode || payload.mode, 120),
    source: "elyon_company_os",
  };
}

function compactRun(run = {}) {
  const task = plainObject(run?.payload?.task);
  const result = plainObject(run?.payload?.result || task.result);
  const usage = plainObject(run?.payload?.usage || task.usage);
  return {
    agentId: text(run.agentId, 100),
    agentName: text(run.agentName, 200),
    capability: text(run.capability, 120),
    ok: run.ok === true,
    statusCode: Number(run.statusCode || 0) || 0,
    status: text(result.status, 100),
    summary: text(result.summary || run.message, 2000),
    blockers: (Array.isArray(result.blockers) ? result.blockers : []).slice(0, 10).map((entry) => text(entry, 800)).filter(Boolean),
    warnings: (Array.isArray(result.warnings) ? result.warnings : []).slice(0, 10).map((entry) => text(entry, 800)).filter(Boolean),
    provider: text(run?.payload?.provider || task.provider, 60).toLowerCase(),
    model: text(run?.payload?.model || task.model, 200),
    usage: {
      inputTokens: Math.max(0, Number(usage.inputTokens || 0) || 0),
      outputTokens: Math.max(0, Number(usage.outputTokens || 0) || 0),
      totalTokens: Math.max(0, Number(usage.totalTokens || 0) || 0),
    },
  };
}

function compactPlan(plan = {}) {
  return {
    correlationId: text(plan.correlationId, 160),
    intent: text(plan.intent, 100),
    status: text(plan.status, 100),
    delegations: (Array.isArray(plan.delegations) ? plan.delegations : []).slice(0, 2).map((item) => ({
      agentId: text(item.agentId, 100),
      agentName: text(item.agentName, 200),
      capability: text(item.capability, 120),
    })),
    blockers: (Array.isArray(plan.blockers) ? plan.blockers : []).slice(0, 10).map((entry) => text(entry, 800)).filter(Boolean),
    warnings: (Array.isArray(plan.warnings) ? plan.warnings : []).slice(0, 10).map((entry) => text(entry, 800)).filter(Boolean),
  };
}

function outcomeFromRuns(plan, runs) {
  const summary = summarizeJarvisRuns(plan, runs);
  const compactRuns = (Array.isArray(runs) ? runs : []).map(compactRun);
  const result = {
    phase: "E4",
    mode: "auto_internal",
    plan: compactPlan(plan),
    summary,
    runs: compactRuns,
  };
  if (summary.status === "blocked" || summary.blockers.length) {
    return {
      ok: false,
      blocked: true,
      error: summary.blockers[0] || "Jarvis-Worker wurde durch einen internen Blocker gestoppt.",
      result,
    };
  }
  if (!compactRuns.length || summary.successful < 1 || summary.status === "failed") {
    return {
      ok: false,
      blocked: false,
      error: summary.warnings[0] || "Kein Jarvis-Mitarbeiterauftrag wurde erfolgreich abgeschlossen.",
      result,
    };
  }
  return { ok: true, blocked: false, result };
}

export async function executeJarvisWorkerClaim(claim, event, options = {}) {
  const job = plainObject(claim?.job);
  if (!event) {
    return {
      ok: false,
      blocked: true,
      error: "Das zum Cloud-Job gehörende Event fehlt.",
      result: { phase: "E4", mode: "auto_internal", reason: "event_missing", runs: [] },
    };
  }

  const listRegistryImpl = options.listRegistryImpl || ((registryOptions) => listCombinedAgentRegistry(registryOptions));
  const executePlanImpl = options.executePlanImpl || executePlan;
  const env = options.env || process.env;
  const registry = await listRegistryImpl({ env });
  const agents = Array.isArray(registry?.agents) ? registry.agents : [];
  const plan = createJarvisPlan({
    command: text(job.command, 12000),
    agents,
    requestedCapability: text(job.capability, 100),
    maxAgents: 1,
  });

  if (plan.status === "blocked" || !plan.executable) {
    return {
      ok: false,
      blocked: true,
      error: plan.blockers?.[0] || "Kein sicherer aktiver Mitarbeiter für diesen E4-Job verfügbar.",
      result: { phase: "E4", mode: "auto_internal", plan: compactPlan(plan), runs: [] },
    };
  }

  const req = options.internalRequest || buildInternalSellerRequest(env);
  const runs = await executePlanImpl(req, plan, {
    execute: true,
    mode: "execute",
    maxAgents: 1,
    stopOnBlocker: true,
    title: `Jarvis E4 · ${text(event.type, 120)}`,
    priority: text(job.priority, 50) || "medium",
    sourceId: text(event.subjectId || event.sourceId, 300),
    sourceType: text(event.type, 120),
    input: {
      product: productInput(event),
      event: {
        eventId: text(event.eventId, 120),
        type: text(event.type, 120),
        source: text(event.source, 100),
        sourceId: text(event.sourceId, 300),
        subjectId: text(event.subjectId, 300),
        correlationId: text(event.correlationId, 160),
      },
    },
  });
  return outcomeFromRuns(plan, runs);
}

function pausedWorkerResult(snapshot, results = []) {
  return {
    ok: true,
    phase: "E4",
    worker: "controlled_auto_internal",
    scanned: 0,
    processed: results.filter((entry) => entry.status !== "SKIPPED").length,
    results,
    control: {
      mode: text(snapshot?.control?.mode, 30) || "manual",
      state: text(snapshot?.decision?.state, 30) || "paused",
      reasons: Array.isArray(snapshot?.decision?.reasons) ? snapshot.decision.reasons : [],
      killSwitch: snapshot?.control?.killSwitch === true,
      pausedByGuard: snapshot?.control?.pausedByGuard === true,
    },
    safety: {
      scope: "company-os:nova.product.created",
      maxJobsPerRun: MAX_BATCH,
      maxAgentsPerJob: 1,
      externalActionsLocked: true,
      livePublishingAllowed: false,
    },
  };
}

export async function runJarvisWorker(options = {}) {
  const env = options.env || process.env;
  const listDueJobsImpl = options.listDueJobsImpl || listDueJarvisWorkerJobs;
  const claimJobImpl = options.claimJobImpl || claimJarvisWorkerJob;
  const getEventImpl = options.getEventImpl || getJarvisWorkerEvent;
  const finishJobImpl = options.finishJobImpl || finishJarvisWorkerJob;
  const executeClaimImpl = options.executeClaimImpl || executeJarvisWorkerClaim;
  const controlSnapshotImpl = options.controlSnapshotImpl || getJarvisControlSnapshot;
  const reserveSlotImpl = options.reserveSlotImpl || reserveJarvisAutopilotSlot;
  const recordOutcomeImpl = options.recordOutcomeImpl || recordJarvisAutopilotOutcome;
  const pipelineStartImpl = options.pipelineStartImpl || dispatchCompanyOsPipelineStart;
  const now = text(options.now, 100) || new Date().toISOString();
  const requestedLimit = Math.max(1, Math.min(MAX_BATCH, Number(options.limit || MAX_BATCH) || MAX_BATCH));
  const startedAt = Date.now();

  let controlSnapshot = await controlSnapshotImpl({ env, now, fetchImpl: options.fetchImpl });
  if (!controlSnapshot?.decision?.allowed) return pausedWorkerResult(controlSnapshot);

  const limit = Math.max(1, Math.min(requestedLimit, Number(controlSnapshot.decision.batchLimit || 1) || 1));
  if (!options.executeClaimImpl) buildInternalSellerRequest(env);

  const dueJobs = await listDueJobsImpl({ env, limit, now, fetchImpl: options.fetchImpl });
  const results = [];

  for (const candidate of dueJobs.slice(0, limit)) {
    if (Date.now() - startedAt >= MAX_RUNTIME_MS) break;

    controlSnapshot = await controlSnapshotImpl({ env, now: new Date().toISOString(), fetchImpl: options.fetchImpl });
    if (!controlSnapshot?.decision?.allowed) break;

    const slot = await reserveSlotImpl(controlSnapshot, { env, now: new Date().toISOString(), fetchImpl: options.fetchImpl });
    if (!slot?.reserved) {
      results.push({ jobId: text(candidate.jobId, 120), status: "SKIPPED", reason: text(slot?.reason, 200) || "control_limit" });
      break;
    }

    const claim = await claimJobImpl(candidate.jobId, { env, now, fetchImpl: options.fetchImpl });
    if (!claim?.claimed) {
      results.push({ jobId: text(candidate.jobId, 120), status: "SKIPPED", reason: text(claim?.reason, 200) });
      continue;
    }

    let outcome;
    let workerEvent = null;
    try {
      workerEvent = await getEventImpl(claim.job.eventId, { env, fetchImpl: options.fetchImpl });
      outcome = await executeClaimImpl(claim, workerEvent, {
        env,
        listRegistryImpl: options.listRegistryImpl,
        executePlanImpl: options.executePlanImpl,
        internalRequest: options.internalRequest,
      });
    } catch (error) {
      outcome = {
        ok: false,
        blocked: false,
        error: text(error?.message, 2000) || "Jarvis E4 Worker fehlgeschlagen.",
        result: {
          phase: "E4",
          mode: "auto_internal",
          errorCode: text(error?.code, 120),
          runs: [],
        },
      };
    }

    const stored = await finishJobImpl(claim, outcome, { env, now: new Date().toISOString(), fetchImpl: options.fetchImpl });
    const accounting = await recordOutcomeImpl(outcome, { env, now: new Date().toISOString(), fetchImpl: options.fetchImpl });
    let pipelineStart = { attempted: false, delivered: false, skipped: true, reason: "agent_outcome_not_successful" };
    if (outcome.ok === true && stored.status === "SUCCESS" && workerEvent) {
      try {
        pipelineStart = await pipelineStartImpl(workerEvent, { env, fetchImpl: options.fetchImpl });
      } catch (error) {
        pipelineStart = {
          attempted: true,
          delivered: false,
          skipped: false,
          reason: text(error?.code || error?.message, 500) || "company_os_pipeline_start_failed",
        };
      }
    }
    results.push({
      jobId: text(stored.jobId, 120),
      eventType: text(stored.eventType, 120),
      status: text(stored.status, 50),
      attempts: Number(stored.attempts || 0),
      estimatedCostEur: Number(accounting?.metering?.estimatedCostEur || 0),
      totalTokens: Number(accounting?.metering?.totalTokens || 0),
      controlPaused: accounting?.paused === true,
      pipelineStart,
    });
    if (accounting?.paused === true) break;
  }

  const finalSnapshot = await controlSnapshotImpl({ env, now: new Date().toISOString(), fetchImpl: options.fetchImpl });
  return {
    ok: true,
    phase: "E5",
    worker: "controlled_auto_internal",
    scanned: dueJobs.length,
    processed: results.filter((entry) => entry.status !== "SKIPPED").length,
    results,
    control: {
      mode: text(finalSnapshot?.control?.mode, 30),
      state: text(finalSnapshot?.decision?.state, 30),
      reasons: Array.isArray(finalSnapshot?.decision?.reasons) ? finalSnapshot.decision.reasons : [],
      killSwitch: finalSnapshot?.control?.killSwitch === true,
      pausedByGuard: finalSnapshot?.control?.pausedByGuard === true,
      batchLimit: Number(finalSnapshot?.decision?.batchLimit || 0),
    },
    safety: {
      scope: "company-os:nova.product.created",
      maxJobsPerRun: MAX_BATCH,
      maxAgentsPerJob: 1,
      companyOsPipelineStartAfterSuccessfulReview: true,
      externalActionsLocked: true,
      livePublishingAllowed: false,
    },
  };
}

export {
  MAX_BATCH,
  MAX_RUNTIME_MS,
  buildInternalSellerRequest,
  compactPlan,
  compactRun,
  outcomeFromRuns,
  pausedWorkerResult,
  productInput,
};
