param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$Source=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path 'E:\')){throw 'Laufwerk E: ist nicht verfügbar.'}
if(-not(Test-Path (Join-Path $Root 'agent-token.txt'))){throw "Der bestehende KI-Markt-Agent wurde unter $Root nicht gefunden (agent-token.txt fehlt)."}
New-Item -ItemType Directory -Force -Path $Root,(Join-Path $Root 'data'),(Join-Path $Root 'data\cache'),(Join-Path $Root 'data\logs')|Out-Null

$sourceRadar=Join-Path $Source 'fast-wide-radar.ps1'
$target=Join-Path $Root 'fast-wide-radar.ps1'
$radarUrl='https://raw.githubusercontent.com/plasma19911/ki-markt-planspiel/main/pc-agent/fast-wide-radar.ps1'

# Der Installer funktioniert auch dann, wenn nur install-fast-radar.ps1 vorhanden ist.
# Fehlt die Radar-Datei daneben, wird die aktuelle Version direkt aus GitHub geladen.
if(-not(Test-Path $sourceRadar)){
  Write-Host 'Fast-Radar-Datei fehlt lokal - lade aktuelle Version aus GitHub ...' -ForegroundColor Yellow
  Invoke-WebRequest -UseBasicParsing -Uri $radarUrl -OutFile $target -TimeoutSec 30
}else{
  $sourceFull=[IO.Path]::GetFullPath($sourceRadar)
  $targetFull=[IO.Path]::GetFullPath($target)
  if(-not $sourceFull.Equals($targetFull,[StringComparison]::OrdinalIgnoreCase)){Copy-Item $sourceRadar $target -Force}
}
if(-not(Test-Path $target)){throw 'fast-wide-radar.ps1 konnte nicht bereitgestellt werden.'}

# Syntax vor dem Start pruefen, damit kein defekter Autostart eingetragen wird.
$tokens=$null;$errors=$null
[System.Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors)|Out-Null
if($errors.Count -gt 0){throw ('Fast-Radar hat PowerShell-Syntaxfehler: '+(($errors|ForEach-Object{$_.Message}) -join ' | '))}

# Nur den separaten Fast-Radar neu starten. Der vorhandene C#-/Haupt-Agent wird nicht beendet oder ersetzt.
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.CommandLine -and $_.CommandLine.IndexOf($target,[StringComparison]::OrdinalIgnoreCase)-ge0})
foreach($proc in $running){try{Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue}catch{}}

$runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName='KI-Markt-Fast-Radar'
$runCmd="powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`""
New-Item -Path $runKey -Force|Out-Null
New-ItemProperty -Path $runKey -Name $runName -PropertyType String -Value $runCmd -Force|Out-Null
$proc=Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`""" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
if($proc.HasExited){throw 'Fast-Radar ist direkt nach dem Start beendet worden. Prüfe data\logs\fast-wide-radar.log.'}

# Kleine Statusdatei direkt im Agent-Ordner erzeugen, damit nach spaeteren Updates nichts daneben liegen muss.
$statusCmd=Join-Path $Root 'FAST-RADAR-STATUS.cmd'
@'
@echo off
setlocal
set ROOT=E:\KI-Markt-Agent
echo.
echo =============================================
echo   KI-MARKT FAST-RADAR STATUS
echo =============================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue ^| Where-Object { $_.CommandLine -like '*fast-wide-radar.ps1*' }); if($p.Count){Write-Host ('FAST-RADAR LAEUFT - PID ' + (($p.ProcessId -join ', '))) -ForegroundColor Green}else{Write-Host 'FAST-RADAR LAEUFT NICHT' -ForegroundColor Red}; $log='E:\KI-Markt-Agent\data\logs\fast-wide-radar.log'; if(Test-Path $log){Write-Host ''; Write-Host 'Letzte Meldungen:'; Get-Content $log -Tail 12}"
echo.
pause
'@ | Set-Content $statusCmd -Encoding ASCII

Write-Host ''
Write-Host 'Fast-Radar wurde aktiviert.' -ForegroundColor Green
Write-Host "PID: $($proc.Id)"
Write-Host 'Der vorhandene C#-Agent läuft unverändert weiter.' -ForegroundColor Green
Write-Host 'Autostart: aktiviert für die Windows-Anmeldung.' -ForegroundColor Green
Write-Host 'Profil: bis zu 28 Kurs-Batches/Minute, 6 parallel; automatische Drosselung bei Yahoo-Fehlern.'
Write-Host "Log: $Root\data\logs\fast-wide-radar.log"
Write-Host "Status: $Root\FAST-RADAR-STATUS.cmd"
