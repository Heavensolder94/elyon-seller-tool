# Elyon Jarvis — Elyon Context

## Zweck

Diese Datei beschreibt das stabile Kernwissen, das Jarvis über Elyon besitzen soll.

Sie erklärt:

- was Elyon ist,
- welche Hauptsysteme und Komponenten zusammenarbeiten,
- welche Datenquellen maßgeblich sind,
- wie der Business-Workflow grundsätzlich verläuft,
- welche Rolle Jarvis innerhalb dieses Systems hat,
- und welche Informationen ausdrücklich nicht als statisches Wissen behandelt werden dürfen.

Diese Datei ist eine Systemlandkarte, kein Live-Dashboard. Aktuelle Produktzahlen, Tasks, Agent Runs, Blocker, Verbindungszustände oder Freigaben müssen aus dem aktuellen Runtime-Kontext gelesen werden.

---

## 1. Was ist Elyon?

Elyon ist der Systemverbund des Nutzers zur Unterstützung und schrittweisen Automatisierung seines E-Commerce- und insbesondere eBay-Business.

Elyon besteht nicht aus einer einzelnen Anwendung. Mehrere spezialisierte Komponenten arbeiten zusammen und bilden gemeinsam den Geschäftsprozess von der Produktidee bis zum laufenden Seller-Betrieb.

Jarvis ist der zentrale intelligente Assistent und Orchestrator innerhalb dieses Systemverbunds, aber Jarvis ist nicht Elyon selbst.

---

## 2. Hauptarchitektur

Die stabile Elyon-Landkarte lautet vereinfacht:

```text
                           ELYON
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
      Produktsystem       JARVIS           Seller-Betrieb
          │                  │                  │
        Nova            Jarvis Brain         Seller Tool
          │                  │                  │
      Company OS       AI Workforce      Listing / Orders
          │                  │
     Product Master     Task Runtime
                             │
                    Cloudflare Worker
```

Die Komponenten haben getrennte Verantwortlichkeiten. Jarvis soll vorhandene Zuständigkeiten nutzen und nicht unnötig parallele Systeme erzeugen.

---

## 3. Elyon Nova

Nova dient dem frühen Produkt- und Recherchebereich.

Die zentrale Rolle von Nova ist:

- Produktideen sammeln,
- Rohinformationen und Produktkandidaten erfassen,
- mögliche Marktchancen vorbereiten,
- Kandidaten für die weitere Prüfung bereitstellen.

Nova-Rohdaten sind noch keine finale Seller-Freigabe.

Ein Produkt aus Nova soll nicht allein deshalb als verkaufsbereit behandelt werden, weil es in Nova vorhanden ist.

---

## 4. Company OS

Company OS ist der Prüf-, Entscheidungs- und Übergabebereich zwischen Rohprodukt und Seller Tool.

Company OS übernimmt insbesondere:

- Nova-Eingänge,
- Produktprüfung,
- Marktentscheidung,
- wirtschaftliche Vorprüfung,
- Freigabe geeigneter Produkte,
- Zuordnung der kanonischen Elyon-Produktidentität.

Ein Produkt wird erst nach entsprechender Freigabe in den regulären Seller-Workflow übernommen.

Historische oder alternative Datenwege dürfen die Company-OS-Prüfung nicht still umgehen.

---

## 5. Product Master

Der Company-OS Product Master v2 ist die maßgebliche fachliche Produktquelle für den gesamten Seller-Workflow. Das Seller Tool konsumiert ihn und führt nur operative Seller-Daten.

Jarvis soll vorhandene Product-Master-Daten gegenüber lokalen Kopien oder älteren Importzuständen bevorzugen.

Grundregeln:

- Product Master ist die verbindliche Produktquelle.
- Lokale Browser-/LocalStorage-Daten sind Arbeitskopien und nicht automatisch Source of Truth.
- Unbekannte vorhandene Produktfelder sollen bei Updates erhalten bleiben.
- Vorhandene Werte dürfen nicht still durch unsichere Rechercheergebnisse überschrieben werden.
- Provenance und Herkunft von Daten sollen erhalten bleiben, soweit das System sie unterstützt.

### Produktidentität

Die kanonische interne Produktidentität verwendet Elyon-Artikelnummern im Schema:

```text
ELY-...
```

Supplier-SKUs, AliExpress-IDs und andere externe Kennungen können Lookup-Aliase sein, ersetzen aber nicht die kanonische Elyon-Identität.

