# Elyon Jarvis — Playbooks

## Zweck

Diese Datei definiert Jarvis' wiederverwendbare Standardabläufe für typische Elyon-Aufgaben.

V1 enthält drei Core-Playbooks:

1. Produktsuche & Marktchance
2. Product Check & Enrichment
3. Listing-Vorbereitung bis Draft

Die Playbooks beschreiben Vorgehensweisen mit klaren Schritten, Prüfungen sowie Stop-/Review-Bedingungen.

Ein Playbook erweitert keine Runtime-Rechte und darf bestehende Safety-Gates, Approval-Pflichten oder Capability-Grenzen nicht umgehen.

---

## Grundprinzip für alle Playbooks

Ein Playbook ist:

```text
wiederverwendbarer Ablauf
+
Entscheidungslogik
+
Prüfpunkte
+
Abbruchbedingungen
```

Ein Playbook ist keine neue Capability.

Vor Ausführung muss Jarvis immer prüfen:

```text
Ist die benötigte Capability vorhanden?
        ↓
Ist sie aktuell verfügbar?
        ↓
Read-only oder Mutation?
        ↓
Ist eine Freigabe erforderlich?
        ↓
Playbook ausführen / delegieren / stoppen
```

`CAPABILITIES.md` und deterministische Runtime-/Safety-Regeln bleiben autoritativ.

---

# PLAYBOOK 01 – Produktsuche & Marktchance

## Zweck

Geeignete Produktkandidaten für Elyon finden und so strukturieren, dass sie anschließend in die reguläre Produktprüfung übergeben werden können.

## Ziel

Nicht möglichst viele Ideen sammeln, sondern:

```text
Marktnachfrage
+
wirtschaftliches Potenzial
+
vertretbares Risiko
+
Beschaffbarkeit
=
brauchbarer Produktkandidat
```

## Input

Mögliche Inputs:

- Produktsegment,
- Nische,
- gewünschte Anzahl,
- Preisbereich,
- Zielmarge,
- Risikovorgaben,
- saisonaler Kontext,
- bestehender Elyon-Kontext.

Wenn kein Segment vorgegeben ist, darf Jarvis geeignete Bereiche recherchieren.

## Schritt 1 – Anfrage verstehen

Jarvis bestimmt:

- Was sucht der Nutzer?
- Wie viele Kandidaten?
- Gibt es Preis-/Risikogrenzen?
- Geht es um Trendprodukte, Evergreen-Produkte oder beides?
- Soll nur recherchiert oder anschließend weitergeprüft werden?

### Check

Wenn die Anfrage ausreichend eindeutig ist:

```text
weiter
```

Wenn eine fehlende Information die Recherche nicht wesentlich verändert:

```text
sinnvolle Annahme treffen
+
transparent kennzeichnen
```

## Schritt 2 – Vorhandenen Elyon-Kontext prüfen

Vor neuer Recherche soll Jarvis prüfen, ob:

- ähnliche Produkte bereits vorhanden sind,
- Kandidaten bereits untersucht wurden,
- offensichtliche Duplikate existieren,
- bekannte Ausschlussgründe bestehen.

### Grundregel

```text
vorhandene Erkenntnisse nutzen
vor Recherche duplizieren
```

## Schritt 3 – Markt recherchieren

Jarvis beziehungsweise Market Scout untersucht je nach verfügbaren Quellen:

- Nachfrageindikatoren,
- Marktaktivität,
- Wettbewerb,
- typische Verkaufspreise,
- Produktnutzen,
- Trend-/Saisonsignale,
- erkennbare Risiken.

Web- und Marktdaten sind Recherchehinweise und müssen hinsichtlich Aktualität und Quellenqualität bewertet werden.

## Schritt 4 – Beschaffbarkeit prüfen

Wenn Supplier-Daten recherchiert werden können, prüft Jarvis:

- Produkt grundsätzlich beschaffbar?
- Supplier plausibel?
- Einkaufspreis bekannt oder unbekannt?
- Versand-/Lieferbedingungen erkennbar?
- Variantenproblem?
- erkennbare Marken-/IP-/Compliance-Risiken?

Supplier-URLs sind Hinweise, keine Garantie für dauerhafte Verfügbarkeit.

## Schritt 5 – Wirtschaftliches Potenzial einschätzen

Wenn ausreichende Preiswerte vorhanden sind:

```text
EK
+
bekannte Kosten
+
potenzieller VK
→ mögliche Wirtschaftlichkeit
```

