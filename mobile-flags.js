(() => {
  const $ = (id) => document.getElementById(id);

  async function safeJson(url, options) {
    try {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { error: error.message } };
    }
  }

  function getAdminToken() {
    return localStorage.getItem('elyon_feature_admin_token') || '';
  }

  function setAdminToken(token) {
    if (token) localStorage.setItem('elyon_feature_admin_token', token);
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
      .token-box{display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:12px}.token-box input{width:100%;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:rgba(2,6,23,.58);color:#e5e7eb;padding:12px}.token-box button{padding:12px 14px;border-radius:16px;background:rgba(37,99,235,.28);color:#bfdbfe;font-weight:900}
    `;
    document.head.appendChild(style);
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
      <div class="token-box">
        <input id="featureTokenInput" type="password" placeholder="Admin Token für Freischaltung…" />
        <button id="saveFeatureToken">Speichern</button>
      </div>
      <div class="status-list" id="featureFlagsPanel">
        <div class="status-row"><span class="status-name">Feature Flags laden…</span><span class="badge blue">Live</span></div>
      </div>
    `;
    more.appendChild(wrapper);
    document.getElementById('saveFeatureToken')?.addEventListener('click', () => {
      const value = document.getElementById('featureTokenInput')?.value?.trim();
      setAdminToken(value);
      showToast('Admin Token lokal gespeichert.');
    });
    return document.getElementById('featureFlagsPanel');
  }

  function showToast(message) {
    const toast = document.getElementById('sheetToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4500);
  }

  function applyFlags(flags) {
    document.body.dataset.flags = Object.entries(flags).filter(([, flag]) => flag.enabled).map(([key]) => key).join(' ');
    if (flags.scannerV2?.enabled) document.body.classList.add('scanner-v2-enabled');
    if (flags.brainContextV2?.enabled) document.body.classList.add('brain-v2-enabled');
    if (flags.pushFoundation?.enabled) document.body.classList.add('push-v1-enabled');
    if (flags.agentAutomation?.enabled) document.body.classList.add('agents-v1-enabled');
  }

  async function loadFlags() {
    const panel = ensureFlagPanel();
    const res = await safeJson('/api/feature-flags');
    if (!res.ok || !res.data?.ok) {
      if (panel) panel.innerHTML = '<div class="status-row"><span class="status-name">Feature Flags konnten nicht geladen werden</span><span class="badge red">Fehler</span></div>';
      return;
    }
    const flags = res.data.flags || {};
    applyFlags(flags);
    if (!panel) return;
    panel.innerHTML = Object.entries(flags).map(([key, flag]) => `
      <div class="feature-card">
        <div class="feature-head">
          <div><b>${flag.version} · ${flag.label}</b><small>${flag.description}</small></div>
          <button class="toggle ${flag.enabled ? 'on' : ''}" data-feature-key="${key}" data-enabled="${flag.enabled ? 'true' : 'false'}" aria-label="${flag.label} umschalten"></button>
        </div>
        <div>${window.badge ? window.badge(flag.enabled ? 'ONLINE' : 'VORBEREITET', colorFor(flag)) : `<span class="badge ${colorFor(flag)}">${flag.enabled ? 'ONLINE' : 'VORBEREITET'}</span>`}</div>
      </div>
    `).join('');

    panel.querySelectorAll('[data-feature-key]').forEach((button) => {
      button.addEventListener('click', async () => {
        const key = button.dataset.featureKey;
        const next = button.dataset.enabled !== 'true';
        await toggleFlag(key, next);
      });
    });
  }

  async function toggleFlag(key, enabled) {
    const token = getAdminToken();
    if (!token) {
      showToast('Bitte zuerst Admin Token speichern.');
      return;
    }

    const res = await safeJson('/api/feature-flags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key, enabled }),
    });

    if (!res.ok || !res.data?.ok) {
      showToast(res.data?.error || 'Feature konnte nicht geschaltet werden.');
      return;
    }

    showToast(`${key} wurde ${enabled ? 'online geschaltet' : 'deaktiviert'}.`);
    await loadFlags();
  }

  window.ElyonFeatureFlags = { refresh: loadFlags, toggle: toggleFlag };

  document.addEventListener('DOMContentLoaded', loadFlags);
})();
