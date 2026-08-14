# Elyon Jarvis — Playbooks

## Zweck

Diese Datei definiert die drei Core-Playbooks von Jarvis Phase 3. Sie sind lesbare Prozessdokumentation und zugleich versioniertes Runtime-Wissen.

Ein Playbook ist **keine Capability**. Es darf keine Runtime-Rechte, Safety-Gates oder Approval-Pflichten erweitern oder umgehen. Vor jeder Mutation gilt die tatsächliche Runtime als Autorität.

## Gemeinsame Regeln

Vor jedem Playbook prüft Jarvis:

1. Produkt oder Auftrag eindeutig identifiziert?
2. Benötigte Datenquellen und Capability tatsächlich verfügbar?
3. Read-only, interne Mutation oder externe Aktion?
4. Approval nötig?
5. Gibt es widersprüchliche oder unbelegte Daten?

Unbekannte Werte bleiben unbekannt. Ein Versuch ist kein Erfolg. Compliance-Recherche darf vorbereitet werden; Compliance-Daten dürfen erst nach der vorgesehenen Freigabe übernommen werden.

---

# PLAYBOOK 01 – Product Check

## Zweck

Einen vorhandenen Produktkandidaten strukturiert prüfen und entscheiden, ob er `pass`, `review` oder `reject` erhält beziehungsweise welche Daten vor einer Entscheidung fehlen.

## Input

Eine zuverlässig auflösbare Produktidentität, vorzugsweise kanonische Elyon-ID/Product-Master-ID oder ein eindeutig zuordenbarer Supplier-Alias.

## Schritte

### 1. Identität auflösen

Product Master und erlaubte Aliase prüfen. Keine neue Produktidentität erfinden.

### 2. Bestehende Daten lesen

Vorhandene Werte, Quellen und bekannte Unsicherheiten berücksichtigen. Keine Werte still überschreiben.

### 3. Data Quality prüfen

Mindestens Titel, Bilder, Supplier, EK, Ziel-/VK, Kategorie, relevante Merkmale und vorhandene Compliance-Felder bewerten.

### 4. Economics prüfen

Soweit belastbare Daten vorhanden sind: EK, bekannte Gebühren/Kosten, VK, Gewinn und Marge berechnen. Unbekannte Kosten nicht als `0` behandeln.

Bestehendes Elyon-Mindestgate:

```text
mindestens 20 % Marge
ODER
mindestens 5 EUR realistischer Gewinn
```

Das Gate allein macht ein Produkt nicht automatisch empfehlenswert.

### 5. Compliance- und Risikolücken prüfen

Fehlende oder unsichere Hersteller-, EU-Responsible-Person-, GPSR-, CE-/Sicherheits- und Warnhinweis-Daten sichtbar machen. Keine Compliance-Fakten erfinden oder automatisch bestätigen.

### 6. Listing Readiness bewerten

Prüfen, ob das Produkt ausreichend vollständig, wirtschaftlich plausibel und ohne kritischen ungelösten Blocker in die nächste Stufe darf.

## Checks

- Identität eindeutig?
- Quellen belastbar und widerspruchsfrei?
- Economics plausibel?
- Mindestgate erfüllt oder nachvollziehbar nicht berechenbar?
- Kritische Compliance-Lücke vorhanden?
- Listing-relevante Pflichtdaten ausreichend?

## Output

```text
pass | review | reject
```

Zusätzlich: Gründe, offene Daten, Blocker, Quellen/Provenance und empfohlener nächster Schritt.

## Stop-/Review-Bedingungen

- `STOP – product_not_found`: keine zuverlässige Produktzuordnung.
- `STOP – identity_conflict`: mehrere mögliche Produkte/Varianten.
- `STOP – source_conflict`: kritische Quellen widersprechen sich.
- `STOP – negative_economics`: belastbare Daten zeigen klar untragfähige Economics.
- `REVIEW – compliance_required`: Compliance-Lücke erfordert Prüfung/Freigabe.
- `REVIEW – missing_data`: Entscheidung ohne weitere Daten nicht belastbar.
- `NEXT – enrichment`: relevante Daten fehlen, Product Enrichment ist sinnvoll.
- `NEXT – listing_draft`: Check bestanden und Listing Readiness ausreichend.

