import { requireSellerAccess } from "../lib/seller-access.js";
import { listCombinedAgentRegistry } from "../lib/ai-agent-registry-store.js";
import { appendConversationMessage, getOrCreateConversation, updateConversationSummary } from "../lib/jarvis-conversation-store.js";
import { readWorkingMemory, upsertWorkingMemory } from "../lib/jarvis-working-memory-store.js";
import { buildWorkingMemorySummary, mergeWorkingMemoryState, parseWorkingMemoryCommand } from "../lib/jarvis-working-memory-policy.js";
import { autoDelegationDecision, isBrainFirstCommand, isExplicitPlanOnly } from "../lib/jarvis-autonomy-policy.js";
import { CAPABILITY_PROFILES, createJarvisPlan, summarizeJarvisRuns } from "../lib/elyon-jarvis-core.js";
import { isMarketScoutCommand, runMarketScout } from "../lib/jarvis-market-scout.js";
import { executeBrain, executePlan, shouldRouteToBrain } from "./jarvis.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function safeJson(value, depth = 0) {
  if (depth > 5) return undefined;
  if (value === null) return null;
  if (["boolean", "number"].includes(typeof value)) return value;
  if (typeof value === "string") return text(value, 12000);
  if (Array.isArray(value)) return value.slice(0, 60).map((entry) => safeJson(entry, depth + 1)).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, entry]) => [text(key, 120), safeJson(entry, depth + 1)])
      .filter(([key, entry]) => key && entry !== undefined)
  );
}

function publicAgent(agent = {}) {
  return {
    id: text(agent.id, 100),
    name: text(agent.name, 160),
    kind: agent.kind === "custom" ? "custom" : "core",
    enabled: agent.enabled !== false,
    department: text(agent.department, 80),
    role: text(agent.role, 600),
    capabilities: (Array.isArray(agent.capabilities) ? agent.capabilities : []).slice(0, 20).map((entry) => text(entry, 160)).filter(Boolean),
  };
}

async function getRegistry() {
  const registry = await listCombinedAgentRegistry();
  return { ...registry, agents: Array.isArray(registry.agents) ? registry.agents : [] };
}

async function prepareConversation(body) {
  try {
    return {
      session: await getOrCreateConversation({
        conversationId: text(body.conversationId || body.conversation_id, 100),
        channel: text(body.channel, 50) || "seller_tool",
        scope: text(body.scope, 100) || "seller",
      }),
      warnings: [],
    };
  } catch {
    return {
      session: {
        id: text(body.conversationId || body.conversation_id, 100) || crypto.randomUUID(),
        channel: text(body.channel, 50) || "seller_tool",
        scope: text(body.scope, 100) || "seller",
        summary: "",
      },
      warnings: ["conversation_session_unavailable"],
    };
  }
}

async function persistBrainState(command, brain, session, warnings = []) {
  if (!session?.id) return { workingMemory: null, warnings };
  try {
    const deterministic = parseWorkingMemoryCommand(command) || {};
    const candidate = brain?.workingMemoryUpdate?.shouldUpdate ? brain.workingMemoryUpdate : {};
    const current = await readWorkingMemory({ conversationId: session.id, scope: session.scope });
    const mergedCandidate = { ...candidate, ...deterministic };
    for (const key of ["openTasks", "blockers", "pendingApprovals"]) {
      if (Array.isArray(deterministic[key])) mergedCandidate[key] = [...(current?.state?.[key] || []), ...deterministic[key]];
    }
    const state = mergeWorkingMemoryState(current?.state || {}, mergedCandidate);
    const stored = await upsertWorkingMemory({ conversationId: session.id, scope: session.scope, state, source: "jarvis_brain_v2_a1" });
    const summary = buildWorkingMemorySummary(stored.state);
    if (summary) await updateConversationSummary({ conversationId: session.id, summary });
    return { workingMemory: stored.state, warnings };
  } catch {
    return { workingMemory: null, warnings: [...warnings, "working_memory_unavailable"] };
  }
}

function compactRun(run = {}) {
  const result = plainObject(run?.payload?.result || run?.payload?.task?.result);
  return {
    agentId: text(run.agentId, 100),
    agentName: text(run.agentName, 160),
    capability: text(run.capability, 100),
    ok: run.ok === true,
    status: text(result.status || run?.payload?.task?.status, 100),
    summary: text(result.summary || run.message, 2000),
    blockers: (Array.isArray(result.blockers) ? result.blockers : []).slice(0, 10).map((entry) => text(entry, 700)).filter(Boolean),
    warnings: (Array.isArray(result.warnings) ? result.warnings : []).slice(0, 10).map((entry) => text(entry, 700)).filter(Boolean),
  };
}

