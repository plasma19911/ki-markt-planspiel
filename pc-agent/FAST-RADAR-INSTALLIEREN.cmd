@echo off
setlocal EnableExtensions
set "ROOT=E:\KI-Markt-Agent"
set "RADAR=%ROOT%\fast-wide-radar.ps1"
set "NEW=%ROOT%\fast-wide-radar.ps1.new"
set "URL=https://raw.githubusercontent.com/plasma19911/ki-markt-planspiel/main/pc-agent/fast-wide-radar.ps1"
set "CACHE=%RANDOM%%RANDOM%%RANDOM%"

echo.
echo =============================================
echo   KI-MARKT FAST-RADAR TURBO AKTIVIEREN
echo =============================================
echo.

if not exist "E:\" (
  echo FEHLER: Laufwerk E: ist nicht verfuegbar.
  goto :fail
)
if not exist "%ROOT%\agent-token.txt" (
  echo FEHLER: %ROOT%\agent-token.txt fehlt.
  echo Der bestehende KI-Markt-Agent muss zuerst eingerichtet sein.
  goto :fail
)
if not exist "%ROOT%" mkdir "%ROOT%" >nul 2>nul
if not exist "%ROOT%\data\logs" mkdir "%ROOT%\data\logs" >nul 2>nul
if not exist "%ROOT%\data\cache" mkdir "%ROOT%\data\cache" >nul 2>nul

echo Lade aktuellen Fast-Radar direkt aus GitHub ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%URL%?c=%CACHE%' -OutFile '%NEW%' -TimeoutSec 40"
if errorlevel 1 (
  echo FEHLER: Download des Fast-Radars fehlgeschlagen.
  goto :fail
)

echo Pruefe PowerShell-Datei ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('%NEW%',[ref]$tokens,[ref]$errors) | Out-Null; if($errors.Count -gt 0){ $errors | ForEach-Object { Write-Host $_.Message -ForegroundColor Red }; exit 1 }"
if errorlevel 1 (
  del /q "%NEW%" >nul 2>nul
  echo FEHLER: Die geladene Fast-Radar-Datei hat einen Syntaxfehler.
  goto :fail
)

move /y "%NEW%" "%RADAR%" >nul
if errorlevel 1 (
  echo FEHLER: Fast-Radar konnte nicht nach %RADAR% installiert werden.
  goto :fail
)

echo Beende nur einen eventuell alten Fast-Radar ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf('%RADAR%',[StringComparison]::OrdinalIgnoreCase) -ge 0 }); foreach($x in $p){ try { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }"

echo Richte Windows-Autostart ein ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$run='powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%RADAR%"" -NormalBatchesPerMinute 40 -NormalParallelRequests 8 -BatchSize 48'; New-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'KI-Markt-Fast-Radar' -Value $run"
if errorlevel 1 (
  echo FEHLER: Windows-Autostart konnte nicht eingerichtet werden.
  goto :fail
)

echo Starte Turbo-Radar: 40 Batches/Minute, 8 parallel ...
start "KI-Markt Fast-Radar" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%RADAR%" -NormalBatchesPerMinute 40 -NormalParallelRequests 8 -BatchSize 48

timeout /t 3 /nobreak >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf('%RADAR%',[StringComparison]::OrdinalIgnoreCase) -ge 0 }); if($p.Count -lt 1){ exit 1 } else { Write-Host ('Fast-Radar laeuft. PID: ' + (($p.ProcessId) -join ', ')) -ForegroundColor Green }"
if errorlevel 1 (
  echo FEHLER: Fast-Radar ist nach dem Start nicht aktiv.
  echo Log pruefen: %ROOT%\data\logs\fast-wide-radar.log
  goto :fail
)

echo.
echo =============================================
echo   FAST-RADAR TURBO IST AKTIV
echo =============================================
echo Ziel: Volluniversum ungefaehr 4-6 Minuten
echo Normal: 40 Batches/Minute, 8 parallel, 48 Aktien/Batch
echo Bei Yahoo-Drosselung reduziert sich der Radar automatisch.
echo Haupt-C#-Agent bleibt parallel aktiv.
echo Windowsstart: automatisch nach Anmeldung.
echo Log: %ROOT%\data\logs\fast-wide-radar.log
echo.
pause
exit /b 0

:fail
echo.
echo Fast-Radar Turbo wurde NICHT aktiviert.
echo Sende mir die Meldung oberhalb dieser Zeile.
echo.
pause
exit /b 1
