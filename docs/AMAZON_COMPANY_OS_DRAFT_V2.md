# ELYON Amazon Importer: Canonical Company OS Draft V2

## Neues Verhalten

Der vorhandene Extension-Button bleibt unverändert und nutzt weiter
`/api/ebay/extension-action`. Die Extension erhält **keine** Sync-Codes
oder eBay-Tokens.

`lib/ebay-seller-hub-drafts.js` ruft für eine Amazon-SKU vor dem
eBay-Task-Start `POST /api/auto-lister-seller-hub` auf dem Company OS
mit `action=build_external_csv` auf. Dort wird die bereits gespeicherte
Originalvorlage durch dieselbe Draft-V2-Engine wie im Auto Lister ausgefüllt
und passend zur Vorlagenkodierung gespeichert. Das Seller Tool prüft
Dateigröße und SHA-256, legt `FX_DRAFT` an, prüft `CREATED` und
lädt **nur das Multipart-Feld `file`** hoch.

Der Legacy-Builder `buildSellerHubDraftCsv` bleibt für Altverträge/Tests
erhalten, wird aber für neue Amazon-Drafts **nicht** mehr verwendet.
Falls Company OS nicht erreichbar ist oder die Vorlage fehlt, startet
kein eBay-Task und es gibt keinen stillen FX_LISTING-Fallback.

Die bestehenden Registry- und Status-Endpunkte bleiben erhalten.
Die read-only Task-Wiederherstellung prüft `FX_DRAFT` sowie vorhandene
`FX_LISTING`-Tasks einschließlich semikolongetrennter Originaldateien.
Bei ungewissem Upload wird die Task-ID zur späteren Kontrolle
beibehalten, anstatt automatisch einen zweiten Task zu erstellen.
Es wird nichts automatisch veröffentlicht.

## Voraussetzungen & Rollout

1. Zuerst den zugehörigen Company-OS-PR deployen.
2. Im Company OS muss die Original-CSV unter dem vorhandenen
   Auto-Lister-Draft-Vorlagenfeld serverseitig gespeichert sein.
3. Seller Tool benötigt unverändert `ELYON_COMPANY_OS_SYNC_CODE`
   (oder `COMPANY_OS_SYNC_CODE`) und optional `ELYON_COMPANY_OS_URL`.
4. Erst danach diesen Seller-Tool-PR deployen.
5. Einen Testartikel über Amazon Importer → eBay-Entwurf senden.
   FX_DRAFT-Task/Result prüfen und Sichtbarkeit im Seller Hub
   manuell nachsehen, **nicht** den Publish-Button betätigen.

Rollback: Seller-Tool-PR rückgängig machen, wobei der vorherige
FX_LISTING-Pfad problematisch war; besser bei Fehlern neuen Upload
vorerst sperren. Änderungen in diesem PR veröffentlichen
keine Listings und löschen keine Bestandsdaten.
