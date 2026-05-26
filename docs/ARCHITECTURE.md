# System Architecture

## Zweck

Diese Datei beschreibt den technischen Aufbau des Elyon Seller Tools.

## Hauptbereiche

- Frontend
- API-Routen
- KI-Funktionen
- Supplier-Anbindungen
- Speicher- und Sync-Systeme

## Grober Datenfluss

```txt
Browser UI
-> API Layer
-> KI oder Supplier Layer
-> Storage Layer
```

## Wichtige Regeln

- Bestehende Funktionen erhalten.
- Neue Funktionen modular ergänzen.
- Sicherheitslogik respektieren.
- localStorage-Struktur nicht unkontrolliert ändern.
- API-Anbindungen defensiv behandeln.

## Ziel

Das Projekt soll übersichtlich, wartbar und gut erweiterbar bleiben.
