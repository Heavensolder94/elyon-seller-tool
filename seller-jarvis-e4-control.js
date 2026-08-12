(() => {
  "use strict";

  const PANEL_ID = "elyonJarvisE4ControlPanel";
  const TAB_ID = "jarvisCommandCenterTab";
  const STYLE_ID = "elyonJarvisE4ControlStyles";
  const state = { loading: false, saving: false, snapshot: null, error: "" };

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .jarvis-e4{margin:14px 0;padding:16px;border-radius:18px;border:1px solid rgba(56,189,248,.16);background:linear-gradient(145deg,rgba(7,18,34,.92),rgba(10,25,43,.82));box-shadow:0 18px 55px rgba(2,8,23,.22)}
      .jarvis-e4-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.jarvis-e4-title strong{display:block;font-size:12px;letter-spacing:.06em}.jarvis-e4-title span{display:block;margin-top:5px;color:#8ca0b8;font-size:9px;line-height:1.45}.jarvis-e4-state{padding:6px 9px;border-radius:999px;font-size:8px;font-weight:900;letter-spacing:.07em;border:1px solid rgba(34,197,94,.2);background:rgba(34,197,94,.08);color:#86efac}.jarvis-e4-state.paused{border-color:rgba(245,158,11,.2);background:rgba(245,158,11,.08);color:#fde68a}.jarvis-e4-state.stopped{border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.09);color:#fca5a5}.jarvis-e4-state.throttled{border-color:rgba(250,204,21,.22);background:rgba(250,204,21,.08);color:#fde047}
      .jarvis-e4-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}.jarvis-e4-mode{padding:10px 8px;border-radius:12px;border:1px solid rgba(148,163,184,.14);background:rgba(255,255,255,.035);color:#b8c5d6;font-size:9px;font-weight:800;cursor:pointer}.jarvis-e4-mode.active{border-color:rgba(56,189,248,.36);background:rgba(14,165,233,.11);color:#e0f2fe}.jarvis-e4-mode:disabled{opacity:.5;cursor:default}
      .jarvis-e4-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.jarvis-e4-kpi{padding:10px;border-radius:13px;background:rgba(255,255,255,.028);border:1px solid rgba(148,163,184,.1)}.jarvis-e4-kpi small{display:block;color:#74869b;font-size:8px;text-transform:uppercase;letter-spacing:.06em}.jarvis-e4-kpi strong{display:block;margin-top:5px;font-size:12px;color:#dce7f5}.jarvis-e4-kpi span{display:block;margin-top:3px;font-size:8px;color:#8294aa}
      .jarvis-e4-row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:12px;padding:10px 12px;border-radius:13px;background:rgba(255,255,255,.025);border:1px solid rgba(148,163,184,.09)}.jarvis-e4-row label{display:flex;gap:8px;align-items:center;color:#d4deeb;font-size:9px;font-weight:700}.jarvis-e4-row p{margin:3px 0 0;color:#788a9f;font-size:8px}.jarvis-e4-row input[type=checkbox]{accent-color:#38bdf8}
      .jarvis-e4-stop{padding:9px 11px;border-radius:11px;border:1px solid rgba(239,68,68,.28);background:rgba(127,29,29,.2);color:#fecaca;font-size:9px;font-weight:900;cursor:pointer}.jarvis-e4-stop.engaged{border-color:rgba(34,197,94,.24);background:rgba(20,83,45,.22);color:#bbf7d0}.jarvis-e4-resume{padding:8px 10px;border-radius:10px;border:1px solid rgba(245,158,11,.22);background:rgba(120,53,15,.18);color:#fde68a;font-size:9px;font-weight:800;cursor:pointer}
      .jarvis-e4-warning{margin-top:10px;padding:9px 11px;border-radius:12px;border:1px solid rgba(245,158,11,.16);background:rgba(120,53,15,.1);color:#f8d58a;font-size:8px;line-height:1.5}.jarvis-e4-error{border-color:rgba(239,68,68,.2);background:rgba(127,29,29,.12);color:#fecaca}
      .jarvis-e4 details{margin-top:10px}.jarvis-e4 summary{cursor:pointer;color:#91a4ba;font-size:9px;font-weight:750}.jarvis-e4-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.jarvis-e4-field label{display:block;color:#788a9f;font-size:8px;margin-bottom:4px}.jarvis-e4-field input{width:100%;box-sizing:border-box;padding:8px;border-radius:9px;border:1px solid rgba(148,163,184,.13);background:rgba(2,6,23,.5);color:#dbeafe;font-size:9px}.jarvis-e4-actions{display:flex;justify-content:flex-end;margin-top:9px}.jarvis-e4-save{padding:8px 11px;border-radius:10px;border:1px solid rgba(56,189,248,.2);background:rgba(14,116,144,.18);color:#bae6fd;font-size:9px;font-weight:850;cursor:pointer}.jarvis-e4-save:disabled{opacity:.5}
      .jarvis-e4-locks{margin-top:10px;color:#6f8196;font-size:8px;line-height:1.5}.jarvis-e4-locks strong{color:#9eb0c5}
      @media(max-width:900px){.jarvis-e4-grid,.jarvis-e4-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.jarvis-e4-head,.jarvis-e4-row{align-items:stretch;flex-direction:column}.jarvis-e4-grid,.jarvis-e4-fields,.jarvis-e4-modes{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function commandCenterActive() {
    const tab = document.getElementById(TAB_ID);
    const menu = document.getElementById("mainMenu");
    return Boolean(tab?.classList.contains("active") || menu?.value === TAB_ID);
  }

  function euro(value) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(number(value));
  }

  function integer(value) {
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(number(value));
  }

  function modeLabel(mode) {
    return { manual: "MANUELL", assisted: "ASSISTIERT", autopilot: "AUTOPILOT" }[text(mode).toLowerCase()] || "ASSISTIERT";
  }

  function stateLabel(decision = {}) {
    const value = text(decision.state, "paused");
    return {
      ready: "BEREIT",
      throttled: "GEDROSSELT",
      paused: "PAUSIERT",
      stopped: "NOT-AUS",
    }[value] || value.toUpperCase();
  }

  function pricingWarning(snapshot) {
    if (snapshot?.usage?.pricingComplete !== false) return "";
    const missing = (snapshot?.pricing?.providers || []).filter((item) => item.active && !item.configured).map((item) => item.provider).join(", ");
    return `Kosten-Autonomie pausiert: Für ${escapeHtml(missing || "mindestens einen aktiven KI-Provider")} fehlen serverseitige EUR/1M-Token-Preisraten. Token werden trotzdem gezählt.`;
  }

  function render() {
    installStyles();
    const tab = document.getElementById(TAB_ID);
    const shell = tab?.querySelector(".jarvis-cc");
    if (!shell) return false;

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.className = "jarvis-e4";
      const cloud = document.getElementById("elyonJarvisE1CloudPanel");
      if (cloud) cloud.insertAdjacentElement("afterend", panel);
      else {
        const metrics = shell.querySelector(".jarvis-cc-metrics");
        if (metrics) metrics.insertAdjacentElement("afterend", panel);
        else shell.prepend(panel);
      }
    }

    const snapshot = state.snapshot;
    if (!snapshot) {
      panel.innerHTML = `<div class="jarvis-e4-head"><div class="jarvis-e4-title"><strong>◉ JARVIS AUTOPILOT CONTROL · E4</strong><span>${state.loading ? "Control-Status wird geladen …" : "Noch kein Control-Status geladen."}</span></div><span class="jarvis-e4-state paused">PAUSIERT</span></div>${state.error ? `<div class="jarvis-e4-warning jarvis-e4-error">${escapeHtml(state.error)}</div>` : ""}`;
      return true;
    }

    const control = snapshot.control || {};
    const usage = snapshot.usage || {};
    const decision = snapshot.decision || {};
    const limits = control.limits || {};
    const budget = control.budget || {};
    const guard = control.errorGuard || {};
    const currentMode = text(control.mode, "assisted");
    const stopped = control.killSwitch === true;
    const pausedByGuard = control.pausedByGuard === true;
    const warning = pricingWarning(snapshot);

    panel.innerHTML = `
      <div class="jarvis-e4-head">
        <div class="jarvis-e4-title"><strong>◉ JARVIS AUTOPILOT CONTROL · E4</strong><span>Serverseitige Steuerung für interne Cloud-Automation. Externe Commerce-Aktionen bleiben unabhängig vom Modus gesperrt.</span></div>
        <span class="jarvis-e4-state ${escapeHtml(text(decision.state))}">${escapeHtml(stateLabel(decision))}</span>
      </div>
      <div class="jarvis-e4-modes">
        ${["manual", "assisted", "autopilot"].map((mode) => `<button type="button" class="jarvis-e4-mode ${currentMode === mode ? "active" : ""}" data-jarvis-e4-mode="${mode}" ${state.saving ? "disabled" : ""}>${modeLabel(mode)}</button>`).join("")}
      </div>
      <div class="jarvis-e4-grid">
        <div class="jarvis-e4-kpi"><small>Budget geschätzt</small><strong>${escapeHtml(euro(usage.estimatedCostEur))}</strong><span>Hard Stop ${escapeHtml(euro(budget.hardEur))}</span></div>
        <div class="jarvis-e4-kpi"><small>Tokens Monat</small><strong>${escapeHtml(integer(usage.totalTokens))}</strong><span>Limit ${escapeHtml(integer(limits.maxTokensPerMonth))}</span></div>
        <div class="jarvis-e4-kpi"><small>Jobs Stunde</small><strong>${escapeHtml(integer(usage.jobsThisHour))}</strong><span>Limit ${escapeHtml(integer(limits.maxJobsPerHour))}</span></div>
        <div class="jarvis-e4-kpi"><small>Fehler in Folge</small><strong>${escapeHtml(integer(usage.consecutiveFailures))}</strong><span>Pause ab ${escapeHtml(integer(guard.maxConsecutiveFailures))}</span></div>
      </div>
      <div class="jarvis-e4-row">
        <div><label><input type="checkbox" data-jarvis-e4-nova ${control.automations?.novaAutoReview !== false ? "checked" : ""}> Neue Nova-Produkte intern automatisch prüfen</label><p>Aktuell einziger autonomer Scope: Company OS → nova.product.created → interner Product-Data-Agent.</p></div>
        <button type="button" class="jarvis-e4-stop ${stopped ? "engaged" : ""}" data-jarvis-e4-stop>${stopped ? "NOT-AUS LÖSEN" : "JARVIS SOFORT STOPPEN"}</button>
      </div>
      ${pausedByGuard ? `<div class="jarvis-e4-warning">${escapeHtml(control.pausedReason || "Jarvis wurde wegen wiederholter Fehler automatisch pausiert.")} <button type="button" class="jarvis-e4-resume" data-jarvis-e4-resume>Pause aufheben</button></div>` : ""}
      ${warning ? `<div class="jarvis-e4-warning">${warning}</div>` : ""}
      ${decision.warning && !warning ? `<div class="jarvis-e4-warning">Budget-Warnschwelle erreicht. Jarvis überwacht die verbleibende Sicherheitsreserve.</div>` : ""}
      ${state.error ? `<div class="jarvis-e4-warning jarvis-e4-error">${escapeHtml(state.error)}</div>` : ""}
      <details>
        <summary>Budget & Limits</summary>
        <div class="jarvis-e4-fields">
          <div class="jarvis-e4-field"><label>Monatsbudget €</label><input type="number" min="1" max="500" step="0.5" value="${escapeHtml(number(budget.monthlyEur, 20))}" data-jarvis-e4-field="monthlyEur"></div>
          <div class="jarvis-e4-field"><label>Warnung €</label><input type="number" min="0" max="500" step="0.5" value="${escapeHtml(number(budget.warnEur, 15))}" data-jarvis-e4-field="warnEur"></div>
          <div class="jarvis-e4-field"><label>Soft-Limit €</label><input type="number" min="0" max="500" step="0.5" value="${escapeHtml(number(budget.softEur, 18))}" data-jarvis-e4-field="softEur"></div>
          <div class="jarvis-e4-field"><label>Hard-Stop €</label><input type="number" min="1" max="500" step="0.5" value="${escapeHtml(number(budget.hardEur, 20))}" data-jarvis-e4-field="hardEur"></div>
          <div class="jarvis-e4-field"><label>Jobs / Stunde</label><input type="number" min="1" max="120" step="1" value="${escapeHtml(number(limits.maxJobsPerHour, 12))}" data-jarvis-e4-field="maxJobsPerHour"></div>
          <div class="jarvis-e4-field"><label>Jobs / Tag</label><input type="number" min="1" max="1000" step="1" value="${escapeHtml(number(limits.maxJobsPerDay, 50))}" data-jarvis-e4-field="maxJobsPerDay"></div>
          <div class="jarvis-e4-field"><label>Tokens / Monat</label><input type="number" min="10000" max="100000000" step="10000" value="${escapeHtml(number(limits.maxTokensPerMonth, 2000000))}" data-jarvis-e4-field="maxTokensPerMonth"></div>
          <div class="jarvis-e4-field"><label>Pause nach Fehlern</label><input type="number" min="1" max="10" step="1" value="${escapeHtml(number(guard.maxConsecutiveFailures, 3))}" data-jarvis-e4-field="maxConsecutiveFailures"></div>
        </div>
        <div class="jarvis-e4-actions"><button type="button" class="jarvis-e4-save" data-jarvis-e4-save ${state.saving ? "disabled" : ""}>Einstellungen speichern</button></div>
      </details>
      <div class="jarvis-e4-locks"><strong>Immer gesperrt:</strong> eBay Live-Publish · Live-Preisänderung · Supplier Order · Kundennachricht · Refund · Produktlöschung · rechtliche Daten. Kostenwerte sind Token-basierte Schätzwerte, keine Provider-Rechnung.</div>`;
    return true;
  }

  async function refresh() {
    if (state.loading || !commandCenterActive()) return false;
    state.loading = true;
    state.error = "";
    render();
    try {
      if (!window.ElyonJarvis?.control) throw new Error("Jarvis E4 Control Client ist nicht verfügbar.");
      state.snapshot = await window.ElyonJarvis.control();
    } catch (error) {
      state.error = text(error?.message, "Jarvis E4 Control konnte nicht geladen werden.");
    } finally {
      state.loading = false;
      render();
    }
    return true;
  }

  async function update(patch) {
    if (state.saving) return false;
    state.saving = true;
    state.error = "";
    render();
    try {
      state.snapshot = await window.ElyonJarvis.updateControl(patch);
      window.dispatchEvent(new CustomEvent("elyon:jarvis-control-updated", { detail: { snapshot: state.snapshot } }));
    } catch (error) {
      state.error = text(error?.message, "Jarvis E4 Control konnte nicht gespeichert werden.");
    } finally {
      state.saving = false;
      render();
    }
    return true;
  }

  function settingsPatch() {
    const read = (name, fallback) => number(document.querySelector(`[data-jarvis-e4-field="${name}"]`)?.value, fallback);
    return {
      automations: { novaAutoReview: document.querySelector("[data-jarvis-e4-nova]")?.checked !== false },
      budget: {
        monthlyEur: read("monthlyEur", 20),
        warnEur: read("warnEur", 15),
        softEur: read("softEur", 18),
        hardEur: read("hardEur", 20),
      },
      limits: {
        maxJobsPerHour: read("maxJobsPerHour", 12),
        maxJobsPerDay: read("maxJobsPerDay", 50),
        maxTokensPerMonth: read("maxTokensPerMonth", 2_000_000),
      },
      errorGuard: { maxConsecutiveFailures: read("maxConsecutiveFailures", 3) },
    };
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const modeButton = target.closest("[data-jarvis-e4-mode]");
    if (modeButton) {
      const mode = text(modeButton.getAttribute("data-jarvis-e4-mode"));
      if (mode === "autopilot" && !window.confirm("AUTOPILOT aktivieren? Aktuell darf Jarvis weiterhin nur die freigegebene interne Nova-Produktprüfung autonom ausführen. Externe Aktionen bleiben gesperrt.")) return;
      update({ mode });
      return;
    }
    if (target.closest("[data-jarvis-e4-stop]")) {
      const active = state.snapshot?.control?.killSwitch === true;
      if (active && !window.confirm("Jarvis Not-Aus wieder lösen? Der gespeicherte Modus wird danach wieder wirksam.")) return;
      update({ killSwitch: !active });
      return;
    }
    if (target.closest("[data-jarvis-e4-resume]")) {
      update({ resume: true });
      return;
    }
    if (target.closest("[data-jarvis-e4-save]")) update(settingsPatch());
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) window.setTimeout(refresh, 250);
  }, true);

  window.addEventListener("elyon:seller-authenticated", () => {
    if (commandCenterActive()) window.setTimeout(refresh, 250);
  });
  window.addEventListener("elyon:jarvis-command-center-result", () => {
    if (commandCenterActive()) refresh();
  });

  window.ElyonJarvisE4Control = Object.freeze({
    refresh,
    render,
    state: () => ({ ...state, snapshot: state.snapshot ? structuredClone(state.snapshot) : null }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
