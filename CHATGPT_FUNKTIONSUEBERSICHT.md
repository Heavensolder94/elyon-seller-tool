# Elyon – Funktionsübersicht für ChatGPT

## Ziel
Diese Übersicht beschreibt die aktuell umgesetzten Funktionen rund um:
- `AI Task Center`
- `KI-Agenten`
- `Virtuelle MA`
- `Erweiterte Autonomie`
- Prompt-Logik (individuell + übergeordnet)

## Hauptbereiche (Tabs)
- `Übersicht`
- `AI Task Center`
- `KI-Agenten`
- `Virtuelle MA`

Wichtig:
- Der Block zu `Funktionen/Rollen` (Autonomie-Registry) ist auf `Übersicht` begrenzt.
- In den anderen Tabs wird dieser Block nicht als eigener Bereich angezeigt.

## KI-Agenten / Virtuelle MA
Jede Karte (z. B. `Soul Scout`, `Soul Finance`) enthält:
- Aktiv/Inaktiv
- Status, Modus, Modell, Tageslimit
- Aufgabenbeschreibung
- Prompt-Vorschau
- Button `Prompt bearbeiten` (öffnet Modal)
- `Agent testen`

## Prompt-System (kombiniert)
Es gibt 2 Prompt-Ebenen:

1. Übergeordnetes Bereichs-Prompt
- Für `KI-Agenten` (gilt für alle KI-Agenten)
- Für `Virtuelle MA` (gilt für alle Virtuellen MA)

2. Individuelles Prompt pro Karte
- Gilt nur für den jeweiligen Eintrag

Effektive Logik:
- `Wirksamer Prompt = Bereichs-Prompt + individueller Prompt`

## Modals

### 1) Individuelles Prompt-Modal
`Prompt bearbeiten` pro Karte öffnet ein eigenes Fenster mit:
- Prompt-Textfeld
- `Promt Vorlage`
- `Deepseek`
- `Speichern`
- `Abbrechen`

### 2) Bereichs-Prompt-Modal
`Bereichs-Prompt bearbeiten` (im Bereich `KI-Agenten` oder `Virtuelle MA`) öffnet:
- Übergeordnetes Promptfeld
- `Promt Vorlage`
- `Deepseek`
- `Speichern`
- `Abbrechen`

## DeepSeek & Vorlagen
Für beide Modaltypen:
- `Promt Vorlage` zeigt passende Vorschläge.
- `Deepseek` verfeinert den aktuellen Entwurf und macht ihn präziser/länger.
- Ergebnis kann direkt gespeichert werden.

## Erweiterte Autonomie (Übersicht)
Funktionen:
- `Erweiterte Autonomie freischalten` (mit Sicherheits-Interaktion)
- Verwaltung von geschützten Einträgen:
  - `Funktionen`
  - `Rollen`
- Pro Eintrag:
  - Aktivieren/Sperren
  - ⚙️ Einstellungs-Modal

Hinweis:
- Live-Aktionen bleiben durch Sicherheitsmodus/Sandbox begrenzt.

## Persistenz
Alle Einstellungen werden lokal gespeichert (`localStorage`), u. a.:
- Agenten-Einstellungen
- individuelle Prompts
- Bereichs-Prompts
- Autonomie-Zustände

## Aktuelle Standard-Bereichs-Prompts

### KI-Agenten
Du arbeitest analytisch und strategisch für eCommerce-Entscheidungen. Nutze vorhandene Daten priorisiert nach Umsatzhebel, Marge, Risiko und Umsetzbarkeit. Antworte strukturiert mit: 1) Kurzfazit, 2) wichtigste Chancen, 3) wichtigste Risiken, 4) konkrete nächste Schritte (max. 5), 5) offene Annahmen. Keine Live-Ausführung, keine finalen Freigaben ohne explizite Bestätigung.

### Virtuelle MA
Du arbeitest operativ, zuverlässig und kundenorientiert im Tagesgeschäft. Formuliere klar, knapp und umsetzbar. Prüfe vor jedem Vorschlag: Kosten, Risiken, Datenvollständigkeit und Abhängigkeiten. Gib Ergebnisse als Arbeitsanweisung mit Priorität, Verantwortlichkeit und nächstem Schritt aus. Bei Unsicherheit oder Konflikten eskalierst du statt automatisch zu handeln. Keine verbindlichen Zusagen ohne Freigabe.

## Kurzfassung für ChatGPT-Prompt
Wenn du ChatGPT eine kurze Systemanweisung geben willst, kannst du mit folgendem Einstieg arbeiten:

`Arbeite in Elyon mit kombinierter Prompt-Logik: Bereichs-Prompt + individueller Prompt je Eintrag. Bereichs-Prompt gilt für alle KI-Agenten bzw. alle Virtuellen MA im jeweiligen Tab. Individuelle Prompts bleiben separat und überschreiben nicht das Bereichs-Prompt, sondern ergänzen es.`

