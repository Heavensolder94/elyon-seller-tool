# eBay FX_DRAFT: Wiederherstellung bestehender Entwürfe

## Ursache

Ein erfolgreiches eBay-FX_DRAFT kann beim nachträglichen ELYON-Abgleich scheitern,
wenn dieselbe Amazon-SKU früher in einem archivierten oder entfernten Feed-Task
verwendet wurde. Die bisherige Prüfung `saveExternalDraft` sperrte **jede**
abweichende Task-ID, auch die eines bereits abgeschlossenen Verlaufsdatensatzes.

Der bestehende eBay-Entwurf ist davon unabhängig und darf weder gelöscht noch
erneut erstellt werden.

## Reparatur

- `planExternalFeedRegistration` berücksichtigt nur die richtige eBay-Umgebung.
- Dieselbe SKU und exakt dieselbe aktive Task-ID werden idempotent zugeordnet.
- Alte `archived`, `removed` oder `ended` Datensätze mit **anderen**
  Task-IDs bleiben unangetastet. Für eine neue verifizierte Task wird ein eigener
  Registerdatensatz angelegt.
- Ein *noch aktiver* Feed-Task, Inventory-Offer, published-Listing,
  doppelte Task-Zuordnungen oder ein bereits archivierter *identischer* Task
  werden niemals überschrieben bzw. still reaktiviert.
- Nach einer Registrierung mit Task-ID liest ELYON den Speicher erneut und
  bestätigt die konkrete SKU-/Task-Verknüpfung.
- Ist der Speicher nicht bestätigt, erscheint eine verständliche Ursache
  unmittelbar im Amazon Importer. Kein Browser-Debugger notwendig.

## Benutzung

Im Amazon Importer zum bereits vorhandenen Produkt zurückkehren und nur
**„Vorhandenen Entwurf mit ELYON abgleichen“** betätigen. Das lädt den bereits
erfolgreichen eBay-Task, erzeugt weder neue Draft-Tasks noch ein Live-Angebot.

Falls nun `storage_unavailable` angezeigt wird, betrifft dies die
serverseitige Redis-Konfiguration; der eBay-Entwurf bleibt erhalten.
Keine SKU, Task-ID oder Archivhistorie wird dafür automatisch überschrieben.
