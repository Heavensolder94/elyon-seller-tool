# Elyon Seller Tool – Modernisierung des Schnellstartmenüs

**Datum:** 28. Juli 2026  
**Repository:** `Heavensolder94/elyon-seller-tool`  
**Feature-Branch:** `feat/modern-seller-quickstart`  
**Basis-Commit:** `4de6b865e7b101b39564268b5919bcb7f3c463a6`  
**Main-Status:** unverändert, kein Merge  
**Prüf-PR:** `#41` (Draft, nicht zum Merge freigegeben)

## Ziel

Das alte Schnellstartmenü aus der monolithischen `index.html` wird zur Laufzeit durch ein modernes Seller-Menü ersetzt. Die neue sichtbare Reihenfolge lautet:

1. Company OS Eingang
2. Seller Product Master
3. Listing-Paket
4. eBay
5. Bestellungen
6. Versand
7. Rechnungen
8. Retouren

Zusätzlich sind „Virtuelle Mitarbeiter“ und „System- & API-Einstellungen“ erreichbar.

Shopify, die alte Produktprüfung, alte Kalkulationszugänge sowie frühere Labor- und Marktcheck-Einstiege werden im neuen Schnellstart nicht mehr angeboten. Die zugrunde liegenden Altbereiche werden dabei nicht unkontrolliert gelöscht.

## Architektur

### Lazy geladenes Schnellstartmodul

`seller-quickstart-menu.js` wird über den bestehenden `seller-runtime-loader.js` erst geladen, wenn das Schnellstartmodal geöffnet ist. Es wird nicht in den kritischen Desktop-Startblock aufgenommen.

Das Modul ersetzt ausschließlich den Inhalt des bestehenden Modals. Dadurch bleiben die bestehende Startoption und der vorhandene Öffnen-Button kompatibel, ohne die sehr große `index.html` erneut mit Parallelcode zu erweitern.

### Gemeinsame Dashboard-Datenbasis

Das Schnellstartmenü führt keine eigenen Requests gegen Product Master oder eBay aus. Es verwendet den Snapshot des aktuellen Seller-Dashboards und dessen priorisierte Aufgaben.

Beim Laden wird die vorhandene öffentliche Dashboard-Schnittstelle um folgende kompatible Funktionen ergänzt:

- `getSnapshot()` für den gemeinsamen Seller-Zustand
- deduplizierte `refresh()`-Aufrufe
- Event `elyon:seller-dashboard-updated`

Beim automatischen Öffnen während des Seitenstarts wird keine zusätzliche Aktualisierung ausgelöst. Das Menü wartet auf den ohnehin laufenden Dashboard-Aufbau. Eine Aktualisierung wird erst bei einer bewussten manuellen Öffnung oder über den Aktualisieren-Button angefordert.

### Kontrollierte Navigation

Jede Schnellstartroute:

1. lädt bei Bedarf die passende Runtime-Gruppe,
2. schließt das Modal,
3. öffnet den vorhandenen Tab,
4. sendet `elyon:tab-changed`,
5. aktiviert bei Listing-Paket/eBay den bestehenden Selling-Flow-Abschlussbereich,
6. fokussiert beziehungsweise scrollt zum vorhandenen Zielbereich.

Es wird kein Produkt veröffentlicht, keine Bestellung ausgelöst und keine Einstellung automatisch verändert.

## Geänderte Dateien

- `seller-quickstart-core.js` – Workflow, Routen und Refresh-Deduplizierung
- `seller-quickstart-snapshot.js` – gemeinsamer Seller-Dashboard-Snapshot
- `seller-quickstart-view.js` – moderne Oberfläche und responsive Darstellung
- `seller-quickstart-menu.js` – Dialogsteuerung, Navigation und Dashboard-Bridge
- `seller-runtime-loader.js` – Lazy-Gruppe und Öffnungssteuerung ergänzt
- `scripts/prepare-vercel.mjs` – Schnellstartmodul in den Build-Mirror aufgenommen
- `tests/seller-quickstart-menu.test.mjs` – Workflow-, Daten-, Lazy-Loading- und Sicherheitsprüfungen
- `docs/dev/QUICKSTART_MODERNIZATION_2026-07-28.md` – diese Dokumentation

