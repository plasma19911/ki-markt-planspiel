param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$Source=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path 'E:\')){throw 'Laufwerk E: ist nicht verfügbar.'}
New-Item -ItemType Directory -Force -Path $Root,(Join-Path $Root 'data'),(Join-Path $Root 'data\cache'),(Join-Path $Root 'data\logs')|Out-Null
Copy-Item (Join-Path $Source 'pc-agent.ps1') (Join-Path $Root 'pc-agent.ps1') -Force
Copy-Item (Join-Path $Source 'start-agent.ps1') (Join-Path $Root 'start-agent.ps1') -Force
$configPath=Join-Path $Root 'config.json'
if(-not(Test-Path $configPath)){
  $config=[ordered]@{serverUrl='https://ki-markt-planspiel.orkimperium.workers.dev';maxStorageGb=2.0;trimToGb=1.6;keepDays=30;leaderMinutes=5;futureMinutes=10}
  $config|ConvertTo-Json|Set-Content $configPath -Encoding UTF8
}
$tokenPath=Join-Path $Root 'agent-token.txt'
if(-not(Test-Path $tokenPath)){
  $bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  Set-Content $tokenPath $token -Encoding ASCII -NoNewline
}
# Benutzer-Autostart statt Taskplaner: keine Administratorrechte erforderlich.
$runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName='KI-Markt-Agent'
$runCmd="powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Root\pc-agent.ps1`""
New-Item -Path $runKey -Force|Out-Null
New-ItemProperty -Path $runKey -Name $runName -PropertyType String -Value $runCmd -Force|Out-Null
# Einen eventuell unvollständig angelegten alten Task still entfernen.
try{& schtasks.exe /Delete /TN 'KI-Markt-Agent' /F 2>$null|Out-Null}catch{}
Write-Host ''
Write-Host 'KI-Markt-Agent wurde installiert.' -ForegroundColor Green
Write-Host "Ordner: $Root"
Write-Host 'Speicherlimit: 2,0 GB -> automatische Bereinigung auf ca. 1,6 GB.'
Write-Host 'Autostart: Windows-Benutzerautostart, KEINE Administratorrechte nötig.' -ForegroundColor Green
Write-Host ''
try{& (Join-Path $Root 'start-agent.ps1') -Root $Root}catch{Write-Host "Agent konnte noch nicht gestartet werden: $($_.Exception.Message)" -ForegroundColor Yellow}
Write-Host ''
Write-Host 'WICHTIG: Als naechstes CLOUDFLARE-SECRET-EINRICHTEN.cmd aus diesem Ordner starten.' -ForegroundColor Yellow
Write-Host 'Node.js ist dafür NICHT erforderlich.'
