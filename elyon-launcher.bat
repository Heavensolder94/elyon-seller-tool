@echo off
setlocal
title Elyon Launcher
color 0A

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [FEHLER] Node.js wurde nicht gefunden.
  echo Bitte Node.js installieren und danach den Launcher erneut starten.
  echo.
  pause
  exit /b 1
)

node scripts/elyon-launcher.mjs

echo.
echo Launcher beendet.
pause
