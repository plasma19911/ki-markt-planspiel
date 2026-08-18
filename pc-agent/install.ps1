param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$Source=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path 'E:\')){throw 'Laufwerk E: ist nicht verfügbar.'}
New-Item -ItemType Directory -Force -Path $Root,(Join-Path $Root 'data'),(Join-Path $Root 'data\cache'),(Join-Path $Root 'data\logs')|Out-Null
Copy-Item (Join-Path $Source 'pc-agent.ps1') (Join-Path $Root 'pc-agent.ps1') -Force
$config=[ordered]@{serverUrl='https://ki-markt-planspiel.orkimperium.workers.dev';maxStorageGb=2.0;trimToGb=1.6;keepDays=30;leaderMinutes=5;futureMinutes=10}
$config|ConvertTo-Json|Set-Content (Join-Path $Root 'config.json') -Encoding UTF8
$tokenPath=Join-Path $Root 'agent-token.txt'
if(-not(Test-Path $tokenPath)){
  $bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  Set-Content $tokenPath $token -Encoding ASCII -NoNewline
}
$task='KI-Markt-Agent'
$cmd="powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Root\pc-agent.ps1`""
& schtasks.exe /Create /TN $task /SC ONLOGON /TR $cmd /F | Out-Null
Write-Host ''
Write-Host 'KI-Markt-Agent wurde installiert.' -ForegroundColor Green
Write-Host "Ordner: $Root"
Write-Host 'Speicherlimit: 2,0 GB -> automatische Bereinigung auf ca. 1,6 GB.'
Write-Host 'Autostart: bei Windows-Anmeldung, ohne sichtbares Konsolenfenster.'
Write-Host ''
Write-Host 'WICHTIG: Als naechstes CLOUDFLARE-SECRET-EINRICHTEN.cmd aus dem GitHub-Ordner starten.' -ForegroundColor Yellow
Write-Host 'Danach startet der Agent automatisch. Du kannst ihn jetzt schon mit STARTEN.cmd starten; bis das Secret gesetzt ist, bleibt Cloudflare im Fallback.'
