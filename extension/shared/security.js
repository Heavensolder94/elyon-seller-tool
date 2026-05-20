export const SECURITY_STORAGE_KEY = "elyon_extension_security_settings";

export const DEFAULT_SECURITY_STATE = {
  securityMode: true,
  sandboxMode: true,
  autonomyLocked: true,
  pauseAllAgents: false,
  aiEnabled: false
};

const ACTION_TYPES = {
  SAVE_PRODUCT: "save_product",
  RESEARCH_SAVE: "research_save",
  AI_PREPARE: "ai_prepare",
  LIVE_ORDER: "live_order",
  LIVE_LISTING: "live_listing",
  LIVE_MESSAGE: "live_message",
  LIVE_SEND: "live_send",
  AUTO_ACTION: "auto_action"
};

function normalizeState(state = {}) {
  return {
    securityMode: state.securityMode !== false,
    sandboxMode: state.sandboxMode !== false,
    autonomyLocked: state.autonomyLocked !== false,
    pauseAllAgents: state.pauseAllAgents === true,
    aiEnabled: state.aiEnabled === true
  };
}

export async function getSecurityState() {
  try {
    const result = await chrome.storage.local.get(SECURITY_STORAGE_KEY);
    return normalizeState({ ...DEFAULT_SECURITY_STATE, ...(result[SECURITY_STORAGE_KEY] || {}) });
  } catch {
    return normalizeState(DEFAULT_SECURITY_STATE);
  }
}

export async function setSecurityState(nextState = {}) {
  const current = await getSecurityState();
  const merged = normalizeState({ ...current, ...nextState });
  await chrome.storage.local.set({ [SECURITY_STORAGE_KEY]: merged });
  return merged;
}

export function canRunAction(actionType, securityState = DEFAULT_SECURITY_STATE) {
  const state = normalizeState(securityState);
  const type = String(actionType || "").toLowerCase();
  const liveAction =
    type === ACTION_TYPES.LIVE_ORDER ||
    type === ACTION_TYPES.LIVE_LISTING ||
    type === ACTION_TYPES.LIVE_MESSAGE ||
    type === ACTION_TYPES.LIVE_SEND ||
    type === ACTION_TYPES.AUTO_ACTION;

  if (state.securityMode && liveAction) {
    return {
      allowed: false,
      reason: "Live-Aktion blockiert",
      label: "Live-Aktion blockiert"
    };
  }

  if (state.sandboxMode) {
    return {
      allowed: !liveAction,
      reason: "Sandbox aktiv",
      label: "Sandbox aktiv"
    };
  }

  if (state.autonomyLocked && type === ACTION_TYPES.AUTO_ACTION) {
    return {
      allowed: false,
      reason: "Sicherheitsfreigabe erforderlich",
      label: "Sicherheitsfreigabe erforderlich"
    };
  }

  if (!state.aiEnabled && type === ACTION_TYPES.AI_PREPARE) {
    return {
      allowed: true,
      reason: "Vorbereitet, aber gesperrt",
      label: "Vorbereitet, aber gesperrt"
    };
  }

  return {
    allowed: true,
    reason: "Aktion vorbereitet",
    label: state.securityMode || state.sandboxMode || state.autonomyLocked ? "Vorbereitet, aber gesperrt" : "aktiv"
  };
}

export function getSecurityLabel(securityState = DEFAULT_SECURITY_STATE) {
  const state = normalizeState(securityState);
  if (state.securityMode) return "Live-Aktion blockiert";
  if (state.sandboxMode) return "Sandbox aktiv";
  if (state.autonomyLocked) return "Sicherheitsfreigabe erforderlich";
  if (!state.aiEnabled) return "Vorbereitet, aber gesperrt";
  return "aktiv";
}

export function isLiveActionType(actionType) {
  return [
    ACTION_TYPES.LIVE_ORDER,
    ACTION_TYPES.LIVE_LISTING,
    ACTION_TYPES.LIVE_MESSAGE,
    ACTION_TYPES.LIVE_SEND,
    ACTION_TYPES.AUTO_ACTION
  ].includes(String(actionType || "").toLowerCase());
}

export function getActionLabel(actionType, securityState) {
  const decision = canRunAction(actionType, securityState);
  return decision.label;
}
