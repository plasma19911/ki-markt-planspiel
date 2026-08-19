param([string]$Root='E:\KI-Markt-Agent')

$ErrorActionPreference='Stop'
$Source=Split-Path -Parent $MyInvocation.MyCommand.Path

if(-not (Test-Path 'E:\')){throw 'Laufwerk E: ist nicht verfuegbar.'}
if(-not (Test-Path (Join-Path $Root 'agent-token.txt'))){throw "Der bestehende KI-Markt-Agent wurde unter $Root nicht gefunden (agent-token.txt fehlt)."}

New-Item -ItemType Directory -Force -Path $Root,(Join-Path $Root 'data'),(Join-Path $Root 'data\cache'),(Join-Path $Root 'data\logs') | Out-Null

$sourceRadar=Join-Path $Source 'fast-wide-radar.ps1'
$target=Join-Path $Root 'fast-wide-radar.ps1'
$radarUrl='https://raw.githubusercontent.com/plasma19911/ki-markt-planspiel/main/pc-agent/fast-wide-radar.ps1'

if(Test-Path $sourceRadar){
  $sourceFull=[IO.Path]::GetFullPath($sourceRadar)
  $targetFull=[IO.Path]::GetFullPath($target)
  if(-not $sourceFull.Equals($targetFull,[StringComparison]::OrdinalIgnoreCase)){
    Copy-Item $sourceRadar $target -Force
  }
}else{
  Write-Host 'Fast-Radar-Datei fehlt lokal - lade aktuelle Version aus GitHub ...' -ForegroundColor Yellow
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri $radarUrl -OutFile $target -TimeoutSec 30
}

if(-not (Test-Path $target)){throw 'fast-wide-radar.ps1 konnte nicht bereitgestellt werden.'}

# Syntax der eigentlichen Radar-Datei vor dem Autostart pruefen.
$tokens=$null
$errors=$null
[System.Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors) | Out-Null
if($errors.Count -gt 0){
  $messages=@($errors | ForEach-Object { $_.Message }) -join ' | '
  throw ('Fast-Radar hat PowerShell-Syntaxfehler: '+$messages)
}

# Nur bereits laufende Fast-Radar-Instanzen beenden. Der Haupt-Agent bleibt unangetastet.
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and $_.CommandLine.IndexOf('fast-wide-radar.ps1',[StringComparison]::OrdinalIgnoreCase) -ge 0
})
foreach($item in $running){
  try{Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue}catch{}
}

# Benutzer-Autostart ohne Administratorrechte.
$runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName='KI-Markt-Fast-Radar'
$runCmd='powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$target+'"'
New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -Path $runKey -Name $runName -PropertyType String -Value $runCmd -Force | Out-Null

# PowerShell 5.1-sichere Argumentliste. E:\KI-Markt-Agent enthaelt keine Leerzeichen.
$startArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$target)
$proc=Start-Process -FilePath 'powershell.exe' -ArgumentList $startArgs -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 3
if($proc.HasExited){
  $logPath=Join-Path $Root 'data\logs\fast-wide-radar.log'
  if(Test-Path $logPath){
    $tail=(Get-Content $logPath -Tail 8 -ErrorAction SilentlyContinue) -join ' | '
    throw ('Fast-Radar wurde nach dem Start beendet. Letzte Logzeilen: '+$tail)
  }
  throw 'Fast-Radar wurde direkt nach dem Start beendet.'
}

Write-Host ''
Write-Host 'FAST-RADAR IST AKTIV' -ForegroundColor Green
Write-Host ('PID: '+$proc.Id)
Write-Host 'Haupt-Agent: bleibt unveraendert aktiv' -ForegroundColor Green
Write-Host 'Windowsstart: automatisch nach der Anmeldung' -ForegroundColor Green
Write-Host 'Profil: bis zu 28 Kurs-Batches/Minute, 6 parallel; automatische Drosselung bei Quellenfehlern.'
Write-Host ('Log: '+(Join-Path $Root 'data\logs\fast-wide-radar.log'))
