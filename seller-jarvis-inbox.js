(() => {
  "use strict";

  const API_URL = "/api/jarvis-inbox";
  const ROOT_ID = "jarvisInboxTab";
  const BUTTON_ID = "jarvisInboxBtn";
  const STYLE_ID = "jarvisInboxStyles";
  const VERSION = "jarvis-inbox-v1";
  let snapshot = { items: [], counts: {}, capabilities: {} };
  let activeFilter = "all";
  let loading = false;

  function text(value, max = 4000) {
    return String(value ?? "").trim().slice(0, max);
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function euro(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "–";
    try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(number); }
    catch { return `${number.toFixed(2)} €`; }
  }

  function percent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)} %` : "–";
  }

  function relativeTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "";
    const diff = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "gerade eben";
    if (minutes < 60) return `vor ${minutes} Min.`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.round(hours / 24);
    return `vor ${days} Tag${days === 1 ? "" : "en"}`;
  }

  function safeUrl(value) {
    try {
      const url = new URL(text(value, 2500));
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch { return ""; }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{display:none}
      #${ROOT_ID}.active{display:block}
      #${BUTTON_ID}{position:relative}
      #${BUTTON_ID} .jarvis-inbox-badge{display:none;min-width:20px;height:20px;padding:0 6px;margin-left:7px;border-radius:999px;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-size:11px;font-weight:950}
      #${BUTTON_ID}[data-count]:not([data-count="0"]) .jarvis-inbox-badge{display:inline-flex}
      .jarvis-inbox-shell{display:grid;gap:16px}
      .jarvis-inbox-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px;border-radius:26px;background:linear-gradient(135deg,rgba(37,99,235,.15),rgba(139,92,246,.12));border:1px solid rgba(96,165,250,.18)}
      .jarvis-inbox-hero h2{font-size:28px;margin:0 0 7px;letter-spacing:-.035em}.jarvis-inbox-hero p{color:#cbd5e1;line-height:1.5;margin:0;max-width:720px}
      .jarvis-inbox-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .jarvis-inbox-metric{padding:15px 16px;border-radius:18px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09)}
      .jarvis-inbox-metric small{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}.jarvis-inbox-metric strong{font-size:25px;letter-spacing:-.04em}
      .jarvis-inbox-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.jarvis-inbox-filter{padding:9px 12px;border-radius:999px;font-size:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)}.jarvis-inbox-filter.active{background:linear-gradient(135deg,#3b82f6,#8b5cf6)}
      .jarvis-inbox-list{display:grid;gap:13px}.jarvis-inbox-card{padding:18px;border-radius:22px;background:rgba(2,6,23,.48);border:1px solid rgba(255,255,255,.1);box-shadow:0 16px 44px rgba(0,0,0,.18)}
      .jarvis-inbox-card.is-unread{border-color:rgba(96,165,250,.35);box-shadow:0 16px 50px rgba(37,99,235,.1)}.jarvis-inbox-card.is-error{border-color:rgba(239,68,68,.3)}
      .jarvis-inbox-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.jarvis-inbox-title{font-size:18px;font-weight:900;letter-spacing:-.02em}.jarvis-inbox-eyebrow{color:#93c5fd;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
      .jarvis-inbox-pills{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.jarvis-inbox-pill{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);color:#cbd5e1;font-size:11px;font-weight:750}.jarvis-inbox-pill.good{color:#86efac;border-color:rgba(34,197,94,.24);background:rgba(34,197,94,.1)}.jarvis-inbox-pill.warn{color:#fde68a;border-color:rgba(245,158,11,.24);background:rgba(245,158,11,.09)}.jarvis-inbox-pill.bad{color:#fca5a5;border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.09)}
      .jarvis-inbox-summary{margin-top:13px;color:#dbeafe;font-size:13px;line-height:1.55}.jarvis-inbox-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.jarvis-inbox-actions button{padding:9px 11px;border-radius:12px;font-size:12px}.jarvis-inbox-actions button[disabled]{opacity:.45;cursor:not-allowed;transform:none}
      .jarvis-inbox-details{margin-top:13px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px}.jarvis-inbox-details summary{cursor:pointer;color:#bfdbfe;font-size:12px;font-weight:900}.jarvis-inbox-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.jarvis-inbox-detail{padding:11px 12px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}.jarvis-inbox-detail small{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}.jarvis-inbox-detail div{font-size:12px;line-height:1.5;overflow-wrap:anywhere}
      .jarvis-inbox-evidence{display:grid;gap:7px;margin-top:10px}.jarvis-inbox-evidence a{display:block;padding:9px 10px;border-radius:12px;background:rgba(59,130,246,.08);border:1px solid rgba(96,165,250,.13);color:#bfdbfe;font-size:12px;overflow-wrap:anywhere}.jarvis-inbox-empty{padding:38px 20px;text-align:center;color:#94a3b8;border:1px dashed rgba(255,255,255,.16);border-radius:22px}.jarvis-inbox-note{padding:11px 13px;border-radius:14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.16);color:#fde68a;font-size:12px;line-height:1.5;margin-top:10px}.jarvis-inbox-toast{position:fixed;right:24px;bottom:24px;z-index:4000;max-width:420px;padding:13px 15px;border-radius:16px;background:rgba(15,23,42,.97);border:1px solid rgba(96,165,250,.22);box-shadow:0 20px 60px rgba(0,0,0,.36);color:#e2e8f0;font-size:13px;line-height:1.45}
      @media(max-width:850px){.jarvis-inbox-metrics{grid-template-columns:1fr 1fr}.jarvis-inbox-hero{display:block}.jarvis-inbox-hero button{margin-top:14px}.jarvis-inbox-detail-grid{grid-template-columns:1fr}}
      @media(max-width:520px){.jarvis-inbox-metrics{grid-template-columns:1fr}.jarvis-inbox-card-head{display:block}}
    `;
    document.head.appendChild(style);
  }

  function createRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.className = "tab";
    root.dataset.jarvisInboxVersion = VERSION;
    root.innerHTML = `
      <div class="jarvis-inbox-shell">
        <div class="jarvis-inbox-hero">
          <div><div class="jarvis-inbox-eyebrow">Jarvis · Übergabestelle</div><h2>🤖 Jarvis Inbox</h2><p>Hier landen abgeschlossene Jarvis-Aufträge, Produktchancen, Warnungen und Freigaben dauerhaft. Der Chat meldet nur den Abschluss – die eigentliche Bearbeitung findet hier statt.</p></div>
          <button type="button" class="secondary" data-inbox-refresh>↻ Aktualisieren</button>
        </div>
        <div class="jarvis-inbox-metrics" data-inbox-metrics></div>
        <div class="jarvis-inbox-toolbar" data-inbox-filters></div>
        <div class="jarvis-inbox-list" data-inbox-list><div class="jarvis-inbox-empty">Jarvis Inbox wird geladen …</div></div>
      </div>`;
    const tabs = document.querySelector(".tabs");
    if (tabs?.parentNode) tabs.parentNode.insertBefore(root, tabs.nextSibling);
    else document.querySelector("main")?.appendChild(root);
    root.querySelector("[data-inbox-refresh]")?.addEventListener("click", () => refresh(true));
    return root;
  }

  function createButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;
    const dashboard = document.getElementById("dashboardBtn");
    if (!dashboard) return null;
    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "secondary";
    button.innerHTML = `🤖 Jarvis Inbox <span class="jarvis-inbox-badge">0</span>`;
    button.dataset.count = "0";
    dashboard.insertAdjacentElement("afterend", button);
    button.addEventListener("click", () => openInbox());
    return button;
  }

  function showOnlyInbox() {
    document.querySelectorAll(".tab").forEach((node) => node.classList.remove("active"));
    document.getElementById(ROOT_ID)?.classList.add("active");
    const menu = document.getElementById("mainMenu");
    if (menu) menu.selectedIndex = 0;
    try { window.dispatchEvent(new CustomEvent("elyon:tab-changed", { detail: { tabId: ROOT_ID } })); } catch { /* optional */ }
  }

  function openInbox() {
    createRoot();
    showOnlyInbox();
    refresh(true);
  }

  function metric(label, value) {
    const node = document.createElement("div");
    node.className = "jarvis-inbox-metric";
    const small = document.createElement("small"); small.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = String(value ?? 0);
    node.append(small, strong);
    return node;
  }

  function renderMetrics() {
    const host = document.querySelector(`#${ROOT_ID} [data-inbox-metrics]`);
    if (!host) return;
    host.replaceChildren(
      metric("Neu", snapshot.counts?.unread || 0),
      metric("In Prüfung", snapshot.counts?.opened || 0),
      metric("Erledigt", snapshot.counts?.done || 0),
      metric("Fehler", snapshot.counts?.errors || 0),
    );
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      const count = Number(snapshot.counts?.unread || 0);
      button.dataset.count = String(count);
      const badge = button.querySelector(".jarvis-inbox-badge");
      if (badge) badge.textContent = count > 99 ? "99+" : String(count);
    }
  }

  function matchesFilter(item) {
    if (activeFilter === "all") return true;
    if (activeFilter === "products") return item.kind === "product";
    if (activeFilter === "unread") return item.state === "unread";
    if (activeFilter === "review") return item.state === "opened";
    if (activeFilter === "errors") return item.kind === "error";
    if (activeFilter === "done") return ["approved", "rejected", "archived"].includes(item.state);
    return true;
  }

  function renderFilters() {
    const host = document.querySelector(`#${ROOT_ID} [data-inbox-filters]`);
    if (!host) return;
    const filters = [["all", "Alle"], ["unread", "Neu"], ["products", "Produkte"], ["review", "In Prüfung"], ["errors", "Fehler"], ["done", "Erledigt"]];
    host.replaceChildren(...filters.map(([id, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `jarvis-inbox-filter${activeFilter === id ? " active" : ""}`;
      button.textContent = label;
      button.addEventListener("click", () => { activeFilter = id; renderFilters(); renderList(); });
      return button;
    }));
  }

  function pill(label, tone = "") {
    const node = document.createElement("span");
    node.className = `jarvis-inbox-pill${tone ? ` ${tone}` : ""}`;
    node.textContent = label;
    return node;
  }

  function detail(label, value) {
    const node = document.createElement("div"); node.className = "jarvis-inbox-detail";
    const small = document.createElement("small"); small.textContent = label;
    const content = document.createElement("div"); content.textContent = text(value, 6000) || "–";
    node.append(small, content);
    return node;
  }

  function toast(message) {
    document.querySelector(".jarvis-inbox-toast")?.remove();
    const node = document.createElement("div"); node.className = "jarvis-inbox-toast"; node.textContent = text(message, 1200);
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4500);
  }

  async function api(body = null) {
    const response = await fetch(API_URL, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      const error = new Error(data?.message || data?.error || `Jarvis Inbox HTTP ${response.status}`);
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function mutate(item, action) {
    try {
      if (action === "retry") {
        if (window.ElyonJarvis?.chat) {
          await window.ElyonJarvis.chat(item.query || "Finde 1 neues risikoarmes Evergreen-Produkt für eBay Dropshipping.");
          toast("Market Scout wurde neu gestartet. Jarvis meldet sich im Chat und aktualisiert danach die Inbox.");
          return;
        }
      }
      const data = await api({ action, taskId: item.taskId, itemKey: item.itemKey });
      if (action === "transfer_to_nova") toast(data?.message || "Produkt wurde an Nova übergeben.");
      else if (action === "retry") toast("Market Scout wurde neu gestartet.");
      else toast(action === "reject" ? "Produkt verworfen." : action === "archive" ? "Eintrag archiviert." : "Inbox aktualisiert.");
      await refresh(true);
    } catch (error) {
      toast(error?.message || "Aktion konnte nicht ausgeführt werden.");
    }
  }

  function freshnessWarning(candidate) {
    const evidenceText = (Array.isArray(candidate.evidence) ? candidate.evidence : []).map((entry) => `${entry?.label || ""} ${entry?.url || ""}`).join(" ");
    const years = [...evidenceText.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1])).filter(Number.isFinite);
    if (!years.length) return "Quellenalter nicht eindeutig erkennbar – vor Produktfreigabe Aktualität prüfen.";
    const newest = Math.max(...years);
    if (newest < new Date().getFullYear()) return `⚠️ Mindestens ein Marktnachweis wirkt veraltet (neueste erkennbare Jahresangabe: ${newest}). Vor der Produktentscheidung neu validieren.`;
    return "";
  }

  function productCard(item) {
    const candidate = object(item.candidate);
    const card = document.createElement("article");
    card.className = `jarvis-inbox-card${item.state === "unread" ? " is-unread" : ""}`;
    const head = document.createElement("div"); head.className = "jarvis-inbox-card-head";
    const left = document.createElement("div");
    const eyebrow = document.createElement("div"); eyebrow.className = "jarvis-inbox-eyebrow"; eyebrow.textContent = `🔎 Market Scout · ${relativeTime(item.finishedAt || item.updatedAt)}`;
    const title = document.createElement("div"); title.className = "jarvis-inbox-title"; title.textContent = text(candidate.productName, 500) || "Produktkandidat";
    const pills = document.createElement("div"); pills.className = "jarvis-inbox-pills";
    pills.append(
      pill(`EK ${euro(candidate.purchasePrice)}`),
      pill(`VK ${euro(candidate.sellingPrice)}`),
      pill(`Marge ${percent(candidate.estimatedMarginPercent)}`, Number(candidate.estimatedMarginPercent) >= 30 ? "good" : "warn"),
      pill(`Risiko ${text(candidate.riskLevel, 40) || "?"}`, /low/i.test(candidate.riskLevel || "") ? "good" : "warn"),
      pill(`MOQ ${Number(candidate.minimumOrderQuantity || 0) || "?"}`, Number(candidate.minimumOrderQuantity) === 1 ? "good" : "warn"),
      pill(text(candidate.supplierRegion, 80) || "Region offen"),
    );
    left.append(eyebrow, title, pills);
    const state = pill(item.state === "unread" ? "NEU" : item.state === "opened" ? "IN PRÜFUNG" : item.state === "approved" ? "FREIGEGEBEN" : item.state === "rejected" ? "VERWORFEN" : "ARCHIV", item.state === "approved" ? "good" : item.state === "rejected" ? "bad" : "");
    head.append(left, state);
    card.appendChild(head);

    const summary = document.createElement("div"); summary.className = "jarvis-inbox-summary";
    summary.textContent = text(candidate.rationale, 4000) || text(candidate.demandSignal, 4000) || "Jarvis hat diesen Kandidaten als belegte Produktchance eingeordnet.";
    card.appendChild(summary);

    const freshness = freshnessWarning(candidate);
    if (freshness) { const note = document.createElement("div"); note.className = "jarvis-inbox-note"; note.textContent = freshness; card.appendChild(note); }

    const actions = document.createElement("div"); actions.className = "jarvis-inbox-actions";
    const detailsButton = document.createElement("button"); detailsButton.type = "button"; detailsButton.className = "secondary"; detailsButton.textContent = "Details ansehen";
    const nova = document.createElement("button"); nova.type = "button"; nova.textContent = item.workflow?.novaTransferStatus === "transferred" ? "✓ In Nova" : "In Nova übernehmen";
    const novaReady = snapshot.capabilities?.novaTransferConfigured === true;
    nova.disabled = !novaReady || item.workflow?.novaTransferStatus === "transferred" || item.state === "rejected";
    nova.title = !novaReady ? "Serverseitige Company-OS-Nova-Brücke noch nicht konfiguriert." : "Als Rohimport in Company OS → Nova Eingang übernehmen.";
    nova.addEventListener("click", () => mutate(item, "transfer_to_nova"));
    const reject = document.createElement("button"); reject.type = "button"; reject.className = "danger"; reject.textContent = "Verwerfen"; reject.disabled = item.state === "rejected"; reject.addEventListener("click", () => mutate(item, "reject"));
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary"; retry.textContent = "Neu recherchieren"; retry.addEventListener("click", () => mutate(item, "retry"));
    actions.append(detailsButton, nova, reject, retry); card.appendChild(actions);

    const details = document.createElement("details"); details.className = "jarvis-inbox-details";
    const detailsSummary = document.createElement("summary"); detailsSummary.textContent = "Vollständige Research-Daten"; details.appendChild(detailsSummary);
    const grid = document.createElement("div"); grid.className = "jarvis-inbox-detail-grid";
    grid.append(
      detail("Supplier", candidate.supplierSource),
      detail("Supplier-Region", candidate.supplierRegion),
      detail("Dropshipping", candidate.dropshippingSupported === true ? "verifiziert" : "nicht verifiziert"),
      detail("Einzelversand", candidate.supplierShipsPerOrder === true ? "ja" : "nicht belegt"),
      detail("Fulfillment-Nachweis", candidate.fulfillmentEvidence),
      detail("Nachfrage", candidate.demandSignal),
      detail("Wettbewerb", candidate.competitionLevel),
      detail("Recherche-Strategie", item.researchStrategy || "product_first"),
    );
    details.appendChild(grid);
    const evidenceHost = document.createElement("div"); evidenceHost.className = "jarvis-inbox-evidence";
    (Array.isArray(candidate.evidence) ? candidate.evidence : []).slice(0, 12).forEach((entry) => {
      const url = safeUrl(entry?.url); if (!url) return;
      const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = `${text(entry?.type, 80) || "Quelle"}: ${text(entry?.label, 300) || url}`;
      evidenceHost.appendChild(link);
    });
    const supplierUrl = safeUrl(candidate.supplierUrl);
    if (supplierUrl && ![...evidenceHost.querySelectorAll("a")].some((a) => a.href === supplierUrl)) {
      const link = document.createElement("a"); link.href = supplierUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = `Supplier: ${supplierUrl}`; evidenceHost.prepend(link);
    }
    details.appendChild(evidenceHost); card.appendChild(details);
    detailsButton.addEventListener("click", () => { details.open = !details.open; if (item.state === "unread") mutate(item, "open"); });
    details.addEventListener("toggle", () => { if (details.open && item.state === "unread") mutate(item, "open"); }, { once: true });
    return card;
  }

  function errorCard(item) {
    const card = document.createElement("article"); card.className = `jarvis-inbox-card is-error${item.state === "unread" ? " is-unread" : ""}`;
    const eyebrow = document.createElement("div"); eyebrow.className = "jarvis-inbox-eyebrow"; eyebrow.textContent = `⚠️ Market Scout Fehler · ${relativeTime(item.finishedAt || item.updatedAt)}`;
    const title = document.createElement("div"); title.className = "jarvis-inbox-title"; title.textContent = "Hintergrundauftrag nicht abgeschlossen";
    const summary = document.createElement("div"); summary.className = "jarvis-inbox-summary"; summary.textContent = text(item.error, 3000);
    const actions = document.createElement("div"); actions.className = "jarvis-inbox-actions";
    const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Neu versuchen"; retry.addEventListener("click", () => mutate(item, "retry"));
    const archive = document.createElement("button"); archive.type = "button"; archive.className = "secondary"; archive.textContent = "Archivieren"; archive.addEventListener("click", () => mutate(item, "archive"));
    actions.append(retry, archive); card.append(eyebrow, title, summary, actions); return card;
  }

  function renderList() {
    const host = document.querySelector(`#${ROOT_ID} [data-inbox-list]`);
    if (!host) return;
    const items = (snapshot.items || []).filter(matchesFilter);
    if (!items.length) {
      const empty = document.createElement("div"); empty.className = "jarvis-inbox-empty";
      empty.textContent = loading ? "Jarvis Inbox wird geladen …" : "Für diesen Filter gibt es aktuell keine Einträge.";
      host.replaceChildren(empty); return;
    }
    host.replaceChildren(...items.map((item) => item.kind === "error" ? errorCard(item) : productCard(item)));
  }

  async function refresh(force = false) {
    if (loading && !force) return;
    loading = true; renderList();
    try {
      const response = await api();
      snapshot = { items: Array.isArray(response.items) ? response.items : [], counts: object(response.counts), capabilities: object(response.capabilities) };
      renderMetrics(); renderFilters(); renderList();
    } catch (error) {
      const host = document.querySelector(`#${ROOT_ID} [data-inbox-list]`);
      if (host) { const empty = document.createElement("div"); empty.className = "jarvis-inbox-empty"; empty.textContent = `Jarvis Inbox konnte nicht geladen werden: ${text(error?.message, 500)}`; host.replaceChildren(empty); }
    } finally { loading = false; }
  }

  function mount() {
    injectStyles(); createRoot(); createButton();
    renderMetrics(); renderFilters();
    void refresh(false);
    window.addEventListener("elyon:jarvis-async-result", () => setTimeout(() => refresh(true), 300));
    window.addEventListener("elyon:seller-authenticated", () => refresh(true));
    return true;
  }

  window.ElyonJarvisInbox = Object.freeze({ version: VERSION, mount, open: openInbox, refresh });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