Jarvis darf unbekannte Kosten nicht als `0` behandeln, wenn dadurch ein falscher Gewinn entstehen würde.

## Schritt 6 – Risiko bewerten

Mindestens berücksichtigen:

- Compliance,
- Produktsicherheit,
- Marken/IP,
- Wettbewerb,
- Preisdruck,
- Retourenpotenzial,
- Liefer-/Supplier-Risiko,
- Datenunsicherheit.

Mögliche vereinfachte Klassifikation:

```text
LOW
MEDIUM
HIGH
```

## Schritt 7 – Kandidaten priorisieren

Bevorzugt werden Produkte mit guter Balance aus:

```text
Nachfrage
+
Marge
+
Beschaffbarkeit
+
vertretbarem Wettbewerb
+
vertretbarem Risiko
```

Nicht allein hohe Nachfrage entscheidet.

## Output

Jeder Kandidat sollte soweit verfügbar enthalten:

- Produktname,
- Kategorie,
- Nachfrageindikator,
- Wettbewerb,
- Risiko,
- EK,
- potenzieller VK,
- mögliche Marge,
- Supplier/Quelle,
- Begründung,
- offene Daten,
- empfohlener nächster Schritt.

## Stop-/Abbruchbedingungen

### `STOP – insufficient_evidence`

Wenn keine ausreichenden Marktsignale vorliegen.

### `STOP – unacceptable_risk`

Wenn offensichtliche Sicherheits-, Compliance- oder IP-Risiken unverhältnismäßig hoch sind.

### `STOP – economics_not_plausible`

Wenn vorhandene Daten bereits klar gegen wirtschaftliche Tragfähigkeit sprechen.

### `REVIEW – missing_economics`

Wenn Marktpotenzial vorhanden ist, aber EK/VK/Kosten nicht ausreichend bekannt sind.

### `NEXT`

Geeigneter Kandidat:

```text
→ Company OS / Product Check
```

je nach vorhandenem Elyon-Workflow.

---

# PLAYBOOK 02 – Product Check & Enrichment

## Zweck

Einen vorhandenen Produktkandidaten auf Datenqualität, Wirtschaftlichkeit, Compliance und Listing Readiness prüfen und fehlende Informationen kontrolliert ergänzen.

## Input

Mindestens eine auflösbare Produktidentität:

```text
ELY-...
Product Master ID
Supplier SKU / Alias
```

Die kanonische Elyon-Identität bleibt unverändert.

## Schritt 1 – Produkt auflösen

Jarvis versucht das Produkt über die vorhandene Product-Master-Struktur zu finden.

Priorität:

```text
kanonische Elyon-ID
→ Product Master
→ erlaubte Lookup-Aliase
```

### STOP

```text
product_not_found
```

wenn keine zuverlässige Zuordnung möglich ist.

Keine neue Produktidentität erfinden.

## Schritt 2 – Product Master lesen

Bestehende Werte werden vollständig berücksichtigt.

Jarvis bestimmt:

- welche Daten vorhanden sind,
- welche fehlen,
- welche Quelle sie besitzen,
- welche Werte unsicher sind.

Vorhandene Werte dürfen nicht still überschrieben werden.

## Schritt 3 – Data Quality prüfen

Mindestens prüfen:

- Titel,
- Bilder,
- Supplier,
- Einkaufspreis,
- Verkaufspreis beziehungsweise Zielpreis,
- Kategorie,
- relevante Produktmerkmale,
- vorhandene Compliance-Felder.

Ergebnis beispielsweise:

```text
complete
needs_data
needs_review
```

## Schritt 4 – Economics prüfen

Soweit Daten vorhanden:

```text
EK
+
bekannte Gebühren/Kosten
+
VK
→ Gewinn
→ Marge
```

Elyon-Mindestregel:

```text
mindestens 20 % Marge
ODER
mindestens 5 EUR realistischer Gewinn
```

### Wichtig

Die Mindestregel ist ein Gate, keine automatische Produktempfehlung.

## Schritt 5 – Compliance prüfen

Jarvis identifiziert:

- fehlende Herstellerangaben,
- EU-verantwortliche Person,
- GPSR,
- CE-/Sicherheitsinformationen,
- Warnhinweise,
- sensible Produktklassen,
- weitere relevante Risikosignale.

Fehlende Compliance-Daten dürfen nicht erfunden werden.

## Schritt 6 – Enrichment-Bedarf bestimmen

Nur tatsächlich fehlende oder unzureichende Felder werden recherchiert.

Keine unnötige Komplettrecherche.

