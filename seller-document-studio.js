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

  // Dokumentarten und Designs sind getrennt: ein Designwechsel ersetzt niemals den Dokumententext.
  const DESIGNS = {
    elyon: { label: "ELYON Business", accent: "#1d4ed8", ink: "#13243d", muted: "#53657a", font: "Arial, sans-serif" },
    classic: { label: "Classic Professional", accent: "#384152", ink: "#1c2634", muted: "#6b7280", font: "Georgia, serif" },
    modern: { label: "Modern Creative", accent: "#0d9488", ink: "#102e3a", muted: "#526e74", font: "Arial, sans-serif" },
    minimal: { label: "Minimal", accent: "#64748b", ink: "#111827", muted: "#64748b", font: "Arial, sans-serif" }
  };
  const PRESETS = [
    ["brief", "Korrespondenz", "Geschäftsbrief", "letter", "<p>{{Datum}}</p><h2>Ihr Anliegen</h2><p>Sehr geehrte Damen und Herren,</p><p>wir wenden uns heute mit folgendem Anliegen an Sie:</p><p>[Ihr Anliegen]</p><p>Für Rückfragen stehen wir Ihnen gerne zur Verfügung.</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"],
    ["anschreiben", "Korrespondenz", "Anschreiben", "letter", "<h2>Unser Schreiben</h2><p>Sehr geehrte Damen und Herren,</p><p>anbei erhalten Sie die gewünschten Informationen und Unterlagen.</p><p>[Hier den Sachverhalt ergänzen.]</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"],
    ["bestaetigung", "Korrespondenz", "Bestätigung", "letter", "<h2>Bestätigung zu {{Referenz}}</h2><p>Sehr geehrte Damen und Herren,</p><p>hiermit bestätigen wir die besprochene Vereinbarung.</p><p>Gegenstand: [Angaben ergänzen]</p><p>Datum: {{Datum}}</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"],
    ["erinnerung", "Korrespondenz", "Freundliche Erinnerung", "letter", "<h2>Erinnerung: {{Referenz}}</h2><p>Guten Tag,</p><p>wir möchten Sie freundlich an den noch offenen Vorgang erinnern.</p><p>[Anliegen und mögliche Frist ergänzen]</p><p>Vielen Dank und freundliche Grüße</p><p>{{Firma}}</p>"],
    ["mahnung", "Korrespondenz", "Zahlungserinnerung", "letter", "<h2>Zahlungserinnerung</h2><p>Sehr geehrte Damen und Herren,</p><p>nach unseren Unterlagen ist zum Vorgang {{Referenz}} noch eine Zahlung offen.</p><table><tr><th>Vorgang</th><th>Betrag</th><th>Fälligkeit</th></tr><tr><td>{{Referenz}}</td><td>[Betrag]</td><td>[Datum]</td></tr></table><p>Bitte gleichen Sie die Angaben vor Versand ab. Sollte die Zahlung bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos.</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"],
    ["angebot", "Verkauf", "Professionelles Angebot", "offer", "<h2>Unser Angebot</h2><p>Sehr geehrte Damen und Herren,</p><p>vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:</p><table><tr><th>Pos.</th><th>Beschreibung</th><th>Menge</th><th>Einzelpreis</th></tr><tr><td>1</td><td>[Produkt / Leistung]</td><td>1</td><td>0,00 €</td></tr></table><p><strong>Gesamtbetrag: [Betrag]</strong></p><p>Angebotsgültigkeit: [Datum]. Liefer- und Zahlungsbedingungen: [Angaben ergänzen].</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"],
    ["auftragsbestaetigung", "Verkauf", "Auftragsbestätigung", "offer", "<h2>Auftragsbestätigung {{Referenz}}</h2><p>Vielen Dank für Ihren Auftrag. Hiermit bestätigen wir die folgenden Positionen:</p><table><tr><th>Menge</th><th>Artikel / Leistung</th><th>Preis</th></tr><tr><td>1</td><td>[Beschreibung]</td><td>[Betrag]</td></tr></table><p>Liefertermin: [Angabe]. Zahlungsbedingungen: [Angabe].</p><p>Freundliche Grüße</p><p>{{Firma}}</p>"],
    ["lieferschein", "Verkauf", "Lieferschein", "delivery", "<h2>Lieferschein {{Referenz}}</h2><p>Empfänger: {{Empfänger}}</p><table><tr><th>Pos.</th><th>Artikel</th><th>Menge</th></tr><tr><td>1</td><td>[Artikelbezeichnung]</td><td>1</td></tr></table><p>Versanddatum: {{Datum}}</p><p>Hinweis: Dieses Dokument ist keine Rechnung.</p>"],
    ["versandbestaetigung", "Verkauf", "Versandbestätigung", "delivery", "<h2>Ihre Bestellung ist unterwegs</h2><p>Guten Tag,</p><p>Ihre Bestellung {{Referenz}} wurde versandt.</p><p>Versanddienstleister: [Name]</p><p>Sendungsnummer: [Nummer]</p><p>Vielen Dank für Ihren Einkauf!</p><p>{{Firma}}</p>"],
    ["abholschein", "Verkauf", "Abholbestätigung", "delivery", "<h2>Abholbestätigung</h2><p>Referenz: {{Referenz}}</p><table><tr><th>Artikel</th><th>Menge</th><th>Übergeben am</th></tr><tr><td>[Beschreibung]</td><td>1</td><td>{{Datum}}</td></tr></table><p>Übergeben an: __________________</p><p>Unterschrift: __________________</p>"],
    ["retourenschein", "Kundenservice", "Retourenformular", "form", "<h2>Retourenanfrage</h2><p>Bestellnummer: {{Referenz}}</p><p>Kunde: {{Empfänger}}</p><table><tr><th>Artikel</th><th>Menge</th><th>Rücksendegrund</th></tr><tr><td>[Artikel]</td><td>1</td><td>[Grund]</td></tr></table><p>Datum: {{Datum}}</p><p>Bitte Rücksendehinweise und gesetzliche Rechte gesondert beachten.</p>"],
    ["reklamation", "Kundenservice", "Reklamationsantwort", "complaint", "<h2>Ihre Reklamation zu {{Referenz}}</h2><p>Guten Tag,</p><p>vielen Dank für Ihre Nachricht. Wir nehmen Ihr Anliegen ernst und prüfen den geschilderten Sachverhalt.</p><p>Vorgeschlagene Lösung: [Lösung ergänzen]</p><p>Nächster Schritt: [Schritt ergänzen]</p><p>Freundliche Grüße</p><p>{{Firma}}</p>"],
    ["entschuldigung", "Kundenservice", "Entschuldigungsschreiben", "complaint", "<h2>Entschuldigung für die Unannehmlichkeiten</h2><p>Guten Tag,</p><p>wir bedauern, dass es bei Ihrem Anliegen {{Referenz}} zu Schwierigkeiten gekommen ist.</p><p>Wir möchten Folgendes für Sie tun: [Vorschlag]</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"],
    ["kulanz", "Kundenservice", "Kulanzangebot", "complaint", "<h2>Unser Lösungsvorschlag</h2><p>Guten Tag,</p><p>bezüglich des Vorgangs {{Referenz}} bieten wir Ihnen folgende freiwillige Kulanzlösung an:</p><p>[Konkrete Lösung]</p><p>Bitte teilen Sie uns mit, ob Sie einverstanden sind.</p><p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"],
    ["rueckfrage", "Kundenservice", "Rückfrage an Kunden", "letter", "<h2>Rückfrage zu {{Referenz}}</h2><p>Guten Tag,</p><p>damit wir Ihr Anliegen bearbeiten können, benötigen wir folgende Informationen:</p><ul><li>[Information 1]</li><li>[Information 2]</li></ul><p>Vielen Dank für Ihre Rückmeldung.</p><p>{{Firma}}</p>"],
    ["lieferantenanfrage", "Einkauf", "Lieferantenanfrage", "purchase_note", "<h2>Anfrage zu Ihren Konditionen</h2><p>Sehr geehrte Damen und Herren,</p><p>wir interessieren uns für folgende Artikel oder Leistungen:</p><table><tr><th>Artikel</th><th>Bedarf</th><th>Frage</th></tr><tr><td>[Artikel]</td><td>[Menge]</td><td>[Preis / Lieferzeit]</td></tr></table><p>Bitte senden Sie uns ein unverbindliches Angebot.</p><p>Freundliche Grüße</p><p>{{Firma}}</p>"],
    ["bestellanfrage", "Einkauf", "Bestellanfrage", "purchase_note", "<h2>Bestellanfrage {{Referenz}}</h2><p>Guten Tag,</p><p>bitte bestätigen Sie Verfügbarkeit und Konditionen für:</p><table><tr><th>Artikel</th><th>Menge</th><th>Gewünschter Termin</th></tr><tr><td>[Artikel]</td><td>1</td><td>[Datum]</td></tr></table><p>Dies ist eine Anfrage und noch keine verbindliche Bestellung.</p>"],
    ["preisvergleich", "Einkauf", "Preisvergleich", "purchase_note", "<h2>Preisvergleich</h2><p>Stand: {{Datum}}</p><table><tr><th>Lieferant</th><th>Artikel</th><th>Einstandspreis</th><th>Versand</th></tr><tr><td>[Name]</td><td>[Artikel]</td><td>[Preis]</td><td>[Preis]</td></tr></table><p>Zusätzliche Kosten und Lieferbedingungen prüfen.</p>"],
    ["einkaufsnotiz", "Einkauf", "Einkaufsnotiz", "purchase_note", "<h2>Einkaufsdokumentation</h2><p>Lieferant: [Name]</p><p>Referenz: {{Referenz}}</p><p>Kaufdatum: {{Datum}}</p><p>Artikel / EK: [Beschreibung / Betrag]</p><p>Originalbeleg des Lieferanten unbedingt separat aufbewahren. Diese Notiz ersetzt keine Lieferantenrechnung.</p>"],
    ["reklamation_lieferant", "Einkauf", "Lieferantenreklamation", "complaint", "<h2>Reklamation zu {{Referenz}}</h2><p>Sehr geehrte Damen und Herren,</p><p>bei folgender Lieferung haben wir ein Problem festgestellt:</p><p>Artikel: [Artikel]</p><p>Mangel: [Beschreibung]</p><p>Gewünschte Klärung: [Angabe]</p><p>Vielen Dank für Ihre Rückmeldung.</p>"],
    ["vertrag", "Verträge", "Vereinbarungsentwurf", "contract", "<h2>Vereinbarung – Entwurf</h2><p>Zwischen {{Firma}} und {{Empfänger}}</p><h3>1. Gegenstand</h3><p>[Konkrete Vereinbarung]</p><h3>2. Pflichten</h3><p>[Regelungen]</p><h3>3. Laufzeit</h3><p>[Beginn / Ende]</p><h3>4. Sonstige Bestimmungen</h3><p>[Angaben]</p><p>Ort / Datum: __________________</p><p>Unterschriften: __________________</p><p><strong>Vor Verwendung rechtlich prüfen lassen.</strong></p>"],
    ["dienstleistung", "Verträge", "Dienstleistungsentwurf", "contract", "<h2>Dienstleistungsvertrag – Entwurf</h2><p>Parteien: {{Firma}} und {{Empfänger}}</p><h3>Leistungsbeschreibung</h3><p>[Leistungen]</p><h3>Vergütung und Fälligkeit</h3><p>[Bedingungen]</p><h3>Leistungszeitraum</h3><p>[Zeitraum]</p><h3>Änderungen und Beendigung</h3><p>[Regelungen]</p><p>Hinweis: Rechtliche Prüfung vor Unterzeichnung erforderlich.</p>"],
    ["nda", "Verträge", "Vertraulichkeitsentwurf", "contract", "<h2>Vertraulichkeitsvereinbarung – Entwurf</h2><p>Parteien: {{Firma}} und {{Empfänger}}</p><h3>Vertrauliche Informationen</h3><p>[Umfang definieren]</p><h3>Verwendung und Schutz</h3><p>[Vereinbarte Maßnahmen]</p><h3>Dauer und Ausnahmen</h3><p>[Regelungen]</p><p>Datum / Unterschriften: __________________</p><p>Vor Verwendung rechtlich prüfen lassen.</p>"],
    ["protokoll", "Organisation", "Besprechungsprotokoll", "form", "<h2>Besprechungsprotokoll</h2><p>Datum: {{Datum}}</p><p>Teilnehmende: [Namen]</p><p>Thema: [Thema]</p><h3>Besprochene Punkte</h3><ul><li>[Punkt 1]</li><li>[Punkt 2]</li></ul><h3>Ergebnisse und nächste Schritte</h3><table><tr><th>Aufgabe</th><th>Verantwortlich</th><th>Frist</th></tr><tr><td>[Aufgabe]</td><td>[Name]</td><td>[Datum]</td></tr></table>"],
    ["checkliste", "Organisation", "Checkliste", "form", "<h2>Checkliste</h2><p>Projekt: [Bezeichnung]</p><p>Datum: {{Datum}}</p><ul><li>☐ [Aufgabe 1]</li><li>☐ [Aufgabe 2]</li><li>☐ [Aufgabe 3]</li></ul><p>Verantwortlich: [Name]</p>"],
    ["formular", "Organisation", "Allgemeines Formular", "form", "<h2>Erfassungsformular</h2><table><tr><th>Feld</th><th>Eintrag</th></tr><tr><td>Name</td><td>[Name]</td></tr><tr><td>Datum</td><td>{{Datum}}</td></tr><tr><td>Referenz</td><td>{{Referenz}}</td></tr></table><p>Bemerkungen: __________________________</p><p>Unterschrift: __________________________</p>"],
    ["bescheinigung", "Organisation", "Bescheinigung", "letter", "<h2>Bescheinigung</h2><p>Hiermit bestätigen wir Folgendes:</p><p>[Zu bescheinigender Sachverhalt]</p><p>Betroffene Person / Organisation: {{Empfänger}}</p><p>Datum: {{Datum}}</p><p>Unterschrift / Stempel: __________________</p>"],
    ["projektstatus", "Organisation", "Projektstatus", "form", "<h2>Projektstatus</h2><p>Projekt: [Name]</p><p>Stand: {{Datum}}</p><h3>Erreicht</h3><ul><li>[Ergebnis]</li></ul><h3>Offen</h3><ul><li>[Aufgabe]</li></ul><h3>Nächste Schritte</h3><p>[Aktionen und Termine]</p>"],
    ["notiz", "Organisation", "Interne Notiz", "blank", "<h2>Interne Notiz</h2><p>Datum: {{Datum}}</p><p>Bezug: {{Referenz}}</p><p>[Notizen]</p>"],
    ["leer", "Organisation", "Leeres A4-Dokument", "blank", "<h2>Neues Dokument</h2><p>Beginnen Sie hier mit dem Inhalt.</p>"]
  ].map(([id, category, name, kind, html]) => ({ id, category, name, kind, html }));
  const DEFAULT_DESIGN = "elyon";
  const state = { revision: null, documents: [], customTemplates: [], current: null, profile: {}, dirty: false, showArchived: false, search: "", librarySearch: "", category: "Alle", favoritesOnly: false, favorites: [], libraryOpen: true, designId: DEFAULT_DESIGN, preview: true, loading: false };

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
    return { id: newId(), kind: type, title: labels[type] + " – " + new Date().toLocaleDateString("de-DE"), recipient: "", reference: "", contentHtml: templates[type], designId: state.designId, templateId: "", createdAt: "", updatedAt: "", version: 0, archivedAt: null };
  }

  function ensureUI() {
    let root = el(TAB_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = TAB_ID;
    root.className = "tab";
    root.innerHTML = [
      '<div class="eds-head"><div><div class="eds-pill" style="display:inline-block">ELYON SELLERTOOL · DOKUMENTENSTUDIO</div><h2>Dokumentenstudio 2.0</h2><p class="eds-muted">Professionelle Vorlagen, vier Designs und eine Live-A4-Vorschau – ohne zusätzliche KI-Kosten.</p></div></div>',
      '<div class="eds-toolbar">',
        '<button type="button" class="eds-btn eds-primary" data-eds-action="library">Vorlagenbibliothek</button>',
        '<button type="button" class="eds-btn" data-eds-action="assistant">Dokumentenassistent</button>',
        '<button type="button" class="eds-btn" data-eds-action="new">Leeres Dokument</button>',
        '<button type="button" class="eds-btn eds-primary" data-eds-action="save">Speichern</button>',
        '<button type="button" class="eds-btn" data-eds-action="save-template">Als Vorlage speichern</button>',
        '<button type="button" class="eds-btn" data-eds-action="print">PDF erstellen / Drucken</button>',
        '<button type="button" class="eds-btn" data-eds-action="docx">Word (.docx)</button>',
        '<button type="button" class="eds-btn eds-danger" data-eds-action="archive" id="edsArchiveBtn">Archivieren</button>',
      '</div>',
      '<div class="eds-layout"><aside class="eds-card"><div id="edsLibrary" class="eds-library"><div class="eds-side-head"><strong>Vorlagenbibliothek</strong><span class="eds-count">30 Designs & Vorlagen</span></div><input id="edsLibrarySearch" class="eds-search" type="search" placeholder="Vorlagen suchen …" aria-label="Vorlagen suchen"><div class="eds-categories" id="edsCategories"></div><label class="eds-check"><input type="checkbox" id="edsFavoritesOnly"> Nur Favoriten</label><div class="eds-template-list" id="edsTemplateCards"></div></div><div class="eds-archive"><div class="eds-side-head"><strong>Eigene Dokumente</strong><span class="eds-count" id="edsDocumentCount"></span></div>',
        '<div class="eds-side-head"><span class="eds-muted">Archiv & Entwürfe</span><button type="button" class="eds-btn" data-eds-action="refresh" title="Neu laden">↻</button></div>',
        '<input class="eds-search" id="edsSearch" type="search" placeholder="Dokumente suchen …" aria-label="Dokumente suchen">',
        '<label class="eds-check" style="margin-top:12px"><input type="checkbox" id="edsShowArchived"> Archivierte anzeigen</label>',
        '<div id="edsList" class="eds-doc-list" aria-label="Dokumentenliste"></div></div>',
      '</aside><div class="eds-card">',
        '<div class="eds-section-title"><h3>Dokument bearbeiten</h3><span class="eds-muted">Alle Änderungen erscheinen rechts sofort.</span></div><div class="eds-meta">',
          '<label class="eds-field">Dokumententitel<input id="edsTitle" maxlength="120" autocomplete="off"></label>',
          '<label class="eds-field">Dokumentenart<select id="edsKind"></select></label>',
          '<label class="eds-field">Empfänger / Ansprechpartner<input id="edsRecipient" maxlength="300" autocomplete="off"></label>',
          '<label class="eds-field">Referenz (z. B. Bestellnummer)<input id="edsReference" maxlength="120" autocomplete="off"></label><label class="eds-field">Designvorlage<select id="edsDesign" aria-label="Designvorlage"></select></label>',
        '</div>',
        '<div id="edsAssistantPanel" class="eds-assistant"><div class="eds-side-head"><strong>Dokumentenassistent</strong><button type="button" class="eds-btn" data-eds-action="close-assistant">Schließen</button></div><p class="eds-muted">Vervollständigt eine ausgewählte Vorlage aus deinen Angaben – lokal, ohne kostenpflichtigen KI-Aufruf.</p><label class="eds-field">Anlass / Betreff<input id="edsAssistantSubject" maxlength="120" placeholder="z. B. Angebot für Büroausstattung"></label><label class="eds-field">Wichtige Angaben<textarea id="edsAssistantDetails" maxlength="2500" rows="3" placeholder="Artikel, Fristen, gewünschte Antwort …"></textarea></label><button type="button" class="eds-btn eds-primary" data-eds-action="generate">Dokument aufbauen</button></div><div class="eds-workspace"><div class="eds-edit-panel"><h3>Inhalt</h3><div class="eds-editor-toolbar" role="toolbar" aria-label="Textformatierung">',
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
        '<div id="edsEditor" class="eds-editor" contenteditable="true" role="textbox" aria-label="Dokumententext" aria-multiline="true" spellcheck="true"></div></div><div class="eds-preview-panel"><div class="eds-side-head"><strong>A4-Live-Vorschau</strong><span class="eds-muted">210 × 297 mm</span></div>',
        '<div id="edsPreview" class="eds-preview open" aria-label="Dokumentenvorschau"></div></div></div>',
        '<div class="eds-bottom"><div id="edsStatus" class="eds-status" role="status" aria-live="polite">Lade Dokumente …</div><span class="eds-muted" id="edsVersion"></span></div>',
        '<p class="eds-legal">Verträge und Vertragsklauseln vor Verwendung rechtlich prüfen lassen. Rechnungen für eBay-Bestellungen werden weiterhin ausschließlich im bestehenden Rechnungsmodul erstellt und ausgestellt. Ein frei bearbeitbares Dokument ersetzt weder eine Lieferantenrechnung noch eine steuerlich korrekte Ausgangsrechnung.</p>',
      '</div></div>'
    ].join("");
    (document.querySelector("main") || document.body).appendChild(root);
    for (const [key, label] of Object.entries(labels)) {
      for (const select of [el("edsKind")]) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = label;
        select.appendChild(option);
      }
    }
    const designSelect = el("edsDesign");
    for (const [key, design] of Object.entries(DESIGNS)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = design.label;
      designSelect.appendChild(option);
    }
    try {
      const favorites = JSON.parse(window.localStorage.getItem("elyon-eds-favorites") || "[]");
      state.favorites = Array.isArray(favorites) ? favorites.filter((id) => typeof id === "string").slice(0, 80) : [];
      const preferredDesign = window.localStorage.getItem("elyon-eds-design");
      if (DESIGNS[preferredDesign]) state.designId = preferredDesign;
    } catch { /* storage may be unavailable: defaults work without it */ }
    renderLibrary();
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
    }
    if (menu && !menu.dataset.edsWired) {
      menu.dataset.edsWired = "1";
      menu.addEventListener("change", () => {
        if (menu.value === TAB_ID) openStudio();
        else hideStudio();
      });
    }
    const nav = document.querySelector(".nav-menu");
    if (nav && !el("elyonDocumentStudioNav") && !el("elyonDocumentStudioRuntimeNav")) {
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


  function renderLibrary() {
    const container = el("edsTemplateCards");
    const categories = el("edsCategories");
    if (!container || !categories) return;
    const all = [...PRESETS, ...state.customTemplates.map((t) => ({
      id: t.id, category: "Eigene", name: t.name, kind: t.kind,
      html: t.contentHtml, designId: t.designId
    }))];
    const names = ["Alle", "Korrespondenz", "Verkauf", "Kundenservice", "Einkauf", "Verträge", "Organisation", "Eigene"];
    categories.innerHTML = names.map((cat) =>
      '<button type="button" class="eds-category' + (state.category === cat ? ' active' : '') +
      '" data-eds-category="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</button>'
    ).join("");
    const entries = all.filter((entry) =>
      (state.category === "Alle" || entry.category === state.category) &&
      (!state.favoritesOnly || state.favorites.includes(entry.id)) &&
      (entry.name + " " + entry.category).toLocaleLowerCase("de-DE").includes(state.librarySearch)
    );
    container.innerHTML = entries.map((entry) => {
      const favored = state.favorites.includes(entry.id);
      const self = entry.category === "Eigene";
      return '<div class="eds-template-card"><button type="button" class="eds-template-open" data-eds-preset="' + escapeHtml(entry.id) + '">' +
        '<span class="eds-template-icon">▤</span><span class="eds-template-desc"><strong>' + escapeHtml(entry.name) +
        '</strong><small>' + escapeHtml(entry.category) + '</small></span></button>' +
        '<button type="button" class="eds-favorite' + (favored ? ' active' : '') + '" data-eds-favorite="' + escapeHtml(entry.id) +
        '" title="' + (favored ? "Favorit entfernen" : "Als Favorit markieren") + '" aria-label="' + (favored ? "Favorit entfernen" : "Als Favorit markieren") + '">' + (favored ? "★" : "☆") + '</button>' +
        (self ? '<button type="button" class="eds-remove" data-eds-remove="' + escapeHtml(entry.id) + '" title="Eigene Vorlage löschen" aria-label="Eigene Vorlage löschen">×</button>' : '') +
        '</div>';
    }).join("") || '<p class="eds-muted">Keine passenden Vorlagen gefunden.</p>';
    const count = el("edsDocumentCount");
    if (count) count.textContent = state.documents.length + " gespeichert";
  }

  function applyPreset(templateId) {
    const preset = PRESETS.find((p) => p.id === templateId) || state.customTemplates.find((p) => p.id === templateId);
    if (!preset) return status("Vorlage nicht gefunden.", true);
    if (!shouldDiscard()) return;
    const doc = newDocument(preset.kind);
    doc.title = (preset.name || "Dokument") + " – " + new Date().toLocaleDateString("de-DE");
    doc.contentHtml = preset.html || preset.contentHtml || "";
    doc.templateId = preset.id;
    doc.designId = DESIGNS[preset.designId] ? preset.designId : state.designId;
    showDoc(doc);
    status("Vorlage „" + preset.name + "“ geöffnet. Bitte Daten prüfen und Dokument speichern.");
    if (window.innerWidth < 860) el("edsTitle")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function savePersonalTemplate() {
    const doc = readForm();
    if (!doc) return;
    if (state.revision === null) return status("Vorlagen können erst nach Verbindung zum Dokumentenspeicher gespeichert werden.", true);
    const suggested = (doc.title || labels[doc.kind] || "Neue Vorlage").slice(0, 120);
    const name = window.prompt("Name für deine eigene Vorlage:", suggested);
    if (!name || !name.trim()) return;
    const record = {
      id: "tpl_" + newId().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 70),
      name: name.trim().slice(0, 120), kind: doc.kind, designId: doc.designId, contentHtml: doc.contentHtml
    };
    try {
      const result = await api("save-template", { expectedRevision: state.revision, document: record });
      state.revision = result.revision;
      state.customTemplates = result.templates || [];
      state.documents = result.documents || state.documents;
      state.category = "Eigene";
      renderLibrary();
      status("Eigene Vorlage gespeichert: " + record.name + ".");
    } catch (error) { status("Vorlage nicht gespeichert: " + error.message, true); }
  }

  async function deletePersonalTemplate(id) {
    if (!state.customTemplates.some((template) => template.id === id)) return;
    if (!window.confirm("Eigene Vorlage wirklich löschen? Bereits erstellte Dokumente bleiben erhalten.")) return;
    try {
      const result = await api("delete-template", { expectedRevision: state.revision, id });
      state.revision = result.revision;
      state.customTemplates = result.templates || [];
      state.documents = result.documents || state.documents;
      renderLibrary();
      status("Vorlage gelöscht. Bestehende Dokumente bleiben erhalten.");
    } catch (error) { status(error.message, true); }
  }

  function toggleFavorite(id) {
    if (state.favorites.includes(id)) state.favorites = state.favorites.filter((item) => item !== id);
    else state.favorites = [...state.favorites, id].slice(-80);
    try { window.localStorage.setItem("elyon-eds-favorites", JSON.stringify(state.favorites)); } catch {}
    renderLibrary();
  }

  function assistantGenerate() {
    const doc = readForm();
    if (!doc) return;
    const subject = el("edsAssistantSubject")?.value.trim() || doc.title;
    const details = el("edsAssistantDetails")?.value.trim();
    if (!subject && !details) return status("Bitte Anlass oder Angaben eintragen.", true);
    if (state.dirty && !window.confirm("Den aktuellen Dokumententext durch den Assistentenentwurf ersetzen?")) return;
    const lines = (details || "[Bitte Angaben ergänzen.]").split(/\n+/).slice(0, 25);
    const clauses = lines.map((line) => '<p>' + escapeHtml(line) + '</p>').join("");
    const greeting = doc.kind === "form" || doc.kind === "delivery" || doc.kind === "purchase_note" ? "" : "<p>Sehr geehrte Damen und Herren,</p>";
    const ending = doc.kind === "form" || doc.kind === "delivery" || doc.kind === "purchase_note" ? "" : "<p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>";
    el("edsEditor").innerHTML = "<h2>" + escapeHtml(subject) + "</h2>" + greeting + clauses + ending;
    el("edsTitle").value = subject.slice(0, 120);
    el("edsAssistantPanel").classList.remove("open");
    handleInput({ target: el("edsEditor") });
    status("Entwurf aus deinen Angaben erstellt. Inhalt und rechtliche Angaben bitte prüfen.");
  }

  function showDoc(doc) {
    state.current = { ...doc };
    state.dirty = false;
    state.preview = true;
    state.designId = DESIGNS[doc.designId] ? doc.designId : DEFAULT_DESIGN;
    el("edsDesign").value = state.designId;
    el("edsTitle").value = doc.title || "";
    el("edsKind").value = doc.kind || "blank";
    el("edsRecipient").value = doc.recipient || "";
    el("edsReference").value = doc.reference || "";
    el("edsEditor").innerHTML = sanitize(doc.contentHtml || "");
    renderPreview();
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
      contentHtml: sanitize(el("edsEditor").innerHTML),
      designId: el("edsDesign").value,
      templateId: state.current.templateId || ""
    };
  }

  function handleInput(event) {
    if (event.target?.id === "edsSearch") { state.search = event.target.value.toLowerCase(); renderList(); return; }
    if (event.target?.id === "edsLibrarySearch") { state.librarySearch = event.target.value.toLocaleLowerCase("de-DE"); renderLibrary(); return; }
    if (!["edsTitle", "edsKind", "edsRecipient", "edsReference", "edsEditor"].includes(event.target?.id)) return;
    state.dirty = true;
    status("Nicht gespeicherte Änderungen.");
    renderPreview();
  }

  function handleChange(event) {
    if (event.target?.id === "edsShowArchived") {
      state.showArchived = event.target.checked; renderList();
    }
    if (event.target?.id === "edsSearch") {
      state.search = event.target.value.toLowerCase(); renderList();
    }
    if (event.target?.id === "edsKind") handleInput(event);
    if (event.target?.id === "edsFavoritesOnly") { state.favoritesOnly = event.target.checked; renderLibrary(); }
    if (event.target?.id === "edsDesign") {
      state.designId = DESIGNS[event.target.value] ? event.target.value : DEFAULT_DESIGN;
      try { window.localStorage.setItem("elyon-eds-design", state.designId); } catch {}
      state.dirty = true;
      renderPreview();
      status("Design geändert. Textinhalt bleibt erhalten. Zum Übernehmen speichern.");
    }
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
      const [result, profile, custom] = await Promise.all([api("list"), api("profile").catch(() => ({ profile: {} })), api("templates").catch(() => ({ templates: [] }))]);
      state.revision = result.revision;
      state.documents = result.documents || [];
      state.profile = profile.profile || {};
      state.customTemplates = custom.templates || [];
      renderLibrary();
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
      renderPreview();
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
    if (!el("elyonDocumentStudioStyles")) {
      const stylesheet = document.createElement("link");
      stylesheet.id = "elyonDocumentStudioStyles";
      stylesheet.rel = "stylesheet";
      stylesheet.href = "/seller-document-studio.css?v=docs-v1-20261121";
      document.head.appendChild(stylesheet);
    }
    installEntry();
    window.addEventListener("hashchange", () => {
      if (location.hash === "#dokumentenstudio") openStudio(false);
      else hideStudio();
    });
    if (location.hash === "#dokumentenstudio") openStudio(false);
    else if (el("mainMenu")?.value === TAB_ID) openStudio();
  }

  window.ElyonDocumentStudio = { open: openStudio };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