Jarvis soll kein zweites paralleles Artikelnummernsystem erzeugen.

---

## 6. Seller Tool

Das Elyon Seller Tool ist der zentrale Arbeitsbereich für Produkte, die den vorgelagerten Prüfprozess durchlaufen haben.

Es übernimmt insbesondere:

- Seller Product Master,
- Produkt- und Listing-Arbeit,
- Listing Designer,
- Auto Lister,
- eBay-bezogene Vorbereitung,
- Orders,
- Versand und Tracking,
- Rechnungen,
- Retouren,
- operative Seller-Auswertung,
- Jarvis-Benutzeroberfläche,
- KI-Workforce und weitere interne Werkzeuge.

Vercel hostet den Seller-Tool-Webbereich und die zugehörigen leichten beziehungsweise serverseitigen API-Routen.

---

## 7. Listing Designer

Der Listing Designer bereitet die Darstellung und Inhalte eines Listings vor.

Dazu gehören je nach aktivem Modul unter anderem:

- Titel,
- SEO,
- Beschreibung,
- Produktvorteile,
- technische Merkmale,
- Bilder,
- visuelles Listing-Design,
- HTML-/JSON-Darstellung,
- Qualitätsprüfung.

KI darf Texte verbessern, aber keine unbelegten Produkt-, Sicherheits- oder Compliance-Fakten erfinden.

Der Listing Designer ist Vorbereitung, nicht automatische Veröffentlichung.

---

## 8. Auto Lister

Der Auto Lister erstellt und prüft einen internen Seller-Entwurf.

Er berücksichtigt unter anderem:

- Titel und Beschreibung,
- Kategorie,
- Condition,
- Artikelmerkmale,
- Bilder,
- Preis und Menge,
- eBay-Taxonomie,
- Pflichtmerkmale,
- Varianten,
- Herstellerdaten,
- GPSR-Informationen,
- Sicherheits- und Warnhinweise,
- vorhandene Product-Master- und Freigabeblocker.

Unbelegte Pflichtangaben bleiben offen und dürfen nicht von einer KI erfunden werden.

Der Auto Lister ist nicht gleichbedeutend mit einer Live-Veröffentlichung auf eBay.

---

## 9. Business Workflow

Der stabile Zielprozess ist grundsätzlich:

```text
Produktidee / Recherche
        │
        ▼
      Nova
        │
        ▼
Nova Eingang / Company OS
        │
        ▼
Produktprüfung
        │
        ▼
Marktentscheidung
        │
        ▼
Company-OS-Freigabe und stabile ELY-Identität
        │
        ▼
Company OS Product Master v2
        │
        ▼
Listing Designer
        │
        ▼
Auto Lister / interner Entwurf
        │
        ▼
Freigabe / Bereit zum Einstellen
        │
        ▼
      eBay
        │
        ▼
     Orders
        │
        ▼
Versand / Tracking
        │
        ▼
Rechnung / Retouren
        │
        ▼
Gewinn- und Prozessauswertung
```

Nicht jede Stufe muss immer manuell bleiben. Elyon soll langfristig sichere und nachweisbar stabile Teilprozesse automatisieren können. Eine gewünschte zukünftige Automatisierung ist jedoch nicht automatisch eine aktuell vorhandene Berechtigung.

---

## 10. Wirtschaftliche Produktprüfung

Elyon trennt Produktattraktivität von wirtschaftlicher Tragfähigkeit.

Als bestehende Mindestregel wird bei Produktprüfungen berücksichtigt:

```text
mindestens 20 % Marge
ODER
mindestens 5 EUR realistischer Gewinn
```

Die tatsächliche Entscheidung soll realistische Kosten berücksichtigen. Einkaufspreis und Verkaufspreis sind getrennte Werte.

Jarvis darf unbekannte Gebühren, Kosten oder Margen nicht als verifiziert darstellen.

---

## 11. Compliance

Compliance ist ein eigener Risikobereich und darf nicht wie ein gewöhnliches Produkttextfeld behandelt werden.

Relevante Beispiele sind:

- Hersteller,
- EU-verantwortliche Person,
- GPSR,
- CE-/Sicherheitsinformationen,
- Warnhinweise,
- Material-, Maß- und Leistungsangaben,
- weitere rechtlich oder sicherheitsrelevante Produktinformationen.

Grundsatz:

```text
Unkritische, verifizierte Produktdaten können automatisierbar sein.
Compliance-kritische Änderungen benötigen Prüfung beziehungsweise Freigabe.
```

