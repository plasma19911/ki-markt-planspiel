param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$server='https://ki-markt-planspiel.orkimperium.workers.dev'
$agent=Join-Path $Root 'pc-agent.ps1'
$module=Join-Path $Root 'pc-first-scanner.ps1'
if(-not(Test-Path $Root)){throw "$Root wurde nicht gefunden. Zuerst INSTALLIEREN.cmd starten."}
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.CommandLine -and $_.CommandLine.IndexOf($agent,[StringComparison]::OrdinalIgnoreCase)-ge 0})
if($running.Count){Write-Host "KI-Markt-Agent läuft bereits (PID $($running[0].ProcessId))." -ForegroundColor Green;return}
# Ab V28.8 aktualisiert sich der gestoppte Agent vor jedem Start aus demselben
# Cloudflare-Projekt. Ein fehlgeschlagenes Update löscht die lokale Version nicht.
try{
  $tmpAgent="$agent.new";$tmpModule="$module.new"
  Invoke-WebRequest -Uri "$server/pc-agent-latest.ps1?v=$(Get-Date -Format yyyyMMddHHmm)" -UseBasicParsing -TimeoutSec 20 -OutFile $tmpAgent
  Invoke-WebRequest -Uri "$server/pc-first-scanner.ps1?v=$(Get-Date -Format yyyyMMddHHmm)" -UseBasicParsing -TimeoutSec 20 -OutFile $tmpModule
  if((Get-Item $tmpAgent).Length -gt 2000 -and (Get-Item $tmpModule).Length -gt 3000){Move-Item $tmpAgent $agent -Force;Move-Item $tmpModule $module -Force;Write-Host 'PC-Agent wurde vor dem Start auf den aktuellen Live-Stand gebracht.' -ForegroundColor Cyan}else{Remove-Item $tmpAgent,$tmpModule -Force -ErrorAction SilentlyContinue}
}catch{Remove-Item "$agent.new","$module.new" -Force -ErrorAction SilentlyContinue;Write-Host "Auto-Update übersprungen: $($_.Exception.Message)" -ForegroundColor Yellow}
if(-not(Test-Path $agent)){throw "$agent wurde nicht gefunden. Zuerst INSTALLIEREN.cmd starten."}
$args="-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agent`""
$p=Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1
Write-Host "KI-Markt-Agent gestartet (PID $($p.Id))." -ForegroundColor Green
