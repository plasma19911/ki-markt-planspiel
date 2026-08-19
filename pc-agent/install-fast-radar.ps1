param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$Source=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path 'E:\')){throw 'Laufwerk E: ist nicht verfügbar.'}
$sourceRadar=Join-Path $Source 'fast-wide-radar.ps1'
if(-not(Test-Path $sourceRadar)){throw "fast-wide-radar.ps1 fehlt neben diesem Installer."}
if(-not(Test-Path (Join-Path $Root 'agent-token.txt'))){throw "Der bestehende KI-Markt-Agent wurde unter $Root nicht gefunden (agent-token.txt fehlt)."}
New-Item -ItemType Directory -Force -Path $Root,(Join-Path $Root 'data'),(Join-Path $Root 'data\cache'),(Join-Path $Root 'data\logs')|Out-Null
$target=Join-Path $Root 'fast-wide-radar.ps1'
Copy-Item $sourceRadar $target -Force

# Nur den separaten Fast-Radar neu starten. Der vorhandene C#-/Haupt-Agent wird nicht beendet oder ersetzt.
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.CommandLine -and $_.CommandLine.IndexOf($target,[StringComparison]::OrdinalIgnoreCase)-ge0})
foreach($p in $running){try{Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue}catch{}}

$runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName='KI-Markt-Fast-Radar'
$runCmd="powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`""
New-Item -Path $runKey -Force|Out-Null
New-ItemProperty -Path $runKey -Name $runName -PropertyType String -Value $runCmd -Force|Out-Null
$p=Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$target`""" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1
if($p.HasExited){throw 'Fast-Radar ist direkt nach dem Start beendet worden. Prüfe data\logs\fast-wide-radar.log.'}
Write-Host ''
Write-Host 'Fast-Radar wurde aktiviert.' -ForegroundColor Green
Write-Host "PID: $($p.Id)"
Write-Host 'Der vorhandene C#-Agent läuft unverändert weiter.' -ForegroundColor Green
Write-Host 'Profil: bis zu 28 Kurs-Batches/Minute, 6 parallel; automatische Drosselung bei Yahoo-Fehlern.'
Write-Host "Log: $Root\data\logs\fast-wide-radar.log"