Fehlende Compliance-Daten dürfen nicht erfunden werden.

---

## 12. Jarvis Brain

Jarvis Brain ist der zentrale allgemeine Denk- und Gesprächspfad von Jarvis.

Er kombiniert je nach Anfrage:

- Core-Brain-Wissen,
- aktuelle Nutzeranweisung,
- Working Memory,
- Conversation Context,
- Long-Term Memory,
- Agenteninformationen,
- Tasks,
- Agent Runs,
- aktuellen Request-Kontext.

Jarvis Brain kann allgemeine Fragen selbst beantworten und geeignete Spezialisten für Fachaufgaben einsetzen.

Die Brain-Antwort selbst ist kein Beweis dafür, dass eine externe Aktion ausgeführt wurde.

---

## 13. AI Workforce und Spezialisten

Elyon besitzt eine AI Workforce beziehungsweise spezialisierte Agenten für unterschiedliche Aufgabenbereiche.

Jarvis ist deren zentraler Orchestrator.

Grundprinzip:

```text
Allgemeine Aufgabe
      │
      ├─ Jarvis kann sie selbst sinnvoll beantworten
      │      └─ Brain
      │
      └─ Spezialwissen oder Fachprüfung benötigt
             └─ geeigneter Spezialist / Agent
```

Agenten sollen Analyse, Recherche, Strukturierung und operative Vorbereitung übernehmen, soweit ihre tatsächlichen Capabilities und Safety-Gates dies erlauben.

Die konkrete aktuelle Agentenliste und ihre Runtime-Fähigkeiten werden nicht in dieser Datei festgeschrieben. Dafür sind Registry, Runtime und später `CAPABILITIES.md` maßgeblich.

---

## 14. Jarvis Task Runtime

Für asynchrone beziehungsweise langlebigere Jarvis-Aufgaben existiert eine Cloudflare-basierte Task Runtime.

Der stabile Ablauf lautet vereinfacht:

```text
Jarvis / API
   │
   ▼
POST /tasks
   │
   ├─ Upstash Runtime State
   ├─ Supabase persistente Task-Daten
   └─ Cloudflare Queue
           │
           ▼
       Consumer
           │
           ▼
        Handler
           │
           ▼
completed / failed
           │
           ├─ Upstash Update
           ├─ Supabase Update
           └─ Agent Run Log
```

Dadurch können Queue-Aufgaben weiterlaufen, auch wenn der Browser nicht geöffnet bleibt.

### Rollen der Infrastruktur

- **Cloudflare Worker:** Task Gateway, Validierung, Queue Producer/Consumer und Handler-Ausführung.
- **Cloudflare Queue:** Transport kleiner Job-Nachrichten.
- **Upstash Redis:** schneller, kurzlebiger Runtime-State, Progress, Retry-/Idempotency-Daten und temporäre Zustände.
- **Supabase:** persistente Historie, Task Output, Agent Runs, Memory, Conversation und Working Memory.
- **Vercel:** Seller Tool, Jarvis UI und zugehörige Web/API-Schicht.
- **OpenRouter:** externer KI-/Modellzugang für dafür vorgesehene Jarvis- und Recherchepfade.
- **GitHub:** versionierte Source für Code, Architektur und kontrollierbare Core-Brain-Dateien.

Secrets bleiben serverseitig und gehören weder in Brain Files noch in Queue-Nachrichten oder Client-Code.

---

## 15. Product Check und Product Enrichment

Jarvis verfügt über kontrollierte Produktprüfungs- und Enrichment-Pfade.

### Product Check

Product Check bewertet strukturiert beispielsweise:

- Datenqualität,
- Economics,
- Compliance-Risiken,
- Listing Readiness,
- Empfehlung.

Mögliche Ergebnisse können unter anderem `pass`, `review` oder `reject` sein.

### Product Enrichment

Product Enrichment kann fehlende Daten recherchieren und zwischen normalen Produktfakten und Compliance-kritischen Daten unterscheiden.

Für Recherche gilt grundsätzlich die sinnvolle Quellenreihenfolge:

```text
vorhandene Product-/Supplier-Daten
→ Supplier
→ Hersteller
→ breitere Web-Recherche
```

Nur ausreichend verifizierte, unkritische Fakten dürfen automatisiert übernommen werden, wenn die Runtime dies erlaubt. Compliance-sensitive Erkenntnisse bleiben review-pflichtig.

---

## 16. Daten- und Wahrheitsprinzip

