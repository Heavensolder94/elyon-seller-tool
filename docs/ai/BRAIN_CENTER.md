# Brain Center

## Zweck

Das Brain Center beschreibt die zentrale Steuerung der KI-Bereiche im Elyon Seller Tool.

## Aufgaben

- Aufgaben an passende Agenten verteilen
- Prioritäten setzen
- Ergebnisse sammeln
- Sicherheitsstatus beachten
- Nutzerfreigaben respektieren
- zentrale Brain-Dateien transparent anzeigen

## Jarvis File Manager

Der Jarvis File Manager ist als eigener Bereich in den bestehenden Jarvis Command Center integriert.

Er zeigt die registrierten Core-/Brain-Dateien einschließlich:

- aktiver Quelle (Repository oder Supabase),
- aktiver Version,
- vorhandenem Supabase-Draft,
- Protected-/Core-Status,
- Vergleich zwischen aktivem Inhalt und Draft.

Die erste UI-Stufe ist bewusst read-only. Sie dient der Transparenz und Prüfung, bevor spätere Save-, Approval-, Activate- und Rollback-Aktionen freigegeben werden.

Ein vorhandener Draft ist ausdrücklich **nicht** automatisch aktiv.

## Grundregel

Das Brain Center unterstützt Entscheidungen und Transparenz, führt aber keine kritischen Aktionen ohne Freigabe aus.