Quellenreihenfolge grundsätzlich:

```text
bestehende Product-Master-Daten
→ Supplier
→ Hersteller
→ belastbare Webquelle
→ breitere Web-Recherche
```

## Schritt 7 – Rechercheergebnisse klassifizieren

Jeder relevante Fund wird bewertet nach:

- Quelle,
- Confidence,
- Aktualität,
- Konflikt mit bestehenden Daten,
- Compliance-Sensitivität.

Vereinfachte Klassen:

```text
high confidence
medium confidence
low confidence
```

## Schritt 8 – Übernahme entscheiden

### Unkritische Daten

Wenn:

```text
hohe Confidence
+
kein Konflikt
+
Runtime erlaubt Änderung
```

kann kontrollierte Übernahme zulässig sein.

### Compliance-Daten

```text
Research
→ Vorschlag
→ Review
```

Kein automatisches rechtliches Bestätigen allein durch KI-Recherche.

## Schritt 9 – Product Check erneut bewerten

Nach erfolgreichem Enrichment soll der Produktstatus erneut geprüft werden.

Ziel:

```text
vorherige Blocker
→ Enrichment
→ erneuter Check
→ aktualisierte Readiness
```

## Output

Strukturierte Bewertung:

- Data Quality,
- Economics,
- Compliance,
- Listing Readiness,
- Recommendation,
- offene Punkte,
- angewendete Änderungen,
- review-pflichtige Ergebnisse,
- Quellen/Provenance,
- nächster Schritt.

Empfehlung:

```text
pass
review
reject
```

## Stop-/Abbruchbedingungen

### `STOP – product_not_found`

Produktidentität nicht zuverlässig auflösbar.

### `STOP – identity_conflict`

Mehrere Produkte könnten dieselbe Anfrage repräsentieren.

### `STOP – source_conflict`

Kritische Quellen widersprechen sich und eine sichere Entscheidung ist nicht möglich.

### `STOP – negative_economics`

Produkt wirtschaftlich offensichtlich ungeeignet.

### `REVIEW – compliance_required`

Compliance-relevante Informationen benötigen menschliche Prüfung.

### `REVIEW – insufficient_confidence`

Recherchefund nicht belastbar genug für automatische Übernahme.

### `NEXT`

Wenn Produkt geeignet:

```text
→ Listing-Vorbereitung
```

---

# PLAYBOOK 03 – Listing-Vorbereitung bis Draft

## Zweck

Ein ausreichend geprüftes Produkt aus dem Product Master bis zu einem vollständigen internen Seller-Draft vorbereiten.

Das Playbook endet ausdrücklich beim Draft.

Nicht beim Live-Publishing.

## Input

Produkt aus dem Seller Product Master mit ausreichender Freigabe beziehungsweise Readiness.

## Schritt 1 – Freigabestatus prüfen

Jarvis prüft:

- Product Master vorhanden,
- Company-OS-/Workflow-Freigabe ausreichend,
- keine kritischen Product-Check-Blocker,
- Produktidentität eindeutig.

### STOP

Wenn Produkt noch nicht ausreichend freigegeben ist:

```text
listing_not_ready
```

## Schritt 2 – Pflichtdaten prüfen

Mindestens:

- Elyon-Artikelnummer,
- Titelbasis,
- Kategorie,
- Bilder,
- Preis,
- Menge,
- Produktmerkmale,
- Supplier-/Produktdaten,
- Compliance-Status.

Fehlende Pflichtfelder werden sichtbar gemacht.

Nicht erfunden.

## Schritt 3 – Listing Content vorbereiten

Listing Designer kann vorbereiten:

- Titel,
- SEO,
- Beschreibung,
- Vorteile,
- technische Merkmale,
- Lieferumfang,
- wichtige Hinweise,
- visuelle Darstellung.

KI-Optimierung muss faktentreu bleiben.

## Schritt 4 – eBay-Kategorie bestimmen

Über vorhandene Taxonomy-Pfade:

- passende Kategorie suchen,
- Pflichtmerkmale bestimmen,
- zulässige Werte berücksichtigen.

Wenn Kategorie nicht ausreichend sicher bestimmbar:

```text
REVIEW
```

## Schritt 5 – Item Specifics prüfen

Pflichtmerkmale werden aus:

- Product Master,
- belegten Produktdaten,
- verifizierten Quellen

befüllt.

Unbelegte Pflichtmerkmale:

```text
leer lassen
+
Blocker sichtbar machen
```

Nicht raten.

## Schritt 6 – Compliance prüfen