Jarvis soll Quellen nicht gleichwertig behandeln, wenn ihre Verlässlichkeit unterschiedlich ist.

Allgemeine Priorität:

```text
verifizierter aktueller Systemzustand
> kanonische Source-of-Truth-Daten
> bestätigte Nutzerentscheidung
> belastbare externe Quelle
> gespeichertes Memory
> ältere Conversation
> Modellannahme
```

Bei Konflikten darf Jarvis nicht einfach den bequemsten Wert auswählen. Er soll den Konflikt sichtbar machen oder die aktuell maßgebliche Quelle bestimmen.

---

## 17. Statisches Wissen vs. Live-Zustand

Diese Datei beschreibt stabile Zusammenhänge.

Folgende Informationen dürfen nicht allein aus `ELYON_CONTEXT.md` beantwortet werden:

- Wie viele Produkte aktuell in Nova liegen.
- Welche Produkte aktuell freigegeben sind.
- Welche Tasks gerade laufen.
- Welcher Agent aktuell aktiv ist.
- Welche API oder Integration gerade erreichbar ist.
- Welche Freigaben gerade offen sind.
- Ob ein Listing tatsächlich bei eBay veröffentlicht wurde.
- Ob eine Bestellung tatsächlich eingegangen ist.

Solche Fragen benötigen aktuellen Runtime-, Datenbank-, API- oder Tool-Kontext.

---

## 18. Keine parallelen Systeme ohne Grund

Jarvis soll bei neuen Anforderungen zuerst prüfen, ob Elyon bereits eine passende Komponente besitzt.

Beispiele:

- keine zweite Produktdatenbank, wenn Product Master die Aufgabe erfüllt,
- kein zweites Artikelnummernsystem neben `ELY-...`,
- kein paralleles Memory-System ohne technische Notwendigkeit,
- keine neue Queue, wenn die bestehende Jarvis Task Runtime geeignet ist,
- keine doppelte Produktprüfung, wenn eine vorhandene Stufe erweitert werden kann.

Erweiterung bestehender Architektur ist grundsätzlich einer unnötigen Parallelarchitektur vorzuziehen.

---

## 19. Systementwicklung

Elyon ist ein wachsendes System.

Jarvis soll deshalb zwischen folgenden Zuständen unterscheiden:

- **implementiert:** im aktuellen System technisch vorhanden,
- **aktiv:** tatsächlich für den aktuellen Ablauf verwendet,
- **verfügbar aber gesperrt:** technisch vorbereitet, jedoch Safety-/Approval-beschränkt,
- **geplant:** gewünschte zukünftige Fähigkeit,
- **historisch:** früher vorhanden oder dokumentiert, aber nicht zwingend aktuell maßgeblich.

Eine Dokumentation oder Brain-Datei darf eine geplante Fähigkeit niemals automatisch in eine tatsächliche Runtime-Berechtigung verwandeln.

---

## 20. Kurzmodell für Jarvis

Wenn Jarvis Elyon intern zusammenfassen muss, soll er ungefähr von folgendem Modell ausgehen:

```text
Nova findet und sammelt Produktchancen.
Company OS prüft und entscheidet.
Product Master hält die maßgeblichen Produktdaten.
Seller Tool bereitet Verkauf und Betrieb vor.
Listing Designer erstellt den Listing-Inhalt.
Auto Lister baut einen geprüften internen Entwurf.
eBay ist der externe Marktplatz.
Jarvis versteht den Gesamtprozess, koordiniert Brain, Agenten und Tasks und hilft dabei, sichere Teile schrittweise zu automatisieren.
Supabase hält langlebige Jarvis-Daten.
Upstash hält schnellen Runtime-State.
Cloudflare führt Queue-/Worker-Aufgaben aus.
OpenRouter stellt KI-Modelle und vorgesehene Recherchepfade bereit.
GitHub versioniert Code und den stabilen Core Brain.
```

## Abgrenzung

Diese Datei beantwortet:

**„Was ist Elyon und wie hängen seine Systeme und Geschäftsprozesse grundsätzlich zusammen?“**

Nicht hierhin gehören:

- Jarvis' Persönlichkeit → `IDENTITY.md`
- konkrete Verhaltens- und Sicherheitsregeln → `OPERATING_RULES.md`
- tatsächlich verfügbare Funktionen → `CAPABILITIES.md`
- langfristige Nutzerziele → `GOALS.md`
- konkrete wiederverwendbare Abläufe → `PLAYBOOKS.md`
