# Elyon Launcher

Der Elyon Launcher ist das lokale Kontrollzentrum für das Elyon Seller Tool.

## Start per Doppelklick

Unter Windows kannst du im Projektordner diese Datei doppelklicken:

```txt
elyon-launcher.bat
```

Das startet die einfache Launcher-Variante im Terminal.

## Start als Desktop-App

Einmal installieren:

```powershell
npm install
```

Dann starten:

```powershell
npm run launcher
```

## Was der Launcher macht

- prüft, ob das Projekt vorhanden ist
- prüft, ob `.env.local` oder `.env` vorhanden ist
- synchronisiert mit GitHub (`git pull`)
- installiert Pakete (`npm install`)
- startet den lokalen Entwicklungsserver
- öffnet das Elyon Seller Tool im Browser

## Wichtig zu API-Keys

Die Datei `.env.local` darf niemals zu GitHub hochgeladen werden.
Sie bleibt lokal auf deinem PC/Notebook oder in einem Passwortmanager.

Nutze `.env.example` nur als Vorlage.
