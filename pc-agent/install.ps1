param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$Source=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path 'E:\')){throw 'Laufwerk E: ist nicht verfügbar.'}
New-Item -ItemType Directory -Force -Path $Root,(Join-Path $Root 'data'),(Join-Path $Root 'data\cache'),(Join-Path $Root 'data\logs')|Out-Null
$agentSource=Join-Path $Source 'pc-agent-v288.ps1'
if(-not(Test-Path $agentSource)){$agentSource=Join-Path $Source 'pc-agent.ps1'}
Copy-Item $agentSource (Join-Path $Root 'pc-agent.ps1') -Force
Copy-Item (Join-Path $Source 'pc-first-scanner.ps1') (Join-Path $Root 'pc-first-scanner.ps1') -Force
Copy-Item (Join-Path $Source 'start-agent.ps1') (Join-Path $Root 'start-agent.ps1') -Force
$configPath=Join-Path $Root 'config.json'
if(-not(Test-Path $configPath)){
  $config=[ordered]@{serverUrl='https://ki-markt-planspiel.orkimperium.workers.dev';maxStorageGb=2.0;trimToGb=1.6;keepDays=30;pcFirstShardCount=4}
  $config|ConvertTo-Json|Set-Content $configPath -Encoding UTF8
}else{
  try{$config=Get-Content $configPath -Raw|ConvertFrom-Json;if($null-eq $config.pcFirstShardCount){$config|Add-Member -NotePropertyName pcFirstShardCount -NotePropertyValue 4};$config|ConvertTo-Json|Set-Content $configPath -Encoding UTF8}catch{}
}
$tokenPath=Join-Path $Root 'agent-token.txt'
if(-not(Test-Path $tokenPath)){$bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes);$token=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_');Set-Content $tokenPath $token -Encoding ASCII -NoNewline}
$runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run';$runName='KI-Markt-Agent';$runCmd="powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Root\pc-agent.ps1`"";New-Item -Path $runKey -Force|Out-Null;New-ItemProperty -Path $runKey -Name $runName -PropertyType String -Value $runCmd -Force|Out-Null
try{& schtasks.exe /Delete /TN 'KI-Markt-Agent' /F 2>$null|Out-Null}catch{}
Write-Host '';Write-Host 'KI-Markt-Agent V28.8 PC-FIRST wurde installiert.' -ForegroundColor Green;Write-Host "Ordner: $Root";Write-Host 'Scanner: kompletter Aktien-Master rollierend -> Top 400 -> Deep 120 -> Final 60.' -ForegroundColor Green;Write-Host 'Standard: kompletter Master-Zyklus ca. 4 Minuten; Finalisten jede Minute.';Write-Host 'Cloudflare bleibt Finalvalidierung/Fallback statt Voll-Master-Scanner.';Write-Host ''
try{& (Join-Path $Root 'start-agent.ps1') -Root $Root}catch{Write-Host "Agent konnte noch nicht gestartet werden: $($_.Exception.Message)" -ForegroundColor Yellow}
Write-Host '';Write-Host 'Falls der Cloudflare-Schlüssel noch nicht gesetzt ist: CLOUDFLARE-SECRET-EINRICHTEN.cmd starten.' -ForegroundColor Yellow
