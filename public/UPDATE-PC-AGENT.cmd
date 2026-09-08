@echo off
setlocal
set "ROOT=E:\KI-Markt-Agent"
set "BASE=https://ki-markt-planspiel.orkimperium.workers.dev"
if not exist "%ROOT%" (
  echo FEHLER: %ROOT% wurde nicht gefunden. Bitte zuerst den PC-Agent installieren.
  pause
  exit /b 2
)
echo Stoppe alte KI-Markt-Agent-Prozesse ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p='%ROOT%\pc-agent.ps1'; Get-CimInstance Win32_Process ^| Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($p,[StringComparison]::OrdinalIgnoreCase) -ge 0 } ^| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Lade den aktuellen PC-Agent V31.7.34 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; iwr '%BASE%/pc-agent-latest.ps1?u='+(Get-Date -Format yyyyMMddHHmmss) -UseBasicParsing -OutFile '%ROOT%\pc-agent.ps1'; iwr '%BASE%/pc-first-scanner.ps1?u='+(Get-Date -Format yyyyMMddHHmmss) -UseBasicParsing -OutFile '%ROOT%\pc-first-scanner.ps1'; iwr '%BASE%/start-agent-latest.ps1?u='+(Get-Date -Format yyyyMMddHHmmss) -UseBasicParsing -OutFile '%ROOT%\start-agent.ps1'"
if errorlevel 1 (
  echo FEHLER beim Herunterladen. Konfiguration und Token wurden nicht geloescht.
  pause
  exit /b 3
)
echo Starte den aktuellen Agent ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\start-agent.ps1" -Root "%ROOT%"
echo.
echo Fertig. Der Agent prueft jetzt auch die Antwort des Handelsscans.
pause
