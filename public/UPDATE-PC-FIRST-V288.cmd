@echo off
setlocal
set "ROOT=E:\KI-Markt-Agent"
set "BASE=https://ki-markt-planspiel.orkimperium.workers.dev"
if not exist "%ROOT%" (
  echo FEHLER: %ROOT% wurde nicht gefunden. Bitte zuerst den PC-Agent installieren.
  pause
  exit /b 2
)
echo Stoppe alten KI-Markt-Agent ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p='%ROOT%\pc-agent.ps1'; Get-CimInstance Win32_Process ^| Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($p,[StringComparison]::OrdinalIgnoreCase) -ge 0 } ^| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Lade V28.8 PC-FIRST ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; iwr '%BASE%/pc-agent-latest.ps1?u='+(Get-Date -Format yyyyMMddHHmmss) -UseBasicParsing -OutFile '%ROOT%\pc-agent.ps1'; iwr '%BASE%/pc-first-scanner.ps1?u='+(Get-Date -Format yyyyMMddHHmmss) -UseBasicParsing -OutFile '%ROOT%\pc-first-scanner.ps1'; iwr '%BASE%/start-agent-latest.ps1?u='+(Get-Date -Format yyyyMMddHHmmss) -UseBasicParsing -OutFile '%ROOT%\start-agent.ps1'"
if errorlevel 1 (
  echo FEHLER beim Herunterladen. Alte Konfiguration und Token wurden nicht geloescht.
  pause
  exit /b 3
)
echo Starte V28.8 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\start-agent.ps1" -Root "%ROOT%"
echo.
echo Fertig. Ab jetzt aktualisiert sich der Agent bei jedem Neustart selbst.
pause
