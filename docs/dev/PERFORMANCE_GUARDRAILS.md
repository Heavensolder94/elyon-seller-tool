# Elyon Seller Tool – Performance Guardrails

Diese Regeln werden bei jedem Vercel-Build und in GitHub Actions automatisch geprüft. Eine Verletzung stoppt den Build, bevor der Stand produktiv wird.

## Aktuelle Budgets

| Messwert | Gesunder Stand | Harte Grenze |
|---|---:|---:|
| Quell-HTML | 930.513 Bytes | 1.020.000 Bytes |
| Produktions-HTML | 192.354 Bytes | 220.000 Bytes |
| Desktop-App-Kern | 476.168 Bytes | 540.000 Bytes |
| Lazy-Agentenmodul | 264.652 Bytes | 300.000 Bytes |
| Startmodule | 21 | 24 |
| lokales Start-JavaScript | 775.578 Bytes | 900.000 Bytes |
| MutationObserver im Startpfad | 12 | 14 |
| Polling-Schleifen im Startpfad | 3 | 6 |
| größtes Inline-Skript | 0 Bytes | 16.000 Bytes |

## Zusätzlich immer verboten

- externe JavaScript-Bibliotheken im Start-HTML
- doppelte Startmodule
- doppelte Lazy-Module
- dasselbe Modul gleichzeitig im Start- und Lazy-Pfad
- fehlende lokale Start-Assets

## Prüfpfade

- `npm test` prüft die Guardrail-Logik und simuliert typische Regressionen.
- `npm run build` erzeugt den Produktionsstand und führt die echte Messung aus.
- `npm run check:performance` prüft einen bereits erzeugten `public`-Build erneut.
- GitHub Actions läuft bei Pull Requests und bei Pushes auf `main`.
- Vercel stoppt jeden Build direkt, sobald ein Budget verletzt wird.

## Bewusste Erweiterungen

Ein Budget darf nur angehoben werden, wenn gleichzeitig dokumentiert wird:

1. warum die neue Funktion zwingend im Startpfad liegen muss,
2. warum Lazy Loading nicht möglich ist,
3. welche vorhandene Startlast dafür reduziert wurde,
4. welche Messwerte der neue Preview-Build liefert.

Neue größere Funktionen gehören grundsätzlich in einen bedarfsgesteuerten Runtime-Loader und nicht direkt in `index.html` oder den globalen Startpfad.
