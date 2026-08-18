$ErrorActionPreference='Stop'
$Root='E:\KI-Markt-Agent'
$TokenPath=Join-Path $Root 'agent-token.txt'
$Starter=Join-Path $Root 'start-agent.ps1'
$Server='https://ki-markt-planspiel.orkimperium.workers.dev'
if(-not(Test-Path $TokenPath)){throw 'E:\KI-Markt-Agent\agent-token.txt fehlt. Zuerst INSTALLIEREN.cmd starten.'}
$token=(Get-Content $TokenPath -Raw).Trim()
if(-not $token){throw 'Agent-Token ist leer.'}
Set-Clipboard -Value $token
Write-Host ''
Write-Host 'Der PC_AGENT_TOKEN wurde in die Windows-Zwischenablage kopiert.' -ForegroundColor Green
Write-Host 'Node.js / npx / Wrangler werden NICHT benötigt.' -ForegroundColor Green
Write-Host ''
Write-Host 'Im jetzt geöffneten Cloudflare-Dashboard:' -ForegroundColor Cyan
Write-Host '1. Workers & Pages öffnen.'
Write-Host '2. Worker "ki-markt-planspiel" öffnen.'
Write-Host '3. Settings / Einstellungen -> Variables and Secrets / Variablen und Secrets.'
Write-Host '4. Neue SECRET-Variable anlegen:'
Write-Host '   Name:  PC_AGENT_TOKEN' -ForegroundColor Yellow
Write-Host '   Wert:  STRG+V  (der Wert ist bereits kopiert)' -ForegroundColor Yellow
Write-Host '5. Speichern bzw. Deploy/Save and deploy.'
Write-Host ''
try{Start-Process 'https://dash.cloudflare.com/'}catch{}
Read-Host 'Wenn du das Secret gespeichert hast, hier ENTER drücken'
Write-Host 'Prüfe Cloudflare ...'
$ok=$false
for($i=0;$i -lt 12;$i++){
  try{
    $s=Invoke-RestMethod ($Server+'/api/agent/status') -TimeoutSec 15
    if($s.configured){$ok=$true;break}
  }catch{}
  Start-Sleep -Seconds 5
}
if($ok){
  Write-Host 'Cloudflare hat PC_AGENT_TOKEN erkannt.' -ForegroundColor Green
  if(Test-Path $Starter){& $Starter -Root $Root}
  Start-Sleep -Seconds 3
  try{
    $s=Invoke-RestMethod ($Server+'/api/agent/status') -TimeoutSec 15
    $s|ConvertTo-Json -Depth 6
  }catch{}
  Write-Host ''
  Write-Host 'Einrichtung abgeschlossen.' -ForegroundColor Green
}else{
  Write-Host ''
  Write-Host 'Cloudflare meldet das Secret noch nicht als aktiv.' -ForegroundColor Yellow
  Write-Host 'Prüfe, ob es wirklich als Secret mit dem Namen PC_AGENT_TOKEN gespeichert und deployed wurde.'
  Write-Host 'Danach diese Datei einfach erneut starten; der Schlüssel bleibt gleich.'
}