function compactScout(scout = {}) {
  return {
    ok: scout.ok === true,
    summary: text(scout.summary, 3000),
    warnings: (Array.isArray(scout.warnings) ? scout.warnings : []).slice(0, 10).map((entry) => text(entry, 700)).filter(Boolean),
    candidates: (Array.isArray(scout.candidates) ? scout.candidates : []).slice(0, 12).map((item) => ({
      rank: Number(item.rank || 0) || null,
      productName: text(item.productName, 500),
      category: text(item.category, 300),
      status: text(item.status, 100),
      demandSignal: text(item.demandSignal, 500),
      competitionLevel: text(item.competitionLevel, 100),
      riskLevel: text(item.riskLevel, 100),
      purchasePrice: item.purchasePrice ?? null,
      sellingPrice: item.sellingPrice ?? null,
      estimatedMarginPercent: item.estimatedMarginPercent ?? null,
      rationale: text(item.rationale, 1200),
      supplierUrl: text(item.supplierUrl, 1200),
    })),
  };
}

function manualReason(reason) {
  return ({
    explicit_plan_only: "Du hast ausdrücklich nur einen Plan angefordert.",
    custom_agent_requires_manual_start: "Ein Custom-Agent wird nicht automatisch gestartet.",
    capability_not_auto_safe: "Diese Fähigkeit liegt außerhalb der freigegebenen Auto-Delegation.",
    user_approval_required: "Für diesen Schritt ist deine Freigabe erforderlich.",
    routing_confidence_too_low: "Die Zuordnung zu einem Mitarbeiter ist noch nicht eindeutig genug.",
    too_many_delegations: "Der Auftrag würde zu viele Mitarbeiter gleichzeitig automatisch starten.",
  })[reason] || "Dieser Auftrag bleibt bewusst im manuellen Plan-Modus.";
}

async function runBrainResponse({ command, registry, plan, body, session, warnings, executionContext = null }) {
  const context = {
    ...plainObject(body.context),
    jarvisConversationId: session.id,
    ...(executionContext ? { autoDelegation: safeJson(executionContext) } : {}),
  };
  const brain = await executeBrain(command, registry, plan, { ...body, context });
  const stateResult = await persistBrainState(command, brain, session, warnings);
  return { brain, stateResult };
}

