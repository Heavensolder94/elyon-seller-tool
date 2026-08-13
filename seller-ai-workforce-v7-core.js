(() => {
  "use strict";
  const TASK_KEYS = ["elyon_ai_workforce_tasks", "elyon_ai_tasks"];
  const SOURCE = {
    "elyon-operations-manager": "elyon-manager",
    "elyon-product-data-checker": "elyon-product-data-specialist",
    "elyon-compliance-guard": "elyon-compliance-specialist",
    "elyon-profit-analyst": "elyon-profit-specialist",
    "elyon-listing-pro": "elyon-listing-specialist",
    "elyon-order-coordinator": "elyon-order-specialist",
    "elyon-support-assistant": "elyon-customer-support-specialist"
  };
  const TEAM = [
    ["product","📦","Product Manager",["elyon-product-data-specialist","elyon-compliance-specialist","elyon-profit-specialist"],"Produktdaten, Compliance, Risiken und Wirtschaftlichkeit."],
    ["listing","✍️","Listing Manager",["elyon-listing-specialist","elyon-draft-quality-guard"],"Erstellt und prüft deine eBay-Entwürfe."],
    ["operations","🚚","Operations Manager",["elyon-order-specialist"],"Bestellungen, Versand, Tracking und Ausnahmen."],
    ["care","💬","Customer Care",["elyon-customer-support-specialist"],"Kundenservice, Reklamationen und Retouren."]
  ].map(([id,icon,name,agents,description]) => ({ id, icon, name, agents, description }));
  const text = (value, fallback = "") => value == null ? fallback : String(value).trim();
  const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value == null ? fallback : value; } catch { return fallback; } };
  const stamp = (item) => { const value = Date.parse(text(item?.updatedAt || item?.completedAt || item?.createdAt || item?.timestamp)); return Number.isFinite(value) ? value : 0; };
  function tasks() {
    const map = new Map();
    for (const key of TASK_KEYS) for (const task of (Array.isArray(read(key, [])) ? read(key, []) : [])) {
      if (!task) continue;
      const id = text(task.id) || `${text(task.agentId)}:${text(task.title)}:${text(task.createdAt)}`;
      const current = map.get(id);
      if (id && (!current || stamp(task) >= stamp(current))) map.set(id, task);
    }
    return [...map.values()].sort((a,b) => stamp(b) - stamp(a));
  }
  function agent(task) { const id = text(task?.agentId || task?.assigneeId); return SOURCE[id] || id; }
  function group(task) {
    const value = text(task?.result?.status || task?.status, "idle").toLowerCase();
    if (/blocked|failed|error|rejected/.test(value)) return "attention";
    if (/warning|manualreviewrequired|approval|review|draft_ready/.test(value)) return "decision";
    if (/running|analyzing|processing|queued/.test(value)) return "running";
    if (/passed|completed|approved|done|success|ready/.test(value)) return "done";
    return "idle";
  }
  function memberTasks(member) { const ids = new Set(member.agents); return tasks().filter((task) => ids.has(agent(task))); }
  function memberForTask(task) { const id = agent(task); return TEAM.find((member) => member.agents.includes(id)) || null; }
  window.ElyonAIWorkforceV7Core = { TEAM, TASK_KEYS, text, read, stamp, tasks, group, agent, memberTasks, memberForTask };
})();
