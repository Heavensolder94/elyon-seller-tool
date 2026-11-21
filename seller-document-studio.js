(function () {
  "use strict";

  const TAB_ID = "elyonDocumentStudioTab";
  const API = "/api/document-studio";
  const labels = {
    blank: "Freies Dokument", letter: "Geschäftsbrief", offer: "Angebot",
    contract: "Vertragsentwurf", form: "Formular", delivery: "Lieferschein",
    purchase_note: "Einkaufsnotiz", complaint: "Reklamationsantwort"
  };
  const templates = {
    blank: "<h2>Neues Dokument</h2><p>Schreibe hier deinen Text.</p>",
    letter: "<p>{{Datum}}</p><h2>Betreff</h2><p>Sehr geehrte Damen und Herren,</p><p>hiermit möchten wir Sie über Folgendes informieren:</p><p>...</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>",
    offer: "<h2>Angebot</h2><p>Sehr geehrte Damen und Herren,</p><p>vielen Dank für Ihr Interesse. Wir bieten Ihnen Folgendes an:</p><table><tr><th>Position</th><th>Beschreibung</th><th>Preis</th></tr><tr><td>1</td><td>Leistung oder Artikel</td><td>0,00 €</td></tr></table><p>Dieses Angebot ist freibleibend, sofern nichts anderes vereinbart ist.</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>",
    contract: "<h2>Vertragsentwurf</h2><p>Zwischen {{Firma}} und {{Empfänger}}</p><h3>1. Vertragsgegenstand</h3><p>...</p><h3>2. Leistung und Vergütung</h3><p>...</p><h3>3. Laufzeit und Beendigung</h3><p>...</p><p><strong>Entwurf: vor Unterzeichnung fachlich prüfen.</strong></p>",
    form: "<h2>Formular</h2><p>Name: ________________________________</p><p>Datum: ________________________________</p><p>Aktenzeichen: {{Referenz}}</p><p>Anmerkungen:</p><p>_____________________________________</p><p>Unterschrift: __________________________</p>",
    delivery: "<h2>Lieferschein</h2><p>Empfänger: {{Empfänger}}</p><p>Bestellreferenz: {{Referenz}}</p><table><tr><th>Menge</th><th>Artikel</th></tr><tr><td>1</td><td>Artikelbezeichnung</td></tr></table><p>Auslieferungsdatum: {{Datum}}</p>",
    purchase_note: "<h2>Einkaufsnotiz</h2><p>Bezugsquelle / Lieferant: ____________________</p><p>Referenz: {{Referenz}}</p><p>Artikel: ____________________</p><p>Bezahlt am: ____________________</p><p>Beleg des Lieferanten separat aufbewahren. Diese Notiz ist keine Lieferantenrechnung.</p>",
    complaint: "<h2>Antwort auf Ihre Reklamation</h2><p>Sehr geehrte Damen und Herren,</p><p>vielen Dank für Ihre Nachricht bezüglich {{Referenz}}.</p><p>Wir prüfen Ihr Anliegen und melden uns mit einer passenden Lösung.</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"
  };
  const state = { revision: null, documents: [], current: null, profile: {}, dirty: false, showArchived: false, search: "", preview: false, loading: false };

  const el = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function sanitize(html) {
    const parsed = new DOMParser().parseFromString("<div>" + String(html || "") + "</div>", "text/html");
    const allowed = new Set(["p", "div", "br", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "td", "th", "hr"]);
    const blocked = new Set(["script", "style", "svg", "math", "iframe", "object", "embed", "template", "form", "input", "button"]);
    const result = document.createElement("div");
    function visit(parent, target) {
      for (const child of parent.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode(child.textContent || "")); continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName.toLowerCase();
        if (blocked.has(tag)) continue;
        if (!allowed.has(tag)) { visit(child, target); continue; }
        const safe = document.createElement(tag);
        target.appendChild(safe);
        visit(child, safe);
      }
    }
    visit(parsed.body.firstElementChild || parsed.body, result);
    return result.innerHTML;
  }

  function status(message, error) {
    const output = el("edsStatus");
    if (!output) return;
    output.textContent = message;
    output.classList.toggle("error", Boolean(error));
  }

  async function api(action, options) {
    const isGet = !options || options.__get === true;
    const query = new URLSearchParams({ action });
    if (options?.id && isGet) query.set("id", options.id);
    const response = await fetch(API + "?" + query.toString(), {
      method: isGet ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", ...(isGet ? {} : { "Content-Type": "application/json" }) },
      body: isGet ? undefined : JSON.stringify(options)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || data.error || "Dokumenten-API HTTP " + response.status);
    return data;
  }

  function newId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return "doc_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function newDocument(kind) {
    const type = Object.hasOwn(templates, kind) ? kind : "blank";
    return { id: newId(), kind: type, title: labels[type] + " – " + new Date().toLocaleDateString("de-DE"), recipient: "", reference: "", contentHtml: templates[type], createdAt: "", updatedAt: "", version: 0, archivedAt: null };
  }

  function ensureUI() {
    let root = el(TAB_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = TAB_ID;
    root.className = "tab";
    root.innerHTML = [
      '<div class="eds-head"><div><div class="eds-pill" style="display:inline-block">ELYON SELLERTOOL · DOKUMENTENSTUDIO</div><h2>Universelles Dokumentenstudio</h2><p class="eds-muted">Dokumente und Vorlagen bearbeiten, geschützt archivieren und exportieren.</p></div></div>',
      '<div class="eds-toolbar">',
        '<button type="button" class="eds-btn eds-primary" data-eds-action="new">+ Neues Dokument</button>',
        '<select id="edsTemplateSelect" class="eds-btn" aria-label="Dokumentvorlage"></select>',
        '<button type="button" class="eds-btn" data-eds-action="template">Vorlage anwenden</button>',
        '<button type="button" class="eds-btn eds-primary" data-eds-action="save">Speichern</button>',
        '<button type="button" class="eds-btn" data-eds-action="preview">Vorschau</button>',
        '<button type="button" class="eds-btn" data-eds-action="print">PDF / Drucken</button>',
        '<button type="button" class="eds-btn" data-eds-action="docx">Word (.docx)</button>',
        '<button type="button" class="eds-btn eds-danger" data-eds-action="archive" id="edsArchiveBtn">Archivieren</button>',
      '</div>',
      '<div class="eds-layout"><aside class="eds-card">',
        '<div class="eds-side-head"><strong>Dokumentenarchiv</strong><button type="button" class="eds-btn" data-eds-action="refresh">↻</button></div>',
        '<input class="eds-search" id="edsSearch" type="search" placeholder="Dokumente suchen …" aria-label="Dokumente suchen">',
        '<label class="eds-check" style="margin-top:12px"><input type="checkbox" id="edsShowArchived"> Archivierte anzeigen</label>',
        '<div id="edsList" class="eds-doc-list" aria-label="Dokumentenliste"></div>',
      '</aside><div class="eds-card">',
        '<div class="eds-meta">',
          '<label class="eds-field">Dokumententitel<input id="edsTitle" maxlength="120" autocomplete="off"></label>',
          '<label class="eds-field">Dokumentenart<select id="edsKind"></select></label>',
          '<label class="eds-field">Empfänger / Ansprechpartner<input id="edsRecipient" maxlength="300" autocomplete="off"></label>',
          '<label class="eds-field">Referenz (z. B. Bestellnummer)<input id="edsReference" maxlength="120" autocomplete="off"></label>',
        '</div>',
        '<div class="eds-editor-toolbar" role="toolbar" aria-label="Textformatierung">',
          '<button type="button" class="eds-btn" data-eds-format="bold" title="Fett"><strong>B</strong></button>',
          '<button type="button" class="eds-btn" data-eds-format="italic" title="Kursiv"><em>I</em></button>',
          '<button type="button" class="eds-btn" data-eds-format="underline" title="Unterstrichen"><u>U</u></button>',
          '<button type="button" class="eds-btn" data-eds-format="insertUnorderedList" title="Liste">• Liste</button>',
          '<button type="button" class="eds-btn" data-eds-format="formatBlock" data-eds-value="h2" title="Überschrift">H2</button>',
          '<button type="button" class="eds-btn" data-eds-insert="{{Firma}}">+ Firma</button>',
          '<button type="button" class="eds-btn" data-eds-insert="{{Empfänger}}">+ Empfänger</button>',
          '<button type="button" class="eds-btn" data-eds-insert="{{Datum}}">+ Datum</button>',
          '<button type="button" class="eds-btn" data-eds-insert="{{Referenz}}">+ Referenz</button>',
        '</div>',
        '<div id="edsEditor" class="eds-editor" contenteditable="true" role="textbox" aria-label="Dokumententext" aria-multiline="true" spellcheck="true"></div>',
        '<div id="edsPreview" class="eds-preview" aria-label="Dokumentenvorschau"></div>',
        '<div class="eds-bottom"><div id="edsStatus" class="eds-status" role="status" aria-live="polite">Lade Dokumente …</div><span class="eds-muted" id="edsVersion"></span></div>',
        '<p class="eds-legal">Rechnungen für eBay-Bestellungen werden weiterhin ausschließlich im bestehenden Rechnungsmodul erstellt und ausgestellt. Ein frei bearbeitbares Dokument ersetzt weder eine Lieferantenrechnung noch eine steuerlich korrekte Ausgangsrechnung.</p>',
      '</div></div>'
    ].join("");
    (document.querySelector("main") || document.body).appendChild(root);
    for (const [key, label] of Object.entries(labels)) {
      for (const select of [el("edsTemplateSelect"), el("edsKind")]) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = label;
        select.appendChild(option);
      }
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleChange);
    el("edsEditor").addEventListener("paste", (event) => {
      event.preventDefault();
      const plain = event.clipboardData?.getData("text/plain") || "";
      document.execCommand("insertText", false, plain.slice(0, 25000));
      handleInput({ target: el("edsEditor") });
    });
    return root;
  }

  function installEntry() {
    const menu = el("mainMenu");
    if (menu && !menu.querySelector('option[value="' + TAB_ID + '"]')) {
      const option = document.createElement("option");
      option.value = TAB_ID;
      option.textContent = "📄 Dokumentenstudio";
      menu.appendChild(option);
      menu.addEventListener("change", () => {
        if (menu.value === TAB_ID) openStudio(false);
        else hideStudio();
      });
    }
    const nav = document.querySelector(".nav-menu");
    if (nav && !el("elyonDocumentStudioNav")) {
      const link = document.createElement("a");
      link.id = "elyonDocumentStudioNav";
      link.href = "#dokumentenstudio";
      link.className = "nav-item";
      link.innerHTML = '<span class="nav-icon">📄</span><span>Dokumentenstudio</span>';
      link.addEventListener("click", (event) => { event.preventDefault(); openStudio(); });
      nav.appendChild(link);
    }
  }

  function hideStudio() {
    const root = el(TAB_ID);
    if (root) { root.classList.remove("active"); root.style.display = "none"; }
  }

  function openStudio(changeHash = true) {
    installEntry();
    const root = ensureUI();
    const menu = el("mainMenu");
    if (menu) menu.value = TAB_ID;
    document.querySelectorAll(".tab").forEach((node) => {
      if (node !== root) node.classList.remove("active");
    });
    root.classList.add("active");
    root.style.display = "block";
    if (changeHash && location.hash !== "#dokumentenstudio") history.replaceState(null, "", "#dokumentenstudio");
    if (state.revision === null && !state.loading) refresh();
  }

  function showDoc(doc) {
    state.current = { ...doc };
    state.dirty = false;
    state.preview = false;
    el("edsTitle").value = doc.title || "";
    el("edsKind").value = doc.kind || "blank";
    el("edsRecipient").value = doc.recipient || "";
    el("edsReference").value = doc.reference || "";
    el("edsEditor").innerHTML = sanitize(doc.contentHtml || "");
    el("edsPreview").classList.remove("open");
    el("edsPreview").innerHTML = "";
    el("edsArchiveBtn").textContent = doc.archivedAt ? "Wiederherstellen" : "Archivieren";
    el("edsVersion").textContent = doc.version ? "Version " + doc.version : "Neuer Entwurf";
    renderList();
    status(doc.archivedAt ? "Archiviertes Dokument – erst wiederherstellen." : "Bereit.");
  }

  function readForm() {
    if (!state.current) return null;
    return {
      ...state.current,
      title: el("edsTitle").value.trim(),
      kind: el("edsKind").value,
      recipient: el("edsRecipient").value.trim(),
      reference: el("edsReference").value.trim(),
      contentHtml: sanitize(el("edsEditor").innerHTML)
    };
  }

  function handleInput(event) {
    if (event.target?.id === "edsSearch") { state.search = event.target.value.toLowerCase(); renderList(); return; }
    if (!["edsTitle", "edsKind", "edsRecipient", "edsReference", "edsEditor"].includes(event.target?.id)) return;
    state.dirty = true;
    status("Nicht gespeicherte Änderungen.");
    if (state.preview) renderPreview();
  }

  function handleChange(event) {
    if (event.target?.id === "edsShowArchived") {
      state.showArchived = event.target.checked; renderList();
    }
    if (event.target?.id === "edsSearch") {
      state.search = event.target.value.toLowerCase(); renderList();
    }
    if (event.target?.id === "edsKind") handleInput(event);
  }

  function shouldDiscard() {
    return !state.dirty || window.confirm("Nicht gespeicherte Änderungen verwerfen?");
  }

  function createNew(kind) {
    if (!shouldDiscard()) return;
    const doc = newDocument(kind || "blank");
    showDoc(doc);
    status("Neuer Entwurf – bitte speichern.");
  }

  function renderList() {
    const list = el("edsList");
    if (!list) return;
    list.replaceChildren();
    const filtered = state.documents.filter((doc) => (state.showArchived || !doc.archivedAt) && (doc.title + " " + doc.recipient + " " + doc.reference).toLowerCase().includes(state.search)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    for (const doc of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "eds-doc" + (state.current?.id === doc.id ? " active" : "");
      const strong = document.createElement("strong");
      strong.textContent = doc.title || "Unbenannt";
      const small = document.createElement("span");
      small.textContent = (labels[doc.kind] || "Dokument") + " · " + (doc.archivedAt ? "Archiviert" : "Entwurf") + " · " + (doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString("de-DE") : "Neu");
      button.append(strong, small);
      button.addEventListener("click", () => openSaved(doc.id));
      list.appendChild(button);
    }
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "eds-muted";
      empty.textContent = "Keine Dokumente gefunden.";
      list.appendChild(empty);
    }
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    status("Lade geschütztes Dokumentenarchiv …");
    try {
      const [result, profile] = await Promise.all([api("list"), api("profile").catch(() => ({ profile: {} }))]);
      state.revision = result.revision;
      state.documents = result.documents || [];
      state.profile = profile.profile || {};
      renderList();
      if (!state.current) showDoc(newDocument("blank"));
      status(state.documents.length + " Dokument(e) im geschützten Serverarchiv.");
    } catch (error) {
      status("Speicher nicht bereit: " + error.message + " Export bleibt möglich, Speichern nicht.", true);
    } finally { state.loading = false; }
  }

  async function openSaved(id) {
    if (!shouldDiscard()) return;
    status("Lade Dokument …");
    try {
      const response = await api("get", { id, __get: true });
      showDoc(response.document);
    } catch (error) { status(error.message, true); }
  }

  async function save() {
    const doc = readForm();
    if (!doc) return;
    if (state.revision === null) return status("Keine Serververbindung. Dokument zuerst exportieren und später erneut versuchen.", true);
    if (doc.archivedAt) return status("Archivierte Dokumente erst wiederherstellen.", true);
    if (!doc.title || doc.title.length > 120) return status("Bitte Titel mit höchstens 120 Zeichen eintragen.", true);
    if (doc.contentHtml.length > 25000) return status("Dokument ist zu lang (maximal 25.000 Zeichen).", true);
    status("Speichere …");
    try {
      const result = await api("save", { expectedRevision: state.revision, document: doc });
      state.revision = result.revision;
      state.documents = result.documents || [];
      state.current = { ...doc, version: (doc.version || 0) + 1 };
      state.dirty = false;
      el("edsVersion").textContent = "Version " + state.current.version;
      renderList();
      status("Dokument geschützt gespeichert.");
    } catch (error) { status(error.message + " Ungespeicherte Änderungen bleiben im Editor.", true); }
  }

  async function archiveOrRestore() {
    const doc = state.current;
    if (!doc || !state.documents.some((record) => record.id === doc.id)) return status("Nur gespeicherte Dokumente können archiviert werden.", true);
    if (state.dirty && !shouldDiscard()) return;
    const action = doc.archivedAt ? "restore" : "archive";
    if (action === "archive" && !window.confirm("Dokument archivieren? Es kann später wiederhergestellt werden.")) return;
    try {
      const result = await api(action, { id: doc.id, expectedRevision: state.revision });
      state.revision = result.revision;
      state.documents = result.documents || [];
      const metadata = state.documents.find((record) => record.id === doc.id);
      showDoc({ ...doc, ...metadata });
      status(action === "archive" ? "Dokument archiviert." : "Dokument wiederhergestellt.");
    } catch (error) { status(error.message, true); }
  }

  function resolved(doc) {
    const p = state.profile || {};
    const values = {
      Firma: p.name || p.brand || "[Geschäftsdaten in Finanzen ergänzen]",
      Empfänger: doc.recipient || "[Empfänger eintragen]",
      Datum: new Date().toLocaleDateString("de-DE"),
      Referenz: doc.reference || "[Referenz eintragen]"
    };
    const body = sanitize(doc.contentHtml).replace(/\{\{\s*(Firma|Empfänger|Datum|Referenz)\s*\}\}/g, (_, key) => escapeHtml(values[key]));
    const address = [p.street, [p.postalCode, p.city].filter(Boolean).join(" "), p.country].filter(Boolean).map(escapeHtml).join("<br>");
    return '<div style="display:flex;justify-content:space-between;gap:28px;align-items:flex-start;border-bottom:2px solid #2563eb;padding-bottom:20px;margin-bottom:27px"><div><h1 style="color:#1d4ed8;font-size:25px;margin:0">' + escapeHtml(p.brand || p.name || "ELYON") + '</h1><div style="font-size:12px;color:#475569;line-height:1.6">' + escapeHtml(p.name || "") + '<br>' + address + '</div></div><div style="font-size:12px;color:#475569;text-align:right">' + escapeHtml(labels[doc.kind] || "Dokument") + '<br>' + escapeHtml(new Date().toLocaleDateString("de-DE")) + '</div></div>' +
      (doc.recipient ? '<p style="font-size:13px;color:#475569">An: ' + escapeHtml(doc.recipient) + '</p>' : "") +
      (doc.reference ? '<p style="font-size:13px;color:#475569">Referenz: ' + escapeHtml(doc.reference) + '</p>' : "") +
      '<h2 style="font-size:19px;margin:24px 0">' + escapeHtml(doc.title) + '</h2><div class="eds-export-body">' + body + '</div>';
  }

  function renderPreview() {
    const preview = el("edsPreview");
    if (!preview) return;
    preview.innerHTML = resolved(readForm() || newDocument("blank"));
    preview.classList.toggle("open", state.preview);
  }

  function printDocument() {
    const doc = readForm();
    if (!doc) return;
    const popup = window.open("", "_blank", "width=960,height=1100");
    if (!popup) return status("Druckfenster wurde blockiert. Pop-ups für ELYON erlauben.", true);
    popup.opener = null;
    popup.document.open();
    popup.document.write('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + escapeHtml(doc.title) + '</title><style>@page{size:A4;margin:19mm}body{font:14px/1.6 Arial,sans-serif;color:#172033;margin:0}h1,h2,h3{break-after:avoid}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:7px}p{margin:0 0 12px}blockquote{border-left:3px solid #94a3b8;padding-left:12px}*{box-sizing:border-box}</style></head><body>' + resolved(doc) + '</body></html>');
    popup.document.close();
    popup.focus();
    popup.setTimeout(() => popup.print(), 300);
    status("Druckansicht geöffnet: im Browser «Als PDF speichern» auswählen.");
  }

  function crc32(bytes) {
    let crc = -1;
    for (const value of bytes) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }
  function le16(value) { return [value & 255, (value >>> 8) & 255]; }
  function le32(value) { return [...le16(value), ...le16(value >>> 16)]; }
  function joinBytes(parts) {
    const total = parts.reduce((size, part) => size + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const local = [], central = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
      const filename = enc.encode(name), data = enc.encode(content), crc = crc32(data);
      const header = Uint8Array.from([...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(filename.length), ...le16(0), ...filename]);
      local.push(header, data);
      central.push(Uint8Array.from([...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(filename.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(offset), ...filename]));
      offset += header.length + data.length;
    }
    const directory = joinBytes(central);
    const end = Uint8Array.from([...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(central.length), ...le16(central.length), ...le32(directory.length), ...le32(offset), ...le16(0)]);
    return joinBytes([...local, directory, end]);
  }
  function xml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
  function exportDocx() {
    const doc = readForm();
    if (!doc) return;
    const safe = new DOMParser().parseFromString('<div>' + resolved(doc) + '</div>', "text/html").body;
    const lines = [];
    for (const node of safe.querySelectorAll("h1,h2,h3,p,li,tr")) {
      if (node.closest("p p, li li")) continue;
      const value = node.textContent.trim();
      if (value) lines.push(value);
    }
    const content = [doc.title, doc.recipient, doc.reference ? "Referenz: " + doc.reference : "", ...lines].filter(Boolean);
    const paragraphs = content.map((line) => '<w:p><w:r><w:t xml:space="preserve">' + xml(line) + '</w:t></w:r></w:p>').join("");
    const files = {
      "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      "word/document.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>'
    };
    const blob = new Blob([zip(files)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (doc.title.normalize("NFKD").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 65) || "elyon-dokument") + ".docx";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Word-Dokument exportiert (Textbasis, ohne komplexes Seitenlayout).");
  }

  async function handleClick(event) {
    const format = event.target.closest("[data-eds-format]");
    if (format) {
      const editor = el("edsEditor");
      editor.focus();
      document.execCommand(format.dataset.edsFormat, false, format.dataset.edsValue || null);
      handleInput({ target: editor });
      return;
    }
    const token = event.target.closest("[data-eds-insert]");
    if (token) {
      const editor = el("edsEditor");
      editor.focus();
      document.execCommand("insertText", false, token.dataset.edsInsert);
      handleInput({ target: editor });
      return;
    }
    const action = event.target.closest("[data-eds-action]")?.dataset.edsAction;
    if (!action) return;
    if (action === "new") return createNew("blank");
    if (action === "template") return createNew(el("edsTemplateSelect").value);
    if (action === "save") return save();
    if (action === "archive") return archiveOrRestore();
    if (action === "print") return printDocument();
    if (action === "docx") return exportDocx();
    if (action === "preview") { state.preview = !state.preview; return renderPreview(); }
    if (action === "refresh") {
      if (!shouldDiscard()) return;
      state.current = null;
      return refresh();
    }
  }

  function start() {
    installEntry();
    window.addEventListener("hashchange", () => {
      if (location.hash === "#dokumentenstudio") openStudio(false);
      else hideStudio();
    });
    if (location.hash === "#dokumentenstudio") openStudio(false);
  }

  window.ElyonDocumentStudio = { open: openStudio };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