---

# PLAYBOOK 02 – Product Enrichment

## Zweck

Fehlende oder unzureichende Produktdaten gezielt recherchieren, klassifizieren und nur im erlaubten Umfang übernehmen.

## Input

Ein vorhandenes, eindeutig identifiziertes Produkt mit konkreten fehlenden oder unsicheren Feldern.

## Schritte

### 1. Enrichment-Bedarf bestimmen

Nur fehlende, veraltete, widersprüchliche oder unzureichend belegte Felder recherchieren. Keine unnötige Komplettrecherche.

### 2. Bestehende Daten und Provenance lesen

Product Master und bereits bestätigte Daten zuerst berücksichtigen.

### 3. Quellen recherchieren

Grundsätzliche Reihenfolge:

```text
bestehende Product-/Supplier-Daten
→ Supplier
→ Hersteller
→ belastbare externe Quelle
→ breitere Web-Recherche
```

### 4. Funde klassifizieren

Für jeden relevanten Fund: Quelle, Aktualität, Confidence, Konflikte und Compliance-Sensitivität bewerten.

### 5. Übernahmeentscheidung treffen

Unkritische Daten dürfen nur dann automatisch übernommen werden, wenn Runtime dies erlaubt, Confidence ausreichend ist und kein relevanter Konflikt besteht.

Compliance-sensitive Daten:

```text
Recherche
→ Vorschlag
→ Review/Freigabe
→ erst danach erlaubte Übernahme
```

### 6. Nachprüfung durchführen

Nach erlaubtem Enrichment den betroffenen Product-Check-/Readiness-Status neu bewerten. Keine Erfolgsaussage ohne bestätigten Write beziehungsweise aktuellen Readback.

## Checks

- Produktidentität unverändert?
- Nur tatsächlich benötigte Felder recherchiert?
- Quelle und Provenance dokumentiert?
- Confidence ausreichend?
- Konflikt mit vorhandenen Daten?
- Compliance-sensitiv?
- Mutation technisch erlaubt und gegebenenfalls freigegeben?
- Übernahme tatsächlich bestätigt?

## Output

- gefundene Daten mit Quelle/Confidence,
- automatisch übernommene unkritische Daten,
- nur vorgeschlagene/review-pflichtige Compliance-Daten,
- ungelöste Konflikte,
- aktualisierte Readiness beziehungsweise nächster Schritt.

## Stop-/Review-Bedingungen

- `STOP – product_not_found`: Produkt nicht eindeutig auflösbar.
- `STOP – source_conflict`: kritische Quellen nicht sicher auflösbar.
- `STOP – no_reliable_source`: kein belastbarer Fund.
- `REVIEW – insufficient_confidence`: Fund zu unsicher für automatische Übernahme.
- `REVIEW – compliance_required`: Compliance-Daten dürfen noch nicht übernommen werden.
- `REVIEW – existing_value_conflict`: neuer Fund widerspricht bestätigtem Bestandswert.
- `NEXT – product_check`: Enrichment abgeschlossen; Produkt erneut prüfen.

---

# PLAYBOOK 03 – Listing-Vorbereitung bis eBay Draft

## Zweck

Ein ausreichend geprüftes Produkt bis zu einem vollständigen **eBay-Draft/Entwurf** vorbereiten. Dieses Playbook endet ausdrücklich vor Live-Publishing.

## Input

Eindeutig identifiziertes Produkt mit ausreichendem Product-Check-/Workflow-Status und den notwendigen Freigaben für die Draft-Erstellung.

## Schritte

### 1. Readiness und Freigaben prüfen

Product Master vorhanden, Identität eindeutig, keine kritischen Check-Blocker, Draft-Pfad erlaubt.

