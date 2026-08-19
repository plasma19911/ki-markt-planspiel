@echo off
setlocal EnableExtensions
set "ROOT=E:\KI-Markt-Agent"
set "TMP=%TEMP%\KI-Markt-Fast-Radar-Setup"
set "BASE=https://raw.githubusercontent.com/plasma19911/ki-markt-planspiel/main/pc-agent"
set "CACHE=%RANDOM%%RANDOM%%RANDOM%"

echo.
echo =============================================
echo   KI-MARKT FAST-RADAR WIRD AKTIVIERT
echo =============================================
echo.

if not exist "E:\" (
  echo FEHLER: Laufwerk E: ist nicht verfuegbar.
  goto :fail
)
if not exist "%ROOT%\agent-token.txt" (
  echo FEHLER: Der bestehende KI-Markt-Agent wurde unter
  echo        %ROOT%
  echo        nicht gefunden. agent-token.txt fehlt.
  goto :fail
)

if exist "%TMP%" rmdir /s /q "%TMP%" >nul 2>nul
mkdir "%TMP%" >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Temporaerer Setup-Ordner konnte nicht erstellt werden.
  goto :fail
)

echo Lade die aktuelle Fast-Radar-Version direkt aus GitHub ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%BASE%/install-fast-radar.ps1?c=%CACHE%' -OutFile '%TMP%\install-fast-radar.ps1' -TimeoutSec 30; Invoke-WebRequest -UseBasicParsing -Uri '%BASE%/fast-wide-radar.ps1?c=%CACHE%' -OutFile '%TMP%\fast-wide-radar.ps1' -TimeoutSec 30"
if errorlevel 1 (
  echo.
  echo FEHLER: Die Fast-Radar-Dateien konnten nicht aus GitHub geladen werden.
  echo Pruefe Internetverbindung oder GitHub-Zugriff.
  goto :fail
)

echo Installiere und starte Fast-Radar ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TMP%\install-fast-radar.ps1" -Root "%ROOT%"
set "ERR=%ERRORLEVEL%"

rmdir /s /q "%TMP%" >nul 2>nul

echo.
if not "%ERR%"=="0" (
  echo FEHLER: Fast-Radar konnte nicht aktiviert werden.
  echo Falls oben eine konkrete Fehlermeldung steht, sende sie mir genau so.
  goto :failcode
)

echo =============================================
echo   FAST-RADAR IST AKTIV
echo =============================================
echo Haupt-Agent: bleibt unveraendert aktiv
echo Fast-Radar:  laeuft jetzt parallel
echo Windowsstart: automatisch nach Anmeldung
echo Log: %ROOT%\data\logs\fast-wide-radar.log
echo.
pause
exit /b 0

:fail
set "ERR=1"
:failcode
echo.
pause
exit /b %ERR%