async function appendAssistant(session, content, warnings) {
  if (!content) return;
  try {
    await appendConversationMessage({ conversationId: session.id, role: "assistant", content });
  } catch {
    warnings.push("conversation_history_unavailable");
  }
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Elyon-Jarvis", "brain-v2-a1-auto");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const registry = await getRegistry();
      return res.status(200).json({
        ok: true,
        version: 2.1,
        phase: "Brain V2-A.1",
        jarvis: "ready",
        mode: "brain_auto_orchestrator",
        agents: registry.agents.map(publicAgent),
        capabilities: Object.keys(CAPABILITY_PROFILES),
        brain: {
          enabled: true,
          version: "2-A.1",
          generalConversation: true,
          durableMemory: "supabase",
          workingMemory: true,
          conversationSessions: true,
          automaticDelegation: true,
          autoDelegationScope: "safe_internal_analysis_only",
          semanticMemory: false,
          experienceLearning: false,
        },
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          supplierOrderingAllowed: false,
          refundsAllowed: false,
          customerMessagingAllowed: false,
          legalDataMutationAllowed: false,
          complianceFindingsAutoApply: false,
          maxAutoDelegations: 3,
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
    }

    const body = plainObject(req.body);
    const command = text(body.command || body.objective || body.taskPrompt || body.prompt, 12000);
    if (!command) return res.status(400).json({ ok: false, error: "jarvis_command_required", message: "Jarvis benötigt einen Auftrag oder ein Ziel." });
    if (body.execute === true || text(body.mode, 30).toLowerCase() === "execute") {
      return res.status(400).json({ ok: false, error: "explicit_execute_use_primary_route", message: "Explizite Ausführung läuft weiterhin über den geschützten Jarvis-Ausführungspfad." });
    }

    const registry = await getRegistry();
    const plan = createJarvisPlan({
      command,
      agents: registry.agents,
      explicitAgentId: text(body.agentId, 100),
      requestedCapability: text(body.capability, 100),
      maxAgents: body.maxAgents,
    });

    if (plan.status === "blocked") {
      return res.status(403).json({
        ok: false,
        error: "jarvis_action_blocked",
        phase: "Brain V2-A.1",
        plan,
        safety: { externalActionsLocked: true, livePublishingAllowed: false, autoDelegationStopped: true },
      });
    }

    const conversationResult = await prepareConversation(body);
    const session = conversationResult.session;
    const warnings = conversationResult.warnings;
    try {
      await appendConversationMessage({ conversationId: session.id, role: "user", content: command });
    } catch {
      warnings.push("conversation_history_unavailable");
    }

    const marketScoutRequest = isMarketScoutCommand(command, plan);
    if (marketScoutRequest) {
      if (body.autoDelegate === false || isExplicitPlanOnly(command)) {
        return res.status(200).json({
          ok: true,
          phase: "Brain V2-A.1",
          mode: "plan",
          conversationId: session.id,
          marketScoutPlan: {
            handler: "product-discovery-v1",
            requestedCount: Math.min(20, Number(command.match(/\b(\d{1,3})\s*(?:produkt|ideen|kandidaten)/i)?.[1] || 10)),
            draftOnly: true,
            execution: "manual_plan_only",
            externalActionsLocked: true,
          },
          plan: { ...plan, status: "ready", executable: true, handler: "product-discovery-v1" },
          summary: { status: "ready", summary: "Die Recherche ist geplant, aber nicht gestartet.", successful: 0, failed: 0, blockers: [], warnings: [] },
          safety: { externalActionsLocked: true, livePublishingAllowed: false, nothingExecuted: true },
        });
      }

      const scout = await runMarketScout({ command });
      const answer = text(scout.summary, 12000) || "Der Market-Scout-Auftrag konnte nicht vorbereitet werden.";
      const stateResult = await persistBrainState(command, scout.ok === true ? {
        workingMemoryUpdate: {
          shouldUpdate: true,
          openTasks: [`Market Scout ${text(scout.task?.id, 120)}: ${Number(scout.requestedCount || 0)} Produktkandidaten recherchieren`],
          lastAction: "Market Scout als Hintergrundrecherche gestartet",
          nextExpectedAction: "Market-Scout-Ergebnis prüfen und geeignete Kandidaten in Product Check & Enrichment übergeben",
        },
      } : { workingMemoryUpdate: { shouldUpdate: false } }, session, warnings);
      await appendAssistant(session, answer, stateResult.warnings);
      const queued = scout.ok === true && scout.status === "queued";
      return res.status(200).json({
        ok: true,
        phase: "Brain V2-A.1",
        mode: queued ? "brain_async_delegated" : "brain_auto_delegated",
        answer,
        conversationId: session.id,
        conversation: { id: session.id, channel: session.channel, scope: session.scope },
        workingMemory: stateResult.workingMemory,
        contextWarnings: stateResult.warnings,
        marketScout: scout,
        autoDelegation: {
          executed: scout.ok === true,
          type: "market_scout",
          readOnly: true,
          async: queued,
          status: queued ? "queued" : "failed",
          successful: scout.ok === true,
        },
        plan: {
          ...plan,
          status: queued ? "queued" : "needs_attention",
          executable: false,
          answerDirectly: true,
          brainHandled: true,
          autoDelegated: scout.ok === true,
          handler: "product-discovery-v1-async",
        },
        summary: {
          status: queued ? "queued" : "partial",
          summary: answer,
          successful: scout.ok === true ? 1 : 0,
          failed: scout.ok === true ? 0 : 1,
          blockers: [],
          warnings: scout.warnings || [],
        },
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          draftOnly: true,
          readOnlyResearch: true,
          nothingMutated: true,
          browserIndependent: queued,
        },
      });
    }

    if (isBrainFirstCommand(command) || shouldRouteToBrain(body, plan, command)) {
      const { brain, stateResult } = await runBrainResponse({ command, registry, plan, body, session, warnings });
      const answer = text(brain.answer || brain.message, 12000);
      await appendAssistant(session, answer, stateResult.warnings);
      const statusCode = brain.ok === false ? (brain.mode === "brain_degraded" ? 503 : 502) : 200;
      return res.status(statusCode).json({
        ...brain,
        phase: "Brain V2-A.1",
        conversationId: session.id,
        conversation: { id: session.id, channel: session.channel, scope: session.scope },
        workingMemory: stateResult.workingMemory,
        contextWarnings: stateResult.warnings,
        plan: { ...plan, answerDirectly: true, brainHandled: true },
        summary: {
          status: brain.ok === false ? "failed" : "completed",
          summary: answer,
          successful: brain.ok === false ? 0 : 1,
          failed: brain.ok === false ? 1 : 0,
          blockers: [],
          warnings: [...(Array.isArray(brain?.context?.warnings) ? brain.context.warnings : []), ...stateResult.warnings],
        },
        safety: { externalActionsLocked: true, livePublishingAllowed: false, answerDirectly: true, nothingExecuted: true, durableMemoryEnabled: true },
      });
    }

    const decision = autoDelegationDecision({ body: { ...body, autoDelegate: body.autoDelegate !== false }, plan, command });
    if (decision.allowed) {
      const executionBody = { ...body, conversationId: session.id, scope: session.scope, stopOnBlocker: body.stopOnBlocker !== false };
      const runs = await executePlan(req, plan, executionBody);
      const runSummary = summarizeJarvisRuns(plan, runs);
      const compactRuns = runs.map(compactRun);
      const { brain, stateResult } = await runBrainResponse({
        command,
        registry,
        plan,
        body,
        session,
        warnings,
        executionContext: {
          type: "specialist_delegation",
          executed: true,
          internalOnly: true,
          policyReason: decision.reason,
          runs: compactRuns,
          summary: runSummary,
        },
      });
      const fallback = runSummary.summary || "Ich habe die passenden internen Spezialisten automatisch beauftragt.";
      const answer = brain?.ok === false ? fallback : text(brain.answer, 12000);
      await appendAssistant(session, answer, stateResult.warnings);
      return res.status(200).json({
        ...brain,
        ok: true,
        phase: "Brain V2-A.1",
        mode: "brain_auto_delegated",
        answer,
        conversationId: session.id,
        conversation: { id: session.id, channel: session.channel, scope: session.scope },
        workingMemory: stateResult.workingMemory,
        contextWarnings: stateResult.warnings,
        autoDelegation: {
          executed: true,
          internalOnly: true,
          policyReason: decision.reason,
          agentIds: decision.agentIds,
          capabilities: decision.capabilities,
          successful: runs.filter((run) => run.ok).length,
          failed: runs.filter((run) => !run.ok).length,
        },
        plan: { ...plan, status: runSummary.status === "completed" ? "completed" : plan.status, executable: false, answerDirectly: true, brainHandled: true, autoDelegated: true },
        runs,
        summary: { ...runSummary, summary: answer },
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          internalDelegationOnly: true,
          complianceFindingsAutoApply: false,
          stopOnBlocker: body.stopOnBlocker !== false,
        },
      });
    }

    if (plan.executable) {
      return res.status(200).json({
        ok: true,
        phase: "Brain V2-A.1",
        mode: "plan",
        conversationId: session.id,
        autoDelegation: { executed: false, reason: decision.reason, message: manualReason(decision.reason) },
        plan,
        summary: { ...summarizeJarvisRuns(plan, []), summary: manualReason(decision.reason) },
        safety: { externalActionsLocked: true, livePublishingAllowed: false, nothingExecuted: true },
      });
    }

    const { brain, stateResult } = await runBrainResponse({ command, registry, plan, body, session, warnings });
    const answer = text(brain.answer || brain.message, 12000);
    await appendAssistant(session, answer, stateResult.warnings);
    return res.status(brain.ok === false ? 503 : 200).json({
      ...brain,
      phase: "Brain V2-A.1",
      conversationId: session.id,
      workingMemory: stateResult.workingMemory,
      contextWarnings: stateResult.warnings,
      plan: { ...plan, answerDirectly: true, brainHandled: true },
      summary: { status: brain.ok === false ? "failed" : "completed", summary: answer, successful: brain.ok === false ? 0 : 1, failed: brain.ok === false ? 1 : 0, blockers: [], warnings: stateResult.warnings },
      safety: { externalActionsLocked: true, livePublishingAllowed: false, nothingExecuted: true },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "jarvis_auto_orchestration_failed", message: text(error?.message, 2000) || "Jarvis konnte den Auftrag nicht automatisch orchestrieren." });
  }
}

export { compactRun, compactScout, manualReason, persistBrainState, prepareConversation, runBrainResponse };
