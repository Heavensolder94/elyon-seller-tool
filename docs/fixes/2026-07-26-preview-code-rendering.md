# Preview zeigte JavaScript-Code als Seitentext

## Ursache

Der Vercel-Build fügte die Seller-Authentifizierung mit `String.replace("</body>", ...)` ein. Die große `index.html` enthält jedoch auch `</body>` innerhalb von JavaScript-Templates für generierte HTML-Ausgaben. Dadurch wurde das Login-Skript an der ersten Zeichenfolge statt vor dem echten abschließenden Body-Tag eingefügt. Der Browser beendete den Inline-Skriptbereich zu früh und stellte nachfolgenden JavaScript-Code als sichtbaren Seitentext dar.

## Reparatur

- zentraler, getesteter HTML-Injektor in `scripts/html-injection.mjs`
- Einfügung ausschließlich vor dem letzten echten `</body>`
- markierte Blöcke werden idempotent ersetzt
- Build verändert nicht mehr die Quell-HTML, sondern nur die Vercel-Ausgabe in `public/`
- Layout-Prüfung ignoriert ausschließlich generierte Marker-Blöcke
- Regressionstest mit einer `</body>`-Zeichenfolge innerhalb eines JavaScript-Templates

## Sicherheitsstatus

- kein PHP-Fehler
- keine Änderung an `main`
- Fix befindet sich ausschließlich in Draft-PR #9
