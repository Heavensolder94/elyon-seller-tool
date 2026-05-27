(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_IDEAS = 'elyon_mobile_product_ideas';

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
    return document.body.dataset.flags?.split(' ').includes('brainContextV2') || document.body.classList.contains('brain-v2-enabled');
  }

  function toast(message) {
    const el = $('sheetToast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4500);
  }

  function installStyles() {
    if (document.getElementById('brainV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'brainV2Styles';
    style.textContent = `
      .brain-v2-panel{margin:14px 0;padding:15px;border-radius:22px;background:rgba(15,23,42,.72);border:1px solid rgba(96,165,250,.24);display:grid;gap:10px;box-shadow:0 18px 52px rgba(0,0,0,.24)}
      .brain-v2-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.brain-v2-head b{font-size:15px}.brain-v2-head small{display:block;color:#94a3b8;margin-top:3px;line-height:1.35}
      .brain-v2-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.brain-v2-chip{padding:10px;border-radius:14px;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.14);font-size:12px;color:#cbd5e1}.brain-v2-chip b{display:block;color:#e5e7eb;margin-bottom:3px}
      .brain-v2-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.brain-v2-actions button{padding:11px;border-radius:15px;background:rgba(37,99,235,.20);border:1px solid rgba(96,165,250,.24);color:#bfdbfe;font-weight:900}
    `;
    document.head.appendChild(style);
  }

  function readIdeas() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_IDEAS) || '[]');
    } catch {
      return [];
    }
  }

  function readFlags() {
    try {
      return window.ElyonFeatureFlags?.getFlags?.() || JSON.parse(localStorage.getItem('elyon_mobile_feature_flags') || '{}');
    } catch {
      return {};
    }
  }

  async function collectContext() {
    const [health, orders, drive] = await Promise.all([
      safeJson('/api/mobile-health'),
      safeJson('/api/ebay/orders?days=7'),
      safeJson('/api/google-drive/status'),
    ]);

    const ideas = readIdeas().slice(0, 10);
    const flags = readFlags();

    return {
      collectedAt: new Date().toISOString(),
      health: health.data?.summary || null,
      services: (health.data?.services || []).map((service) => ({ key: service.key, name: service.name, state: service.state, detail: service.detail || null })),
      orders: {
        live: Boolean(orders.ok),
        count7d: orders.data?.count ?? orders.data?.orders?.length ?? 0,
        preview: (orders.data?.orders || []).slice(0, 5).map((order) => ({
          id: order.orderId || '',
          status: order.orderFulfillmentStatus || order.orderPaymentStatus || '',
          created: order.creationDate || '',
          total: order.pricingSummary?.total || order.total || null,
        })),
      },
      googleDrive: {
        live: Boolean(drive.ok),
        connected: Boolean(drive.data?.connected),
        lastBackupAt: drive.data?.lastBackupAt || '',
        lastBackupFileName: drive.data?.lastBackupFileName || '',
      },
      productIdeas: ideas.map((idea) => ({ title: idea.title, barcode: idea.barcode, profit: idea.profit, sellPrice: idea.sellPrice, createdAt: idea.createdAt })),
      features: Object.fromEntries(Object.entries(flags || {}).map(([key, value]) => [key, Boolean(value?.enabled)])),
      safety: {
        mode: 'advisory-only',
        note: 'Keine autonomen Live-Aktionen. Nur Analyse, Vorschläge und Aufgabenentwürfe.',
      },
    };
  }

  function ensurePanel() {
    if (!isEnabled()) return null;
    installStyles();
    if ($('brainV2Panel')) return $('brainV2Panel');
    const brain = $('brain');
    const chatLog = $('chatLog');
    if (!brain || !chatLog) return null;
    const panel = document.createElement('div');
    panel.id = 'brainV2Panel';
    panel.className = 'brain-v2-panel';
    panel.innerHTML = `
      <div class="brain-v2-head">
        <div><b>Brain Context V2</b><small>Antwortet mit Live-Kontext aus Orders, Health, Drive, Scanner-Ideen und Feature-Schaltern.</small></div>
        <span class="badge green">v1.3</span>
      </div>
      <div class="brain-v2-grid" id="brainV2Stats">
        <div class="brain-v2-chip"><b>Kontext</b>wird geladen…</div>
        <div class="brain-v2-chip"><b>Modus</b>sicher / beratend</div>
      </div>
      <div class="brain-v2-actions">
        <button id="brainV2Focus">Tagesfokus</button>
        <button id="brainV2Risk">Risikoanalyse</button>
      </div>
    `;
    chatLog.insertAdjacentElement('beforebegin', panel);
    $('brainV2Focus')?.addEventListener('click', () => askWithContext('Erstelle mir einen konkreten Tagesfokus für Elyon. Nutze nur vorhandene Live-Daten und schlage keine autonomen Live-Aktionen vor.'));
    $('brainV2Risk')?.addEventListener('click', () => askWithContext('Analysiere die aktuellen Risiken in meinem Elyon-System. Priorisiere API, Orders, Backup, Scanner und Produktideen.'));
    refreshPanel();
    return panel;
  }

  async function refreshPanel() {
    if (!isEnabled() || !$('brainV2Stats')) return;
    const context = await collectContext();
    const healthText = context.health ? `${context.health.ok || 0}/${context.health.total || 0} ok` : 'unbekannt';
    const ideasText = `${context.productIdeas.length} Ideen`;
    $('brainV2Stats').innerHTML = `
      <div class="brain-v2-chip"><b>Health</b>${healthText}</div>
      <div class="brain-v2-chip"><b>Orders 7T</b>${context.orders.count7d}</div>
      <div class="brain-v2-chip"><b>Drive</b>${context.googleDrive.connected ? 'verbunden' : 'prüfen'}</div>
      <div class="brain-v2-chip"><b>Scanner</b>${ideasText}</div>
    `;
  }

  async function askWithContext(question) {
    if (!isEnabled()) return toast('Brain Context V2 ist noch nicht online geschaltet.');
    const chatLog = $('chatLog');
    if (!chatLog) return;
    chatLog.insertAdjacentHTML('beforeend', `<div class="bubble user">${question.replace(/[<>]/g, '')}</div><div class="bubble ai" id="brainV2Thinking">Brain V2 sammelt Live-Kontext…</div>`);
    const context = await collectContext();
    const response = await safeJson('/api/ai-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: question,
        context: JSON.stringify(context),
        source: 'mobile-brain-context-v2',
      }),
    });
    const thinking = $('brainV2Thinking');
    if (thinking) thinking.removeAttribute('id');
    const answer = response.data?.answer || response.data?.recommendation || response.data?.message || 'Brain V2 konnte gerade keine Live-Antwort erzeugen.';
    const bubbles = chatLog.querySelectorAll('.bubble.ai');
    const last = bubbles[bubbles.length - 1];
    if (last) last.textContent = answer;
    refreshPanel();
  }

  function captureSend() {
    const send = $('brainSend');
    const input = $('brainInput');
    if (!send || !input || send.dataset.brainV2Capture) return;
    send.dataset.brainV2Capture = 'true';
    send.addEventListener('click', () => {
      if (!isEnabled()) return;
      const question = input.value.trim();
      if (!question) return;
      setTimeout(() => askWithContext(question), 60);
    }, true);
  }

  function watchFlags() {
    ensurePanel();
    captureSend();
    const observer = new MutationObserver(() => {
      ensurePanel();
      captureSend();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-flags'] });
  }

  window.ElyonBrainV2 = { mount: ensurePanel, refresh: refreshPanel, ask: askWithContext, collectContext };
  document.addEventListener('DOMContentLoaded', watchFlags);
})();