Vor Draft-Fertigstellung prüfen:

- Hersteller,
- EU Responsible Person falls erforderlich,
- GPSR,
- Sicherheitsinformationen,
- Warnhinweise,
- dokumentierte Ausnahmen.

### REVIEW

Bei fehlender oder unsicherer Compliance.

## Schritt 7 – Varianten prüfen

Wenn Varianten vorhanden sind:

- Varianten eindeutig identifizieren,
- Werte korrekt zuordnen,
- Bilder/Preise/SKUs nicht vermischen.

Unsichere Varianten:

```text
STOP / REVIEW
```

## Schritt 8 – Preis und Economics final gegenprüfen

Vor Draft:

- Verkaufspreis,
- Einkaufspreis,
- bekannte Kosten,
- Marge,
- Gewinn

noch einmal auf offensichtliche Widersprüche prüfen.

Jarvis soll keinen alten Preis blind verwenden, wenn aktuellere verifizierte Daten existieren.

## Schritt 9 – Draft erzeugen

Auto Lister darf einen internen Seller-Draft vorbereiten.

Dieser kann enthalten:

- Titel,
- Beschreibung,
- Kategorie,
- Condition,
- Item Specifics,
- Bilder,
- Preis,
- Menge,
- Compliance-Daten,
- Varianten,
- weitere Listing-Daten.

Speicherung bleibt additiv und vorhandene unbekannte Felder bleiben erhalten.

## Schritt 10 – Draft Quality Gate

Vor Abschluss prüfen:

```text
Identität eindeutig?
Pflichtdaten vorhanden?
Keine erfundenen Werte?
Kategorie plausibel?
Compliance ausreichend?
Varianten sauber?
Economics plausibel?
Bilder vorhanden?
```

## Output

```text
DRAFT_READY
```

oder:

```text
NEEDS_DATA
NEEDS_REVIEW
BLOCKED
```

mit konkreten Gründen.

## Stop-/Abbruchbedingungen

### `STOP – product_not_approved`

Vorgelagerte Freigabe fehlt.

### `STOP – critical_data_missing`

Essenzielle Produktdaten fehlen.

### `STOP – identity_or_variant_conflict`

Produkt-/Variantenidentität nicht eindeutig.

### `REVIEW – taxonomy_uncertain`

eBay-Kategorie oder Pflichtmerkmale nicht eindeutig.

### `REVIEW – compliance_incomplete`

Compliance-Prüfung noch offen.

### `REVIEW – economics_changed`

Preis-/Kostenlage unterscheidet sich relevant von der vorherigen Produktprüfung.

---

## Harte Grenze des Listing-Playbooks

Der erfolgreiche Abschluss lautet:

```text
INTERNER LISTING-DRAFT
```

Nicht:

```text
EBAY LIVE LISTING
```

Das Playbook darf nicht:

- eBay live veröffentlichen,
- Supplier-Bestellungen auslösen,
- Kundennachrichten versenden,
- Approval-Gates umgehen.

---

## Playbook-Auswahl durch Jarvis

Jarvis soll anhand des Nutzerziels das passende Playbook wählen.

```text
„Finde Produkte für mich“
→ Produktsuche & Marktchance

„Prüf dieses Produkt / Daten fehlen“
→ Product Check & Enrichment

„Mach das Produkt listingfertig“
→ Listing-Vorbereitung bis Draft
```

Wenn mehrere Phasen erforderlich sind:

```text
Playbook 01
→ Playbook 02
→ Playbook 03
```

Jarvis darf jedoch keine Phase überspringen, wenn deren Gate noch nicht erfüllt ist.

---

## Playbook-Status

Diese V1-Playbooks sind zunächst:

```text
STATIC CORE PLAYBOOKS
```

Sie stellen Brain-Wissen dar.

Sie sind noch kein autonomes lernendes Skill-System.

Ein späteres Experience-/Skill-System kann erfolgreiche Abläufe als neue Playbook-Kandidaten erzeugen, darf die Core-Playbooks aber nicht still selbst überschreiben.

---

## Abgrenzung

```text
IDENTITY.md
→ Wer ist Jarvis?

ELYON_CONTEXT.md
→ Was ist Elyon?

OPERATING_RULES.md
→ Wie arbeitet Jarvis grundsätzlich?

CAPABILITIES.md
→ Was darf/kann Jarvis aktuell?

GOALS.md
→ Worauf optimiert Jarvis?

PLAYBOOKS.md
→ Wie bearbeitet Jarvis wiederkehrende Aufgaben?
```
