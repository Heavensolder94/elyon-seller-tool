(() => {
  const $ = (id) => document.getElementById(id);
  const FLAG_KEY = 'elyon_mobile_feature_flags';
  const DEFAULT_FLAGS = {
    mobileLiveDashboard: {
      enabled: true,
      version: 'v1.1',
      label: 'Mobile Live Dashboard',
      description: 'Live-Kennzahlen, eBay Orders, Health und Google Drive Status.',
      status: 'stable',
    },
    scannerV2: {
      enabled: false,
      version: 'v1.2',
      label: 'Scanner V2',
      description: 'Barcode-Erkennung, AI Vision, eBay Suchvorschläge und Produktidee übernehmen.',
      status: 'prepared',
    },
    brainContextV2: {
      enabled: false,
      version: 'v1.3',
      label: 'Brain Context V2',
      description: 'Brain nutzt Orders, Health, Scanner-Ergebnisse und Tagesfokus als Kontext.',
      status: 'prepared',
    },
    pushFoundation: {
      enabled: false,
      version: 'v1.4',
      label: 'Push Notifications',
      description: 'Grundlage für Verkaufs-, Backup- und API-Warnungen.',
      status: 'prepared',
    },
    agentAutomation: {
      enabled: false,
      version: 'v1.5',
      label: 'Agent Automation',
      description: 'Virtuelle Mitarbeiter, Produkt-Agent, Preis-Agent und Risiko-Agent.',
      status: 'prepared',
    },
  };

  function loadLocalFlags() {
    try {
      const stored = JSON.parse(localStorage.getItem(FLAG_KEY) || '{}');
      return Object.fromEntries(Object.entries(DEFAULT_FLAGS).map(([key, flag]) => [key, { ...flag, ...(stored[key] || {}) }]));
    } catch {
      return DEFAULT_FLAGS;
    }
  }

  function saveLocalFlags(flags) {
    localStorage.setItem(FLAG_KEY, JSON.stringify(flags));
  }

  function colorFor(flag) {
    if (flag.enabled) return 'green';
    if (flag.status === 'stable') return 'blue';
    return 'amber';
  }

  function installStyles() {
    if (document.getElementById('elyonFlagStyles')) return;
    const style = document.createElement('style');
    style.id = 'elyonFlagStyles';
    style.textContent = `
      .feature-card{padding:14px 15px;border-radius:18px;background:rgba(15,23,42,.70);border:1px solid rgba(148,163,184,.18);display:grid;gap:10px}
      .feature-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .feature-head b{font-size:14px;letter-spacing:-.02em}.feature-head small{display:block;color:#94a3b8;margin-top:3px;line-height:1.35}
      .toggle{width:52px;height:30px;border-radius:999px;background:rgba(148,163,184,.22);border:1px solid rgba(255,255,255,.10);position:relative;flex:0 0 auto}
      .toggle::after{content:"";position:absolute;width:24px;height:24px;top:2px;left:2px;border-radius:50%;background:#cbd5e1;transition:.18s}
      .toggle.on{background:rgba(34,197,94,.24);border-color:rgba(34,197,94,.38)}.toggle.on::after{left:24px;background:#86efac}
      .feature-note{padding:12px;border-radius:16px;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.22);color:#fde68a;font-size:12px;line-height:1.4;margin-bottom:12px}
    `;
    document.head.appendChild(style);
  }

  function showToast(message) {
    const toast = document.getElementById('sheetToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4500);
  }

  function ensureFlagPanel() {
    installStyles();
    let panel = document.getElementById('featureFlagsPanel');
    if (panel) return panel;
    const more = document.getElementById('more');
    if (!more) return null;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <h2>Versions-Schalter</h2>
      <div class="feature-note">Hobby-Plan-Modus: Schalter werden lokal im Browser gespeichert. Keine zusätzliche Serverless Function nötig.</div>
      <div class="status-list" id="featureFlagsPanel"></div>
    `;
    more.appendChild(wrapper);
    return document.getElementById('featureFlagsPanel');
  }

  function applyFlags(flags) {
    document.body.dataset.flags = Object.entries(flags).filter(([, flag]) => flag.enabled).map(([key]) => key).join(' ');
    document.body.classList.toggle('scanner-v2-enabled', Boolean(flags.scannerV2?.enabled));
    document.body.classList.toggle('brain-v2-enabled', Boolean(flags.brainContextV2?.enabled));
    document.body.classList.toggle('push-v1-enabled', Boolean(flags.pushFoundation?.enabled));
    document.body.classList.toggle('agents-v1-enabled', Boolean(flags.agentAutomation?.enabled));
  }

  function renderFlags() {
    const panel = ensureFlagPanel();
    const flags = loadLocalFlags();
    applyFlags(flags);
    if (!panel) return;
    panel.innerHTML = Object.entries(flags).map(([key, flag]) => `
      <div class="feature-card">
        <div class="feature-head">
          <div><b>${flag.version} · ${flag.label}</b><small>${flag.description}</small></div>
          <button class="toggle ${flag.enabled ? 'on' : ''}" data-feature-key="${key}" data-enabled="${flag.enabled ? 'true' : 'false'}" aria-label="${flag.label} umschalten"></button>
        </div>
        <div><span class="badge ${colorFor(flag)}">${flag.enabled ? 'ONLINE' : 'VORBEREITET'}</span></div>
      </div>
    `).join('');
    panel.querySelectorAll('[data-feature-key]').forEach((button) => {
      button.addEventListener('click', () => toggleFlag(button.dataset.featureKey));
    });
  }

  function toggleFlag(key) {
    const flags = loadLocalFlags();
    if (!flags[key]) return;
    flags[key].enabled = !flags[key].enabled;
    flags[key].updatedAt = new Date().toISOString();
    saveLocalFlags(flags);
    applyFlags(flags);
    renderFlags();
    showToast(`${flags[key].label} wurde ${flags[key].enabled ? 'online geschaltet' : 'deaktiviert'}.`);
  }

  window.ElyonFeatureFlags = { refresh: renderFlags, toggle: toggleFlag, getFlags: loadLocalFlags };
  document.addEventListener('DOMContentLoaded', renderFlags);
})();