## Bewusst nicht geändert

- `main`
- Product-Master-API
- eBay-API-Routen und OAuth
- Produktdaten und Arbeitskopien
- Einstellungen und Environment Variables
- automatische Listing-/Bestellsperren
- Shopify- und Altmodule als Codebestand
- Vercel-Projekt- und Domainzuordnung

## Sicherheitsregeln

- Kein direkter `fetch()` im Schnellstartmodul
- Keine Product-Master- oder eBay-API-URL im Schnellstartmodul
- Keine zusätzliche Startskript-Injektion
- Keine automatische eBay-Veröffentlichung
- Keine automatische Bestellung
- Keine Löschaktion
- Keine Veränderung von API-Keys oder Settings
- Alte Bereiche werden nur aus dem neuen sichtbaren Schnellstart entfernt, nicht technisch gelöscht

## Tests

Gezielte lokale Tests:

```text
node --test tests/seller-quickstart-menu.test.mjs
9 Tests bestanden
```

Vollständige Branch-Prüfung über den Draft-PR `#41`:

- GitHub Actions „Seller Tool Tests“, Lauf `#45`: **erfolgreich**
  - Syntaxprüfungen: erfolgreich
  - `npm test`: erfolgreich
  - `npm run build`: erfolgreich
  - darin enthaltener `npm run check:layout`: erfolgreich
  - `npm run check:performance`: erfolgreich
- GitHub Actions „P0 safety tests“, Lauf `#87`: **erfolgreich**
  - Security-Tests: erfolgreich
  - vollständiger Testreport: erfolgreich hochgeladen
  - Produktionsbuild: erfolgreich
- Vercel Preview-Build `elyon-seller-tool`: **erfolgreich**
- Vercel Preview-Build `elyonsellertool`: **erfolgreich**

Damit sind Tests, Layout-Check, Performance-Budgets, Sicherheitsprüfungen und Produktionsbuild auf dem vollständigen Feature-Branch bestanden.

## Restrisiken

1. Das bestehende alte Schnellstart-HTML und seine Funktionen verbleiben vorerst als Rückfallpfad in `index.html`. Das neue Lazy-Modul ersetzt die sichtbare Oberfläche nach dem Laden. Eine spätere physische Entfernung sollte erst erfolgen, wenn der neue Ablauf mehrere Deployments stabil gelaufen ist.
2. Das gemeinsame Dashboard-Snapshot-API wird kompatibel zur Laufzeit ergänzt, statt den großen Dashboard-Kern erneut umzubauen. Direkte interne Dashboard-Aufrufe außerhalb der öffentlichen Schnittstelle bleiben unverändert.
3. Rechnungen und Retouren besitzen im Seller-Dashboard derzeit keine eigenen Live-KPIs. Das Schnellstartmenü zeigt deshalb dort bewusst nur den Zugang und keine aus lokalen Altdaten errechneten Zahlen.
4. Die Company-OS-Inbox und die virtuellen Mitarbeiter bleiben Lazy-Module. Bei einem Netzwerkfehler des statischen Assets kann der Zieltab geöffnet werden, während das Zusatzmodul eine Runtime-Fehlermeldung liefert.
5. Ein abschließender visueller Browsertest auf Desktop und Mobilansicht bleibt vor einem Merge erforderlich.

## Rollback

Der Branch basiert direkt auf:

```text
4de6b865e7b101b39564268b5919bcb7f3c463a6
```

Da `main` unverändert bleibt, besteht der einfachste Rollback darin, den Feature-Branch nicht zu mergen beziehungsweise zu löschen.
