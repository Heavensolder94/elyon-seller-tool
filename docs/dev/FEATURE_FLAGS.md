# Feature Flags

## Zweck

Diese Datei dokumentiert bekannte Sicherheits- und Feature-Flags des Elyon Seller Tools.

## Bekannte Flags

### securityMode

Wenn aktiv:

- keine autonomen Live-Aktionen
- Fokus auf Sicherheit und Vorschau
- kritische Aktionen blockieren

### sandboxMode

Wenn aktiv:

- Aktionen simulieren
- keine echten Bestellungen
- keine echten Veröffentlichungen

### advancedMode

Wenn deaktiviert:

- erweiterte Automatisierungen gesperrt halten
- experimentelle Funktionen blockieren

### autonomyLocked

Wenn aktiv:

- Vollautomatik deaktiviert
- autonome Aktionen blockiert
- Sicherheitsfreigabe notwendig

### pauseAllAgents

Wenn aktiv:

- alle Agenten pausieren
- UI-Status entsprechend anzeigen

## Regeln

- Neue Flags dokumentieren.
- Bestehende Sicherheitsflags nicht ungeprüft ändern.
- Sandbox und Sicherheitslogik respektieren.
