(() => {
  const $ = (id) => document.getElementById(id);
  const STORAGE_NOTICES = 'elyon_mobile_notifications';

  function isEnabled() {
    return document.body.dataset.flags?.split(' ').includes('pushFoundation') || document.body.classList.contains('push-v1-enabled');
  }

  function toast(message) {
    const el = $('sheetToast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4500);
  }

  function installStyles() {
    if (document.getElementById('pushV1Styles')) return;
    const style = document.createElement('style');
    style.id = 'pushV1Styles';
    style.textContent = `
      .push-v1-panel{padding:14px 15px;border-radius:20px;background:rgba(15,23,42,.70);border:1px solid rgba(34,197,94,.22);display:grid;gap:10px}
      .push-v1-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.push-v1-head b{font-size:14px}.push-v1-head small{display:block;color:#94a3b8;margin-top:3px;line-height:1.35}
      .push-v1-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.push-v1-actions button{padding:11px;border-radius:15px;background:rgba(34,197,94,.13);border:1px solid rgba(34,197,94,.22);color:#bbf7d0;font-weight:900}
      .push-v1-list{display:grid;gap:8px}.push-v1-item{padding:11px;border-radius:14px;background:rgba(2,6,23,.40);border:1px solid rgba(148,163,184,.14);font-size:12px;color:#cbd5e1;line-height:1.4}.push-v1-item b{display:block;color:#e5e7eb;margin-bottom:3px}
    `;
    document.head.appendChild(style);
  }

  function readNotices() {
    try { return JSON.parse(localStorage.getItem(STORAGE_NOTICES) || '[]'); } catch { return []; }
  }

  function saveNotice(type, title, body) {
    const notices = readNotices();
    const item = { id: `notice-${Date.now()}`, type, title, body, createdAt: new Date().toISOString(), read: false };
    notices.unshift(item);
    localStorage.setItem(STORAGE_NOTICES, JSON.stringify(notices.slice(0, 50)));
    renderNotices();
    return item;
  }

  async function requestPermission() {
    if (!('Notification' in window)) {
      toast('Browser Notifications werden hier nicht unterstützt.');
      saveNotice('system', 'Push nicht verfügbar', 'Dieser Browser unterstützt keine lokalen Notifications.');
      return 'unsupported';
    }
    if (Notification.permission === 'granted') return 'granted';
    const permission = await Notification.requestPermission();
    saveNotice('permission', 'Push Berechtigung', `Status: ${permission}`);
    return permission;
  }

  async function sendTestNotification() {
    if (!isEnabled()) return toast('Push Foundation ist noch nicht online geschaltet.');
    const permission = await requestPermission();
    const notice = saveNotice('test', 'Elyon Test-Benachrichtigung', 'Push-Grundlage funktioniert lokal im Browser.');
    if (permission === 'granted') {
      new Notification('Elyon Test', { body: notice.body, tag: 'elyon-test' });
    } else {
      toast('Notification gespeichert. Browser-Push ist nicht erlaubt.');
    }
  }

  function buildSystemNotice() {
    const healthText = $('healthScore')?.textContent || 'unbekannt';
    const drive = document.body.dataset.googleDrive === 'connected' ? 'Google Drive verbunden' : 'Google Drive prüfen';
    saveNotice('system', 'Systemstatus', `Health: ${healthText}. ${drive}.`);
    toast('Lokale Systemmeldung gespeichert.');
  }

  function renderNotices() {
    const list = $('pushV1List');
    if (!list) return;
    const notices = readNotices().slice(0, 6);
    list.innerHTML = notices.length ? notices.map((notice) => `
      <div class="push-v1-item"><b>${notice.title}</b>${notice.body}<br><small>${new Date(notice.createdAt).toLocaleString('de-DE')}</small></div>
    `).join('') : '<div class="push-v1-item"><b>Keine Meldungen</b>Noch keine lokalen Benachrichtigungen vorhanden.</div>';
  }

  function ensurePanel() {
    if (!isEnabled()) return null;
    installStyles();
    if ($('pushV1Panel')) return $('pushV1Panel');
    const more = $('more');
    if (!more) return null;
    const panel = document.createElement('div');
    panel.innerHTML = `
      <h2>Notification Center</h2>
      <div class="push-v1-panel" id="pushV1Panel">
        <div class="push-v1-head">
          <div><b>Push Foundation</b><small>Lokale Benachrichtigungen, Berechtigungscheck und Notification Center. Keine Server-Pushes.</small></div>
          <span class="badge green">v1.4</span>
        </div>
        <div class="push-v1-actions">
          <button id="pushPermissionBtn">Berechtigung</button>
          <button id="pushTestBtn">Test Push</button>
          <button id="pushStatusBtn">Statusmeldung</button>
          <button id="pushClearBtn">Leeren</button>
        </div>
        <div class="push-v1-list" id="pushV1List"></div>
      </div>
    `;
    more.appendChild(panel);
    $('pushPermissionBtn')?.addEventListener('click', requestPermission);
    $('pushTestBtn')?.addEventListener('click', sendTestNotification);
    $('pushStatusBtn')?.addEventListener('click', buildSystemNotice);
    $('pushClearBtn')?.addEventListener('click', () => { localStorage.setItem(STORAGE_NOTICES, '[]'); renderNotices(); toast('Notification Center geleert.'); });
    renderNotices();
    return $('pushV1Panel');
  }

  function watchFlags() {
    ensurePanel();
    const observer = new MutationObserver(() => ensurePanel());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-flags'] });
  }

  window.ElyonPushV1 = { mount: ensurePanel, notify: saveNotice, test: sendTestNotification, permission: requestPermission };
  document.addEventListener('DOMContentLoaded', watchFlags);
})();
