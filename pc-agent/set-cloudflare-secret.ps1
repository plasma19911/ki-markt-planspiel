$ErrorActionPreference='Stop'
$Root='E:\KI-Markt-Agent';$TokenPath=Join-Path $Root 'agent-token.txt'
$RepoRoot=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if(-not(Test-Path $TokenPath)){throw 'E:\KI-Markt-Agent\agent-token.txt fehlt. Zuerst INSTALLIEREN.cmd starten.'}
$npx=Get-Command npx.cmd -ErrorAction SilentlyContinue
if(-not $npx){throw 'Node.js/npx wurde nicht gefunden. Installiere Node.js oder setze PC_AGENT_TOKEN im Cloudflare-Dashboard manuell mit dem Inhalt von E:\KI-Markt-Agent\agent-token.txt.'}
$token=(Get-Content $TokenPath -Raw).Trim();if(-not $token){throw 'Agent-Token ist leer.'}
Push-Location $RepoRoot
try{
  Write-Host 'Cloudflare kann beim ersten Mal einen Browser-Login öffnen.' -ForegroundColor Yellow
  $token | & npx.cmd wrangler secret put PC_AGENT_TOKEN
  if($LASTEXITCODE-ne 0){throw "Wrangler Secret fehlgeschlagen (Exit $LASTEXITCODE)."}
  Write-Host 'PC_AGENT_TOKEN ist in Cloudflare gesetzt.' -ForegroundColor Green
  & schtasks.exe /Run /TN 'KI-Markt-Agent' | Out-Null
  Start-Sleep -Seconds 3
  try{Invoke-RestMethod 'https://ki-markt-planspiel.orkimperium.workers.dev/api/agent/status' -TimeoutSec 15 | ConvertTo-Json -Depth 5}catch{Write-Host 'Statusprüfung noch nicht möglich; nach dem Deploy erneut STATUS.cmd starten.' -ForegroundColor Yellow}
}finally{Pop-Location}
