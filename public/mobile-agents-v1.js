(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_QUEUE = 'elyon_mobile_agent_queue';

  async function safeJson(url, options) {
    try {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { error: error.message } };
    }
  }

  function isEnabled() {
    return document.body.dataset.flags?.split(' ').includes('agentAutomation') || document.body.classList.contains('agents-v1-enabled');
  }

  function toast(message) {
    const el = $('sheetToast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4500);
  }

  function installStyles() {
    if (document.getElementById('agentsV1Styles')) return;
    const style = document.createElement('style');
    style.id = 'agentsV1Styles';
    style.textContent = `
      .agents-v1-panel{padding:14px 15px;border-radius:20px;background:rgba(15,23,42,.70);border:1px solid rgba(168,85,247,.24);display:grid;gap:10px}
      .agents-v1-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.agents-v1-head b{font-size:14px}.agents-v1-head small{display:block;color:#94a3b8;margin-top:3px;line-height:1.35}
      .agents-v1-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.agents-v1-card{padding:11px;border-radius:15px;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.14);font-size:12px;color:#cbd5e1}.agents-v1-card b{display:block;color:#e5e7eb;margin-bottom:4px}
      .agents-v1-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.agents-v1-actions button{padding:11px;border-radius:15px;background:rgba(168,85,247,.16);border:1px solid rgba(168,85,247,.26);color:#ddd6fe;font-weight:900}
      .agents-v1-queue{display:grid;gap:8px}.agents-v1-task{padding:10px;border-radius:14px;background:rgba(2,6,23,.40);border:1px solid rgba(148,163,184,.14);font-size:12px;color:#cbd5e1}.agents-v1-task b{display:block;color:#e5e7eb;margin-bottom:3px}
    `;
    document.head.appendChild(style);
  }

  function readQueue() {
    try { return JSON.parse(localStorage.getItem(STORAGE_QUEUE) || '[]'); } catch { return []; }
  }

  function writeQueue(queue) {
    localStorage.setItem(STORAGE_QUEUE, JSON.stringify(queue.slice(0, 100)));
  }

  function addTask(agentId, title, detail) {
    const queue = readQueue();
    const task = {
      id: `task-${Date.now()}`,
      agentId,
      title,
      detail,
      status: 'draft',
      safety: 'requires-manual-approval',
      createdAt: new Date().toISOString(),
    };
    queue.unshift(task);
    writeQueue(queue);
    renderQueue();
    toast('Agenten-Aufgabe als Entwurf erstellt.');
    return task;
  }

  function renderQueue() {
    const list = $('agentsV1Queue');
    if (!list) return;
    const queue = readQueue().slice(0, 8);
    list.innerHTML = queue.length ? queue.map((task) => `
      <div class="agents-v1-task"><b>${task.title}</b>${task.detail}<br><small>${task.agentId} · ${task.status} · manuelle Freigabe nötig</small></div>
    `).join('') : '<div class="agents-v1-task"><b>Keine Aufgaben</b>Noch keine Agenten-Entwürfe vorhanden.</div>';
  }

  async function syncRuntime() {
    if (!isEnabled()) return toast('Agent Automation ist noch nicht online geschaltet.');
    const queue = readQueue();
    const payload = {
      runtime: {
        settings: {
          securityMode: true,
          sandboxMode: true,
          advancedMode: false,
          autonomyLocked: true,
        },
        queue,
        logs: [{ at: new Date().toISOString(), message: 'Mobile Agent V1 sandbox sync' }],
      },
    };
    const res = await safeJson('/api/agent-engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    toast(res.ok && res.data?.ok ? 'Agent Runtime im Sandbox-Modus synchronisiert.' : 'Agent Runtime Sync fehlgeschlagen.');
  }

  function createDailyFocusTasks() {
    if (!isEnabled()) return toast('Agent Automation ist noch nicht online geschaltet.');
    addTask('daily-focus-agent', 'Tagesfokus prüfen', 'Health, Orders, Drive und Scanner-Ideen ansehen und daraus Prioritäten ableiten.');
    addTask('product-agent', '3 Produktideen bewerten', 'Scanner-Ideen nach Marge, Konkurrenz, Lieferzeit und Risiko prüfen.');
    addTask('risk-agent', 'Systemrisiken prüfen', 'API Warnungen, Google Drive Backup und eBay Orders kontrollieren.');
  }

  function createProductAgentTask() {
    if (!isEnabled()) return toast('Agent Automation ist noch nicht online geschaltet.');
    addTask('product-agent', 'Neue Produktchance analysieren', 'Produktdaten sammeln, eBay Vergleich prüfen, Marge schätzen, Empfehlung vorbereiten.');
  }

  function createPriceAgentTask() {
    if (!isEnabled()) return toast('Agent Automation ist noch nicht online geschaltet.');
    addTask('price-agent', 'Preisprüfung vorbereiten', 'Top-Treffer vergleichen, Durchschnittspreis prüfen und Preisvorschlag als Entwurf erstellen.');
  }

  function clearQueue() {
    writeQueue([]);
    renderQueue();
    toast('Agenten-Queue geleert.');
  }

  function ensurePanel() {
    if (!isEnabled()) return null;
    installStyles();
    if ($('agentsV1Panel')) return $('agentsV1Panel');
    const more = $('more');
    if (!more) return null;
    const panel = document.createElement('div');
    panel.innerHTML = `
      <h2>Agent Automation</h2>
      <div class="agents-v1-panel" id="agentsV1Panel">
        <div class="agents-v1-head">
          <div><b>Virtuelle Mitarbeiter V1</b><small>Agenten erzeugen nur sichere Aufgabenentwürfe. Keine Bestellungen, keine Listings, keine Kundenaktionen ohne manuelle Freigabe.</small></div>
          <span class="badge green">v1.5</span>
        </div>
        <div class="agents-v1-grid">
          <div class="agents-v1-card"><b>Produkt-Agent</b>Produktideen prüfen</div>
          <div class="agents-v1-card"><b>Preis-Agent</b>Preisvorschläge vorbereiten</div>
          <div class="agents-v1-card"><b>Risiko-Agent</b>API, EPR, Backup prüfen</div>
          <div class="agents-v1-card"><b>Tagesfokus-Agent</b>Prioritäten setzen</div>
        </div>
        <div class="agents-v1-actions">
          <button id="agentDailyBtn">Tagesfokus</button>
          <button id="agentProductBtn">Produkt-Agent</button>
          <button id="agentPriceBtn">Preis-Agent</button>
          <button id="agentSyncBtn">Sandbox Sync</button>
          <button id="agentClearBtn">Queue leeren</button>
        </div>
        <div class="agents-v1-queue" id="agentsV1Queue"></div>
      </div>
    `;
    more.appendChild(panel);
    $('agentDailyBtn')?.addEventListener('click', createDailyFocusTasks);
    $('agentProductBtn')?.addEventListener('click', createProductAgentTask);
    $('agentPriceBtn')?.addEventListener('click', createPriceAgentTask);
    $('agentSyncBtn')?.addEventListener('click', syncRuntime);
    $('agentClearBtn')?.addEventListener('click', clearQueue);
    renderQueue();
    return $('agentsV1Panel');
  }

  function watchFlags() {
    ensurePanel();
    const observer = new MutationObserver(() => ensurePanel());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-flags'] });
  }

  window.ElyonAgentsV1 = { mount: ensurePanel, addTask, sync: syncRuntime, queue: readQueue };
  document.addEventListener('DOMContentLoaded', watchFlags);
})();
