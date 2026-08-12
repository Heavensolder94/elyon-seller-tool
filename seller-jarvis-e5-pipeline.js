(() => {
  "use strict";

  const PANEL_ID = "elyonJarvisE5PipelinePanel";
  const TAB_ID = "jarvisCommandCenterTab";
  const STYLE_ID = "elyonJarvisE5PipelineStyles";
  const API_URL = "/api/jarvis-pipeline-control";
  const state = { loading: false, saving: false, snapshot: null, error: "" };

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function active() {
    const tab = document.getElementById(TAB_ID);
    const menu = document.getElementById("mainMenu");
    return Boolean(tab?.classList.contains("active") || menu?.value === TAB_ID);
  }

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .jarvis-e5{margin:14px 0;padding:14px 16px;border-radius:18px;border:1px solid rgba(34,211,238,.15);background:rgba(8,24,39,.78)}
      .jarvis-e5-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.jarvis-e5-head strong{font-size:11px;letter-spacing:.05em}.jarvis-e5-head p{margin:5px 0 0;color:#8294aa;font-size:8px;line-height:1.5}
      .jarvis-e5-toggle{display:flex;gap:7px;align-items:center;padding:7px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.15);background:rgba(255,255,255,.035);color:#cbd5e1;font-size:8px;font-weight:850}.jarvis-e5-toggle input{accent-color:#22d3ee}
      .jarvis-e5-flow{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:12px}.jarvis-e5-step{padding:6px 7px;border-radius:9px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.09);font-size:8px;color:#9fb0c3}.jarvis-e5-arrow{color:#4f657c;font-size:8px}.jarvis-e5-state{margin-top:10px;padding:9px 11px;border-radius:11px;background:rgba(15,23,42,.48);color:#91a4ba;font-size:8px;line-height:1.5}.jarvis-e5-state strong{color:#dbeafe}.jarvis-e5-state.blocked{border:1px solid rgba(245,158,11,.15);color:#f7d58b}.jarvis-e5-error{margin-top:8px;color:#fca5a5;font-size:8px}
      @media(max-width:620px){.jarvis-e5-head{flex-direction:column}.jarvis-e5-flow{align-items:stretch}.jarvis-e5-step{flex:1 1 45%}.jarvis-e5-arrow{display:none}}
    `;
    document.head.appendChild(style);
  }

  function modeLabel() {
    return { manual: "MANUELL", assisted: "ASSISTIERT", autopilot: "AUTOPILOT" }[text(state.snapshot?.control?.mode).toLowerCase()] || "MANUELL";
  }

  function render() {
    styles();
    const shell = document.getElementById(TAB_ID)?.querySelector(".jarvis-cc");
    if (!shell) return false;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.className = "jarvis-e5";
      const e4 = document.getElementById("elyonJarvisE4ControlPanel");
      if (e4) e4.insertAdjacentElement("afterend", panel);
      else shell.prepend(panel);
    }

    const enabled = state.snapshot?.pipeline?.enabled === true;
    const internal = state.snapshot?.permissions?.internalPipelineAllowed === true;
    const draft = state.snapshot?.permissions?.ebayDraftAllowed === true;
    const reasons = Array.isArray(state.snapshot?.reasons) ? state.snapshot.reasons : [];
    panel.innerHTML = `
      <div class="jarvis-e5-head">
        <div><strong>⇢ E5 · Vollständige Produktpipeline</strong><p>Verwendet die vorhandene Company-OS-Auto-Pipeline. Kein zweites Workflow-System. Endstation bleibt immer der unveröffentlichte eBay-Entwurf mit manueller Prüfung.</p></div>
        <label class="jarvis-e5-toggle"><input type="checkbox" data-jarvis-e5-enabled ${enabled ? "checked" : ""} ${state.saving ? "disabled" : ""}> PIPELINE ${enabled ? "AN" : "AUS"}</label>
      </div>
      <div class="jarvis-e5-flow">
        ${["Nova", "Produktprüfung", "Markt + Marge", "Listing Designer", "Auto Lister", "eBay ENTWURF", "STOPP / Prüfung"].map((step, index, all) => `<span class="jarvis-e5-step">${escapeHtml(step)}</span>${index < all.length - 1 ? '<span class="jarvis-e5-arrow">→</span>' : ""}`).join("")}
      </div>
      <div class="jarvis-e5-state${internal ? "" : " blocked"}">
        <strong>${enabled ? modeLabel() : "DEAKTIVIERT"}</strong> · ${!enabled ? "Neue Produkte starten die E5-Pipeline nicht." : internal ? (draft ? "Interne Schritte und genau ein unveröffentlichter eBay-Draft sind erlaubt. Danach STOPP." : "Interne Schritte laufen; vor dem eBay-Draft wartet Elyon auf AUTOPILOT-Freigabe.") : `Pipeline wartet: ${escapeHtml(reasons.join(", ") || "Jarvis-Control blockiert die Automation")}`}
      </div>
      ${state.error ? `<div class="jarvis-e5-error">${escapeHtml(state.error)}</div>` : ""}`;
    return true;
  }

  async function request(options = {}) {
    const response = await fetch(API_URL, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
    return data;
  }

  async function refresh() {
    if (state.loading || !active()) return false;
    state.loading = true;
    try {
      state.snapshot = await request({ method: "GET" });
      state.error = "";
    } catch (error) {
      state.error = text(error?.message, "Pipeline-Control nicht erreichbar.");
    } finally {
      state.loading = false;
      render();
    }
    return true;
  }

  async function save(enabled) {
    if (state.saving) return;
    state.saving = true;
    render();
    try {
      state.snapshot = await request({ method: "POST", body: JSON.stringify({ enabled: enabled === true }) });
      state.error = "";
      window.dispatchEvent(new CustomEvent("elyon:jarvis-e5-control-changed", { detail: { enabled: enabled === true } }));
    } catch (error) {
      state.error = text(error?.message, "Pipeline-Control konnte nicht gespeichert werden.");
    } finally {
      state.saving = false;
      render();
    }
  }

  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("[data-jarvis-e5-enabled]")) save(event.target.checked);
    if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) window.setTimeout(refresh, 250);
  }, true);
  window.addEventListener("elyon:jarvis-e4-control-changed", () => { if (active()) refresh(); });
  window.addEventListener("elyon:seller-authenticated", () => { if (active()) window.setTimeout(refresh, 250); });

  window.ElyonJarvisE5Pipeline = Object.freeze({ refresh, render, state: () => ({ ...state }) });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
