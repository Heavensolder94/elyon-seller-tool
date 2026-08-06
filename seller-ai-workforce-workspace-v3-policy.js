(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function modeLevel(mode) {
    return { off: 0, manual: 1, assisted: 2, semi: 3, auto_internal: 4, auto_external: 5 }[mode] || 0;
  }

  function normalizeManagerTask(task) {
    if (!task || task.agentId !== "elyon-manager" || task.result?.status !== "manualReviewRequired") return false;
    const settings = readJson(SETTINGS_KEY, {});
    const manager = settings.agents?.["elyon-manager"] || {};
    if (modeLevel(manager.autonomyMode || manager.autonomy?.mode) < 4) return false;
    const blockers = Array.isArray(task.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    if (blockers.length) return false;
    const warnings = Array.isArray(task.result?.warnings) ? task.result.warnings.filter(Boolean) : [];
    const list = readJson(TASKS_KEY, []);
    if (!Array.isArray(list)) return false;
    const index = list.findIndex((entry) => entry?.id === task.id);
    if (index < 0) return false;
    list[index] = {
      ...list[index],
      result: {
        ...list[index].result,
        status: warnings.length ? "warning" : "passed",
        generatedContent: {
          ...(list[index].result?.generatedContent || {}),
          automaticContinuationApproved: true,
        },
      },
    };
    localStorage.setItem(TASKS_KEY, JSON.stringify(list));
    return true;
  }

  window.addEventListener("elyon:ai-workforce-v2-task-updated", (event) => {
    if (normalizeManagerTask(event.detail)) {
      window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v3-manager-normalized", { detail: { taskId: event.detail.id } }));
    }
  });

  window.ElyonAIWorkforceWorkspaceV3Policy = { normalizeManagerTask };
})();
