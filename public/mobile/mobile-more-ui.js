(() => {
  const $ = (id) => document.getElementById(id);

  function toast(message) {
    const el = $('sheetToast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4500);
  }

  function installStyles() {
    if ($('elyonMoreUiStyles')) return;
    const style = document.createElement('style');
    style.id = 'elyonMoreUiStyles';
    style.textContent = `
      .more-dashboard{display:grid;gap:14px;margin-top:14px}
      .more-group{padding:14px;border-radius:24px;background:linear-gradient(180deg,rgba(15,23,42,.86),rgba(15,23,42,.62));border:1px solid rgba(148,163,184,.18);box-shadow:0 18px 50px rgba(0,0,0,.24)}
      .more-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .more-group-head b{display:block;font-size:15px;letter-spacing:-.03em}.more-group-head small{display:block;color:#94a3b8;font-size:12px;line-height:1.35;margin-top:3px}
      .more-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .more-action{min-height:92px;padding:13px;border-radius:18px;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.16);display:flex;flex-direction:column;justify-content:space-between;text-align:left;color:#e5e7eb}
      .more-action:active{transform:scale(.99)}.more-action span{font-size:22px}.more-action b{font-size:13px;line-height:1.2}.more-action small{color:#94a3b8;font-size:11px;line-height:1.25;margin-top:4px}
      .more-status-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.more-mini{padding:10px;border-radius:15px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.14);font-size:11px;color:#94a3b8}.more-mini b{display:block;color:#e5e7eb;font-size:14px;margin-bottom:3px}
      .more-hidden-legacy{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function enableFeature(key) {
    const flags = window.ElyonFeatureFlags?.getFlags?.();
    if (flags && !flags[key]?.enabled) window.ElyonFeatureFlags.toggle(key);
  }

  function countLocal(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]').length; } catch { return 0; }
  }

  function renderMore() {
    const more = $('more');
    if (!more || $('moreDashboard')) return;
    installStyles();

    const legacySettings = more.querySelector('.settings-list');
    if (legacySettings) legacySettings.classList.add('more-hidden-legacy');

    const dashboard = document.createElement('div');
    dashboard.id = 'moreDashboard';
    dashboard.className = 'more-dashboard';
    dashboard.innerHTML = `
      <section class="more-group">
        <div class="more-group-head">
          <div><b>Mobile Steuerung</b><small>Alles Wichtige für Handy, Scanner und Benachrichtigungen.</small></div>
          <span class="badge blue">Core</span>
        </div>
        <div class="more-action-grid">
          <button class="more-action" data-more-action="notifications"><span>🔔</span><b>Benachrichtigungen</b><small>Push Center öffnen</small></button>
          <button class="more-action" data-more-action="scanner"><span>📷</span><b>Scanner V2</b><small>Barcode & Fotoanalyse</small></button>
          <button class="more-action" data-more-action="brain"><span>🧠</span><b>Brain V2</b><small>Tagesfokus & Risiko</small></button>
          <button class="more-action" data-more-action="agents"><span>🤖</span><b>Agenten</b><small>Sandbox-Aufgaben</small></button>
        </div>
      </section>

      <section class="more-group">
        <div class="more-group-head">
          <div><b>System & Verbindungen</b><small>APIs, Google Drive, eBay und Modulstatus prüfen.</small></div>
          <span class="badge green">Live</span>
        </div>
        <div class="more-action-grid">
          <button class="more-action" data-more-action="api"><span>🔌</span><b>API Health</b><small>Verbindungen prüfen</small></button>
          <button class="more-action" data-more-action="backup"><span>☁️</span><b>Drive Backup</b><small>Test-Backup senden</small></button>
          <button class="more-action" data-more-action="orders"><span>📦</span><b>Orders</b><small>eBay neu laden</small></button>
          <button class="more-action" data-more-action="modules"><span>🧩</span><b>Module</b><small>Status anzeigen</small></button>
        </div>
      </section>

      <section class="more-group">
        <div class="more-group-head">
          <div><b>Daten & Speicher</b><small>Lokale Produktideen, Agenten-Queue und Meldungen.</small></div>
          <span class="badge amber">Lokal</span>
        </div>
        <div class="more-status-strip">
          <div class="more-mini"><b id="moreIdeasCount">0</b>Ideen</div>
          <div class="more-mini"><b id="moreQueueCount">0</b>Agenten</div>
          <div class="more-mini"><b id="moreNoticesCount">0</b>Meldungen</div>
        </div>
        <div class="more-action-grid" style="margin-top:10px">
          <button class="more-action" data-more-action="data"><span>💾</span><b>Meine Daten</b><small>Zähler aktualisieren</small></button>
          <button class="more-action" data-more-action="install"><span>📱</span><b>Installieren</b><small>Homescreen Hinweis</small></button>
        </div>
      </section>
    `;

    const anchor = more.querySelector('h2:nth-of-type(2)') || legacySettings || more.lastElementChild;
    if (anchor && anchor.parentNode === more) anchor.insertAdjacentElement('afterend', dashboard);
    else more.appendChild(dashboard);

    dashboard.addEventListener('click', (event) => {
      const button = event.target.closest('[data-more-action]');
      if (!button) return;
      handleAction(button.dataset.moreAction);
    });

    updateCounts();
  }

  function updateCounts() {
    if ($('moreIdeasCount')) $('moreIdeasCount').textContent = countLocal('elyon_mobile_product_ideas');
    if ($('moreQueueCount')) $('moreQueueCount').textContent = countLocal('elyon_mobile_agent_queue');
    if ($('moreNoticesCount')) $('moreNoticesCount').textContent = countLocal('elyon_mobile_notifications');
  }

  function openScreen(target) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === target));
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.target === target));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleAction(action) {
    switch (action) {
      case 'notifications':
        enableFeature('pushFoundation');
        setTimeout(() => { window.ElyonPushV1?.mount?.(); toast('Notification Center geöffnet.'); updateCounts(); }, 250);
        break;
      case 'scanner':
        enableFeature('scannerV2');
        openScreen('scan');
        setTimeout(() => { window.ElyonScannerV2?.mount?.(); toast('Scanner V2 geöffnet.'); }, 250);
        break;
      case 'brain':
        enableFeature('brainContextV2');
        openScreen('brain');
        setTimeout(() => { window.ElyonBrainV2?.mount?.(); toast('Brain Context V2 geöffnet.'); }, 250);
        break;
      case 'agents':
        enableFeature('agentAutomation');
        setTimeout(() => { window.ElyonAgentsV1?.mount?.(); toast('Agent Automation geöffnet.'); updateCounts(); }, 250);
        break;
      case 'api':
        window.ElyonMobileLive?.refresh?.();
        window.ElyonMobileBootstrap?.renderModuleStatus?.();
        toast('API Health aktualisiert.');
        break;
      case 'backup':
        document.querySelector('[data-action="backup"]')?.click();
        break;
      case 'orders':
        openScreen('orders');
        window.ElyonMobileLive?.refresh?.();
        toast('Orders werden aktualisiert.');
        break;
      case 'modules':
        window.ElyonMobileBootstrap?.renderModuleStatus?.();
        toast('Modulstatus aktualisiert.');
        break;
      case 'data':
        updateCounts();
        toast(`Lokale Daten: ${countLocal('elyon_mobile_product_ideas')} Ideen, ${countLocal('elyon_mobile_agent_queue')} Agenten-Aufgaben, ${countLocal('elyon_mobile_notifications')} Meldungen.`);
        break;
      case 'install':
        toast('iPhone: Teilen → Zum Home-Bildschirm. Android: Browser-Menü → App installieren.');
        break;
    }
  }

  window.ElyonMoreUI = { render: renderMore, updateCounts };
  document.addEventListener('DOMContentLoaded', () => setTimeout(renderMore, 200));
})();
