(() => {
  const MODULES = [
    { key: 'live', global: 'ElyonMobileLive', file: '/mobile-live.js' },
    { key: 'flags', global: 'ElyonFeatureFlags', file: '/mobile-flags.js' },
    { key: 'scannerV2', global: 'ElyonScannerV2', file: '/mobile-scanner-v2.js' },
    { key: 'brainV2', global: 'ElyonBrainV2', file: '/mobile-brain-v2.js' },
    { key: 'pushV1', global: 'ElyonPushV1', file: '/mobile-push-v1.js' },
    { key: 'agentsV1', global: 'ElyonAgentsV1', file: '/mobile-agents-v1.js' },
  ];

  const $ = (id) => document.getElementById(id);

  function toast(message) {
    const el = $('sheetToast');
    if (el) {
      el.textContent = message;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 4500);
      return;
    }
    console.log('[Elyon Mobile]', message);
  }

  function loadScriptOnce(file) {
    return new Promise((resolve) => {
      if ([...document.scripts].some((script) => script.src.includes(file))) return resolve(true);
      const script = document.createElement('script');
      script.defer = true;
      script.src = `${file}?v=${Date.now()}`;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function ensureModulesLoaded() {
    const missing = MODULES.filter((module) => !window[module.global]);
    for (const module of missing) {
      await loadScriptOnce(module.file);
    }
    setTimeout(() => {
      window.ElyonFeatureFlags?.refresh?.();
      window.ElyonScannerV2?.mount?.();
      window.ElyonBrainV2?.mount?.();
      window.ElyonPushV1?.mount?.();
      window.ElyonAgentsV1?.mount?.();
      window.ElyonMobileLive?.refresh?.();
      renderModuleStatus();
    }, 300);
  }

  function installStyles() {
    if ($('mobileBootstrapStyles')) return;
    const style = document.createElement('style');
    style.id = 'mobileBootstrapStyles';
    style.textContent = `
      .bootstrap-panel{margin-top:12px;padding:14px;border-radius:20px;background:rgba(15,23,42,.70);border:1px solid rgba(56,189,248,.20);display:grid;gap:10px}
      .bootstrap-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bootstrap-item{padding:10px;border-radius:14px;background:rgba(2,6,23,.40);border:1px solid rgba(148,163,184,.14);font-size:12px;color:#cbd5e1}.bootstrap-item b{display:block;color:#e5e7eb;margin-bottom:3px}
      .settings-row{cursor:pointer}.settings-row:active{transform:scale(.99)}.settings-row small{display:block;color:#94a3b8;margin-top:3px;font-weight:600;line-height:1.35}
    `;
    document.head.appendChild(style);
  }

  function badge(label, state = 'blue') {
    return `<span class="badge ${state}">${label}</span>`;
  }

  function renderModuleStatus() {
    const more = $('more');
    if (!more) return;
    let panel = $('mobileModuleStatus');
    if (!panel) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <h2>Mobile System</h2>
        <div class="bootstrap-panel" id="mobileModuleStatus">
          <div class="bootstrap-grid" id="mobileModuleGrid"></div>
        </div>
      `;
      more.appendChild(wrap);
      panel = $('mobileModuleStatus');
    }
    const grid = $('mobileModuleGrid');
    if (!grid) return;
    grid.innerHTML = MODULES.map((module) => {
      const ready = Boolean(window[module.global]);
      return `<div class="bootstrap-item"><b>${module.key}</b>${ready ? badge('geladen', 'green') : badge('fehlt', 'amber')}</div>`;
    }).join('');
  }

  function openScreen(target) {
    const screen = document.getElementById(target);
    if (!screen) return;
    document.querySelectorAll('.screen').forEach((item) => item.classList.toggle('active', item.id === target));
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.target === target));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function enhanceSettingsRows() {
    const rows = [...document.querySelectorAll('#more .settings-row')];
    rows.forEach((row) => {
      if (row.dataset.bootstrapReady) return;
      row.dataset.bootstrapReady = 'true';
      const text = row.textContent.toLowerCase();
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      if (text.includes('benachrichtigung')) {
        row.addEventListener('click', () => {
          const flags = window.ElyonFeatureFlags?.getFlags?.() || {};
          if (!flags.pushFoundation?.enabled) window.ElyonFeatureFlags?.toggle?.('pushFoundation');
          setTimeout(() => { window.ElyonPushV1?.mount?.(); toast('Push/Notification Center geöffnet.'); }, 250);
        });
      } else if (text.includes('automatisierung')) {
        row.addEventListener('click', () => {
          const flags = window.ElyonFeatureFlags?.getFlags?.() || {};
          if (!flags.agentAutomation?.enabled) window.ElyonFeatureFlags?.toggle?.('agentAutomation');
          setTimeout(() => { window.ElyonAgentsV1?.mount?.(); toast('Agent Automation geöffnet.'); }, 250);
        });
      } else if (text.includes('api') || text.includes('integrationen')) {
        row.addEventListener('click', () => {
          window.ElyonMobileLive?.refresh?.();
          renderModuleStatus();
          toast('API & Modulstatus aktualisiert.');
        });
      } else if (text.includes('daten')) {
        row.addEventListener('click', () => {
          const ideas = JSON.parse(localStorage.getItem('elyon_mobile_product_ideas') || '[]');
          const queue = JSON.parse(localStorage.getItem('elyon_mobile_agent_queue') || '[]');
          const notices = JSON.parse(localStorage.getItem('elyon_mobile_notifications') || '[]');
          toast(`Lokale Daten: ${ideas.length} Ideen, ${queue.length} Agenten-Aufgaben, ${notices.length} Meldungen.`);
        });
      }
    });
  }

  function addScannerHints() {
    const overlay = $('scannerOverlay');
    const analyze = $('analyzeBtn');
    const camera = $('cameraBtn');
    if (overlay && !overlay.dataset.bootstrapHint) {
      overlay.dataset.bootstrapHint = 'true';
      overlay.textContent = 'Hinweis: Kamera zeigt Livebild. Für Analyse Foto auswählen oder Scanner V2 aktivieren und Barcode Live starten.';
    }
    if (camera && !camera.dataset.bootstrapHint) {
      camera.dataset.bootstrapHint = 'true';
      camera.addEventListener('click', () => setTimeout(() => {
        toast('Kamera gestartet. Für Barcode: Mehr → Versions-Schalter → Scanner V2 aktivieren, dann Barcode Live. Für Fotoanalyse: Foto hochladen + Produkt analysieren.');
      }, 600));
    }
    if (analyze && !analyze.dataset.bootstrapHint) {
      analyze.dataset.bootstrapHint = 'true';
      analyze.addEventListener('click', () => setTimeout(() => {
        if ($('analysisTitle')?.textContent === 'Analysiere…') toast('Analyse läuft. Bei Fotoanalyse kann es etwas dauern.');
      }, 150));
    }
  }

  async function init() {
    installStyles();
    await ensureModulesLoaded();
    enhanceSettingsRows();
    addScannerHints();
    renderModuleStatus();
    window.ElyonMobileBootstrap = { ensureModulesLoaded, renderModuleStatus, enhanceSettingsRows, openScreen };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
