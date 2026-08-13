(() => {
  "use strict";
  const C = window.ElyonAIWorkforceV7Core;
  if (!C) return;
  const ROOT_ID = "elyonAiWorkforceV7";
  const VIEW_KEY = "elyon_ai_workforce_v7_view";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const state = { view: "overview", queued: false, bound: false };
  const esc = (value) => C.text(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const host = () => document.getElementById("virtualAgentsSettingsRoot") || document.getElementById("virtualAgentsTab");
  function summary(task) {
    const blockers = Array.isArray(task?.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    return C.text(task?.result?.summary || blockers[0] || task?.description || task?.message || task?.title, "Keine Zusatzinformation.");
  }
  function autonomy(member) {
    const agents = C.read(SETTINGS_KEY, {}).agents || {};
    const modes = member.agents.map((id) => C.text(agents[id]?.autonomyMode || agents[id]?.autonomy?.mode || "manual"));
    if (modes.every((mode) => ["auto_internal","auto_external"].includes(mode))) return "Autopilot intern";
    if (modes.every((mode) => ["assisted","semi"].includes(mode))) return "Assistiert";
    if (new Set(modes).size > 1) return "Gemischt";
    return "Manuell";
  }
  function aiLabel(member) {
    const routes = member.agents.filter((id) => id !== "elyon-draft-quality-guard").map((id) => window.ElyonAIWorkforceRoutingCenter?.getRoute?.(id)).filter(Boolean);
    if (!routes.length || routes.every((route) => route.provider === "openrouter" && route.model === "openrouter/free")) return "KI automatisch";
    return new Set(routes.map((route) => `${route.provider}:${route.model}`)).size > 1 ? "KI spezialisiert" : `KI · ${C.text(routes[0].provider, "automatisch")}`;
  }
  function metrics() {
    const now = new Date();
    const list = C.tasks().filter((task) => C.stamp(task) && new Date(C.stamp(task)).toDateString() === now.toDateString());
    return { total:list.length, done:list.filter((t)=>C.group(t)==="done").length, running:list.filter((t)=>C.group(t)==="running").length, decisions:list.filter((t)=>["attention","decision"].includes(C.group(t))).length };
  }
  function memberState(member) {
    const list = C.memberTasks(member).slice(0,30);
    if (list.some((t)=>C.group(t)==="running")) return ["running","Arbeitet"];
    if (list.some((t)=>C.group(t)==="attention")) return ["attention","Aufmerksamkeit"];
    if (list.some((t)=>C.group(t)==="decision")) return ["decision","Prüfung nötig"];
    return ["ready","Bereit"];
  }
  function card(member) {
    const [status,label] = memberState(member);
    const list = C.memberTasks(member);
    const current = list.find((t)=>C.group(t)==="running") || list.find((t)=>["attention","decision"].includes(C.group(t))) || list[0];
    const running = list.filter((t)=>C.group(t)==="running").length;
    const decision = list.filter((t)=>["attention","decision"].includes(C.group(t))).length;
    const done = list.filter((t)=>C.group(t)==="done").length;
    return `<article class="aiw7-card"><div class="aiw7-card-top"><div class="aiw7-person"><span class="aiw7-avatar">${member.icon}</span><div><h4>${esc(member.name)}</h4><p>${esc(member.description)}</p></div></div><span class="aiw7-status ${status}">${esc(label)}</span></div><div class="aiw7-now"><small>AKTUELL</small><strong>${esc(current?.title || "Bereit für den nächsten Auftrag")}</strong></div><div class="aiw7-meta"><span class="aiw7-pill">${esc(autonomy(member))}</span><span class="aiw7-pill">${esc(aiLabel(member))}</span></div><div class="aiw7-card-foot"><small>${running} läuft · ${decision} Prüfung · ${done} erledigt</small><div class="aiw7-buttons"><button class="aiw-secondary" data-aiw7-open="${member.id}">Öffnen</button><button class="aiw7-primary" data-aiw7-assign="${member.id}">Auftrag geben</button></div></div></article>`;
  }
  function row(task, actionable=false) {
    const member = C.memberForTask(task);
    return `<div class="aiw7-row"><span>${member?.icon || "🧠"}</span><div><strong>${esc(task?.title || member?.name || "Aufgabe")}</strong><p>${esc(summary(task)).slice(0,190)}</p><small>${esc(member?.name || "Jarvis")} · ${C.group(task)==="running"?"Arbeitet":C.group(task)==="done"?"Erledigt":"Prüfung nötig"}</small></div>${actionable&&member?`<button class="aiw-secondary" data-aiw7-open="${member.id}">Ansehen</button>`:""}</div>`;
  }
  function overview() {
    const m = metrics();
    const recent = C.tasks().slice(0,7);
    const decisions = C.tasks().filter((t)=>["attention","decision"].includes(C.group(t))).slice(0,5);
    return `<div class="aiw7-overview"><section class="aiw7-hero"><div class="aiw7-jarvis"><div class="aiw7-core">🧠</div><div><h3>Jarvis</h3><p>Deine digitale Geschäftsleitung. Jarvis priorisiert, delegiert und bringt nur wichtige Entscheidungen zu dir.</p><span class="aiw7-online">● SYSTEM BEREIT</span></div></div><div class="aiw7-side"><div class="aiw7-metrics"><div class="aiw7-metric"><strong>${m.total}</strong><span>HEUTE</span></div><div class="aiw7-metric"><strong>${m.done}</strong><span>ERLEDIGT</span></div><div class="aiw7-metric"><strong>${m.running}</strong><span>LÄUFT</span></div><div class="aiw7-metric"><strong>${m.decisions}</strong><span>ENTSCHEIDUNGEN</span></div></div><div class="aiw7-actions"><button class="aiw7-primary" data-aiw7-jarvis>Mit Jarvis sprechen</button><button class="aiw-secondary" data-aiw7-decisions>Entscheidungen</button></div></div></section><section><div class="aiw7-head"><div><h3>Deine virtuelle Firma</h3><p>Vier Business-Mitarbeiter. Technische Skills und Modelle arbeiten im Hintergrund.</p></div></div><div class="aiw7-grid" style="margin-top:9px">${C.TEAM.map(card).join("")}</div></section><div class="aiw7-lower"><section class="aiw7-panel"><div class="aiw7-panel-head"><h3>Letzte Aktivität</h3></div><div class="aiw7-list">${recent.length?recent.map((t)=>row(t)).join(""):'<div class="aiw7-empty">Noch keine Aktivität vorhanden.</div>'}</div></section><section class="aiw7-panel" id="elyonAiWorkforceV7Decisions"><div class="aiw7-panel-head"><h3>Braucht deine Entscheidung</h3><span class="aiw7-pill">${decisions.length}</span></div><div class="aiw7-list">${decisions.length?decisions.map((t)=>row(t,true)).join(""):'<div class="aiw7-empty">Aktuell wartet nichts auf deine Entscheidung.</div>'}</div></section></div></div>`;
  }
  function render() {
    const mount = host(); if (!mount) return false;
    let root = document.getElementById(ROOT_ID);
    if (!root || root.parentElement !== mount) { root?.remove(); root=document.createElement("section"); root.id=ROOT_ID; mount.prepend(root); }
    mount.classList.toggle("aiw-v7-overview-active", state.view === "overview");
    root.innerHTML = `<div class="aiw7-bar"><div><h2>Virtuelle Mitarbeiter</h2><p>Jarvis führt die Firma. Du steuerst nur noch Ziele, Entscheidungen und Freigaben.</p></div><div class="aiw7-switch"><button data-aiw7-view="overview" class="${state.view==="overview"?"active":""}">🏢 Übersicht</button><button data-aiw7-view="advanced" class="${state.view==="advanced"?"active":""}">⚙ Maschinenraum</button></div></div>${state.view==="overview"?overview():'<div class="aiw7-panel"><div class="aiw7-empty">Maschinenraum geöffnet: Firmenstruktur, Skills, Provider, Modelle und Detailregeln bleiben vollständig verfügbar.</div></div>'}`;
    return true;
  }
  function queue() { if (state.queued) return; state.queued=true; requestAnimationFrame(()=>{state.queued=false;render();}); }
  function setView(view) { state.view=view==="advanced"?"advanced":"overview"; try{localStorage.setItem(VIEW_KEY,state.view);}catch{} queue(); if(state.view==="advanced") requestAnimationFrame(()=>window.ElyonAIWorkforceTeamV6?.render?.()); }
  function openJarvis() { const menu=document.getElementById("mainMenu"); if(menu){menu.value="jarvisCommandCenterTab";menu.dispatchEvent(new Event("change",{bubbles:true}));} if(typeof window.showTab==="function") window.showTab("jarvisCommandCenterTab"); window.ElyonJarvisCommandCenter?.refresh?.(); }
  function bind() {
    if(state.bound) return; state.bound=true;
    document.addEventListener("click",(event)=>{const target=event.target instanceof Element?event.target:null;if(!target?.closest(`#${ROOT_ID}`))return;const view=target.closest("[data-aiw7-view]");if(view){event.preventDefault();setView(C.text(view.dataset.aiw7View));return;}if(target.closest("[data-aiw7-jarvis]")){event.preventDefault();openJarvis();return;}if(target.closest("[data-aiw7-decisions]")){event.preventDefault();document.getElementById("elyonAiWorkforceV7Decisions")?.scrollIntoView({behavior:"smooth",block:"start"});return;}const open=target.closest("[data-aiw7-open]");if(open){event.preventDefault();window.ElyonAIWorkforceTeamV6?.openDetails?.(C.text(open.dataset.aiw7Open));return;}const assign=target.closest("[data-aiw7-assign]");if(assign){event.preventDefault();window.ElyonAIWorkforceTeamV6?.openComposer?.(C.text(assign.dataset.aiw7Assign));}},true);
    for(const name of ["elyon:ai-workforce-v2-task-updated","elyon:ai-workforce-custom-task-updated","elyon:ai-workforce-routing-updated","elyon:ai-agent-resource-settings-changed"])window.addEventListener(name,queue);
    window.addEventListener("elyon:runtime-group-loaded",(event)=>{if(event.detail?.tabId==="virtualAgentsTab")queue();});
    window.addEventListener("elyon:tab-changed",(event)=>{if((event.detail?.tabId||event.detail)==="virtualAgentsTab")queue();});
    window.addEventListener("storage",(event)=>{if([...C.TASK_KEYS,SETTINGS_KEY,VIEW_KEY].includes(event.key))queue();});
  }
  try{state.view=localStorage.getItem(VIEW_KEY)==="advanced"?"advanced":"overview";}catch{}
  bind(); queue();
  window.ElyonAIWorkforceV7 = { render:queue, setView, teams:C.TEAM };
})();
