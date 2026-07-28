(() => {
  "use strict";

  const STYLE_ID = "elyonSettingsLayoutExperimentStyles";
  const INTRO_ID = "elyonSettingsLayoutExperimentIntro";
  const HIDDEN_IMPORT_ATTR = "data-elyon-settings-import-hidden";
  const SYSTEM_STATUS_LABEL = "3. 🩺 Systemstatus & Diagnose";
  const SYSTEM_STATUS_HINT = "Verbindungen, Datenquellen und technische Betriebsbereitschaft prüfen";
  const ORDERS_IMPORT_TITLE = "1. 📦 eBay-Bestellungen importieren";
  const ORDERS_IMPORT_HINT = "Neue eBay-Bestellungen abrufen, die Vorschau kontrollieren und anschließend in den Elyon-Workflow übernehmen.";
  let observer = null;
  let scheduled = false;

  const text = (value) => String(value ?? "").trim();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${INTRO_ID}{margin:0 0 16px;padding:14px 16px;border-radius:18px;background:rgba(59,130,246,.07);border:1px solid rgba(96,165,250,.18)}
      #${INTRO_ID} strong{display:block;margin-bottom:5px;color:#dbeafe;font-size:14px}
      #${INTRO_ID} p{margin:0;color:#94a3b8;font-size:12px;line-height:1.5}
      #settingsTab [${HIDDEN_IMPORT_ATTR}="1"]{display:none!important}
      #settingsTab>.card[data-elyon-settings-section]{position:relative}
      #settingsTab>.card[data-elyon-settings-section]::before{content:attr(data-elyon-settings-kicker);display:block;margin-bottom:8px;color:#60a5fa;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      #ordersTab [data-elyon-orders-import-note]{margin:0 0 12px;padding:9px 11px;border-radius:13px;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.16);color:#bbf7d0;font-size:11px;line-height:1.45}
    `;
    document.head.appendChild(style);
  }

  function directCardContaining(root, selector) {
    if (!root) return null;
    return [...root.children].find((child) =>
      child instanceof HTMLElement
      && child.classList.contains("card")
      && child.querySelector(selector),
    ) || null;
  }

  function setCardCopy(card, { title, hint, kicker }) {
    if (!card) return;
    card.dataset.elyonSettingsSection = "1";
    card.dataset.elyonSettingsKicker = kicker;
    const heading = card.querySelector(":scope > h2");
    const description = card.querySelector(":scope > .hint");
    if (heading && text(heading.textContent) !== title) heading.textContent = title;
    if (description && text(description.textContent) !== hint) description.textContent = hint;
  }

  function ensureIntro(settings, firstCard) {
    let intro = document.getElementById(INTRO_ID);
    if (!intro) {
      intro = document.createElement("div");
      intro.id = INTRO_ID;
      intro.innerHTML = `
        <strong>Testaufbau der Einstellungen</strong>
        <p>Konfiguration und Diagnose bleiben hier. Operative Arbeit wie der eBay-Bestellimport liegt direkt im Bereich „Bestellungen“.</p>
      `;
    }
    if (intro.parentElement !== settings || intro.nextElementSibling !== firstCard) {
      settings.insertBefore(intro, firstCard || settings.firstChild);
    }
  }

  function configureSystemStatus(settings) {
    const wrapper = settings?.querySelector("#elyonSystemDataStatusSettings");
    if (!wrapper) return;
    wrapper.dataset.elyonSettingsSection = "3";
    const summary = wrapper.querySelector(":scope > summary");
    if (!summary || summary.dataset.elyonSettingsExperimentLabel === "1") return;
    summary.dataset.elyonSettingsExperimentLabel = "1";
    summary.innerHTML = `<span>${SYSTEM_STATUS_LABEL}<small>${SYSTEM_STATUS_HINT}</small></span>`;
  }

  function hideDuplicateSettingsImport(settings) {
    const duplicateImport = directCardContaining(settings, "#ebayOrdersRange");
    if (!duplicateImport || duplicateImport.getAttribute(HIDDEN_IMPORT_ATTR) === "1") return;
    duplicateImport.setAttribute(HIDDEN_IMPORT_ATTR, "1");
    duplicateImport.setAttribute("aria-hidden", "true");
    duplicateImport.hidden = true;
  }

  function configureOrdersImport() {
    const orders = document.getElementById("ordersTab");
    const importCard = directCardContaining(orders, "#ebayOrdersRangeOrders");
    if (!importCard) return;

    const heading = importCard.querySelector(":scope > h2");
    const hint = importCard.querySelector(":scope > .hint");
    if (heading && text(heading.textContent) !== ORDERS_IMPORT_TITLE) heading.textContent = ORDERS_IMPORT_TITLE;
    if (hint && text(hint.textContent) !== ORDERS_IMPORT_HINT) hint.textContent = ORDERS_IMPORT_HINT;

    let note = importCard.querySelector("[data-elyon-orders-import-note]");
    if (!note) {
      note = document.createElement("p");
      note.dataset.elyonOrdersImportNote = "1";
      note.textContent = "Dieser operative Import liegt testweise direkt bei den Bestellungen statt in den Einstellungen.";
      const firstRow = importCard.querySelector(":scope > .row");
      importCard.insertBefore(note, firstRow || null);
    }
  }

  function configureSettings() {
    scheduled = false;
    installStyles();

    const settings = document.getElementById("settingsTab");
    if (!settings) return false;

    const integrations = directCardContaining(settings, "#intBackendStatus");
    const synchronization = directCardContaining(settings, "#googleSheetsSyncUrl");
    if (!integrations || !synchronization) return false;

    settings.dataset.elyonSettingsLayoutExperiment = "1";
    ensureIntro(settings, integrations);

    setCardCopy(integrations, {
      kicker: "Bereich 1",
      title: "1. 🔌 Integrationen & API-Verbindungen",
      hint: "Backend, eBay, CJ und weitere Verbindungen zentral einrichten und technisch prüfen.",
    });

    setCardCopy(synchronization, {
      kicker: "Bereich 2",
      title: "2. 🔄 Daten & Synchronisierung",
      hint: "Google Sheets, Datenabgleich und Synchronisierungsregeln verwalten. Operative Bestellimporte bleiben unter Bestellungen.",
    });

    hideDuplicateSettingsImport(settings);
    configureSystemStatus(settings);
    configureOrdersImport();
    return true;
  }

  function scheduleConfigure() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(configureSettings);
  }

  function observe() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(scheduleConfigure);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function install() {
    installStyles();
    observe();
    configureSettings();
    [150, 450, 900, 1600].forEach((delay) => setTimeout(scheduleConfigure, delay));
  }

  window.ElyonSettingsLayoutExperiment = {
    apply: configureSettings,
    refresh: scheduleConfigure,
    enabled: true,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