### 2. Pflichtdaten prüfen

Mindestens Artikelnummer, Titelbasis, Kategorie, Bilder, Preis, Menge, Produktmerkmale, Supplier-/Produktdaten und Compliance-Status prüfen.

### 3. Listing Content vorbereiten

Titel, Beschreibung, Vorteile, technische Merkmale, Lieferumfang und Hinweise faktentreu vorbereiten. Keine unbelegten Merkmale ergänzen.

### 4. eBay Taxonomy und Item Specifics prüfen

Kategorie und Pflichtmerkmale über vorhandene eBay-/Taxonomy-Pfade bestimmen. Unsichere Pflichtwerte nicht raten.

### 5. Compliance prüfen

Hersteller, EU Responsible Person falls erforderlich, GPSR, Sicherheitsinformationen und Warnhinweise auf ausreichenden bestätigten Status prüfen. Offene Compliance-Daten blockieren oder gehen in Review; sie werden nicht automatisch bestätigt.

### 6. Varianten prüfen

SKUs, Werte, Bilder und Preise sauber zuordnen. Doppelte oder widersprüchliche Varianten stoppen.

### 7. Economics final gegenprüfen

Aktuelle verifizierte Preis-/Kostenlage gegen den Product Check halten. Relevante Abweichungen sichtbar machen.

### 8. Draft erzeugen

Nur den vorhandenen Draft-Pfad verwenden. **Kein Live-Publish.**

### 9. Draft Quality Gate

Identität, Pflichtdaten, Kategorie, Item Specifics, Compliance-Status, Varianten, Economics und Bilder prüfen. Den Erfolg nur melden, wenn die Draft-Erstellung tatsächlich bestätigt wurde.

## Checks

- Produkt freigegeben und eindeutig?
- Keine erfundenen Werte?
- Kategorie/Item Specifics belastbar?
- Compliance ausreichend bestätigt?
- Varianten konsistent?
- Economics weiterhin plausibel?
- Draft technisch bestätigt?
- Live-Publishing weiterhin gesperrt?

## Output

```text
DRAFT_READY | NEEDS_DATA | NEEDS_REVIEW | BLOCKED
```

mit konkreten Gründen und dem nächsten sinnvollen Schritt.

## Stop-/Review-Bedingungen

- `STOP – product_not_approved`: vorgelagerte Freigabe fehlt.
- `STOP – critical_data_missing`: essenzielle Produktdaten fehlen.
- `STOP – identity_or_variant_conflict`: Produkt/Variante nicht eindeutig.
- `REVIEW – taxonomy_uncertain`: Kategorie oder Pflichtmerkmale unsicher.
- `REVIEW – compliance_incomplete`: Compliance noch nicht ausreichend bestätigt.
- `REVIEW – economics_changed`: relevante Preis-/Kostenabweichung.
- `STOP – live_publish_requested`: automatisches eBay-Live-Publishing bleibt gesperrt; höchstens Draft vorbereiten.

## Harte Safety-Grenze

Das Playbook darf niemals selbstständig:

- eBay live veröffentlichen,
- Supplier-Bestellungen auslösen,
- Refunds durchführen,
- Kundennachrichten versenden,
- Compliance-/Legal-Daten ohne vorgesehene Freigabe übernehmen,
- Safety- oder Approval-Gates umgehen.

---

## Playbook-Auswahl

V1 enthält **genau diese drei Core-Playbooks**. Market Scout/Produktsuche kann weiterhin als Capability oder Spezialisten-Workflow existieren, ist aber kein Phase-3-Core-Playbook.

Bei kombinierten Aufträgen gilt die Prozesslogik:

```text
Product Check
→ bei Datenlücken Product Enrichment
→ Product Check erneut bewerten
→ Listing-Vorbereitung
→ eBay Draft
```

Eine nachgelagerte Stufe darf kein noch nicht erfülltes Gate überspringen.
