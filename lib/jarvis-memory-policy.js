const ALLOWED_MEMORY_TYPES = new Set([
  "business_rule",
  "decision",
  "experience",
  "preference",
  "workflow_state",
  "system_fact",
  "conversation_summary",
  "user_instruction",
  "agent_learning",
  "product_learning",
]);

const SENSITIVE_TEXT = /(?:\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwort|secret|token|bearer|cookie|authorization|private key|service[_ -]?role)\b|\b(?:sk|ghp|github_pat|xox[baprs]|sb_secret)_[a-z0-9_-]{8,}\b|\beyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b)/i;

function text(value, max = 8000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function explicitMemoryFromCommand(command) {
  const source = text(command, 12000);
  const match = source.match(/(?:^|\b)(?:merke\s+dir|merk\s+dir|remember|speichere\s+(?:dir\s+)?(?:ab|das)?)[\s:,-]*(.+)$/i);
  const content = text(match?.[1], 4000);
  if (!content || SENSITIVE_TEXT.test(content)) return null;
  return {
    shouldStore: true,
    memoryType: "user_instruction",
    content: { instruction: content },
    importance: 0.95,
    confidence: 1,
    source: "user_explicit_memory",
  };
}

function normalizeBrainMemoryCandidate(candidate, command = "") {
  const explicit = explicitMemoryFromCommand(command);
  if (explicit) return explicit;

  if (!candidate || typeof candidate !== "object" || candidate.shouldStore !== true) return null;
  const memoryType = text(candidate.memoryType || candidate.type, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (!ALLOWED_MEMORY_TYPES.has(memoryType)) return null;
  const importance = clamp01(candidate.importance, 0.5);
  const confidence = clamp01(candidate.confidence, 0.5);
  if (importance < 0.8 || confidence < 0.8) return null;

  const summary = text(candidate.summary || candidate.content?.summary || candidate.content, 4000);
  if (!summary || SENSITIVE_TEXT.test(summary)) return null;
  return {
    shouldStore: true,
    memoryType,
    content: { summary },
    importance,
    confidence,
    source: "jarvis_brain_v1",
  };
}

function containsSensitiveText(value) {
  return SENSITIVE_TEXT.test(text(value, 12000));
}

export { ALLOWED_MEMORY_TYPES, containsSensitiveText, explicitMemoryFromCommand, normalizeBrainMemoryCandidate };
