param([string]$Root='E:\KI-Markt-Agent',[switch]$Update)
$ErrorActionPreference='Stop'
$server='https://ki-markt-planspiel.orkimperium.workers.dev'
$agent=Join-Path $Root 'pc-agent.ps1'
$module=Join-Path $Root 'pc-first-scanner.ps1'
if(-not(Test-Path $Root)){throw "$Root wurde nicht gefunden. Zuerst INSTALLIEREN.cmd starten."}
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.CommandLine -and $_.CommandLine.IndexOf($agent,[StringComparison]::OrdinalIgnoreCase)-ge 0})
if($running.Count){Write-Host "KI-Markt-Agent laeuft bereits (PID $($running[0].ProcessId))." -ForegroundColor Green;return}
# V31.7.32: Auch den alten C#-Agenten erkennen. Laufen beide, ueberschreiben
# sie sich gegenseitig auf dem Server (scanFresh flappt).
$csharp=@(Get-Process -Name 'Agent' -ErrorAction SilentlyContinue)
if($csharp.Count){Write-Host "Achtung: Agent.exe laeuft noch (PID $($csharp[0].Id)). Bitte zuerst beenden und dessen Autostart entfernen, sonst posten zwei Agenten gleichzeitig." -ForegroundColor Yellow}
# Ab V28.8 aktualisiert sich der gestoppte Agent vor jedem Start aus demselben
# Cloudflare-Projekt. Ein fehlgeschlagenes Update löscht die lokale Version nicht.
if($Update){
  # Auto-Update laeuft NUR mit -Update. Standard ist aus, damit lokal gepruefte
  # Dateien nicht durch einen aelteren Worker-Stand ueberschrieben werden.
  try{
    $tmpAgent="$agent.new";$tmpModule="$module.new"
    Invoke-WebRequest -Uri "$server/pc-agent-latest.ps1?v=$(Get-Date -Format yyyyMMddHHmm)" -UseBasicParsing -TimeoutSec 20 -OutFile $tmpAgent
    Invoke-WebRequest -Uri "$server/pc-first-scanner.ps1?v=$(Get-Date -Format yyyyMMddHHmm)" -UseBasicParsing -TimeoutSec 20 -OutFile $tmpModule
    if((Get-Item $tmpAgent).Length -gt 2000 -and (Get-Item $tmpModule).Length -gt 3000){Move-Item $tmpAgent $agent -Force;Move-Item $tmpModule $module -Force;Write-Host 'PC-Agent wurde vor dem Start auf den aktuellen Live-Stand gebracht.' -ForegroundColor Cyan}else{Remove-Item $tmpAgent,$tmpModule -Force -ErrorAction SilentlyContinue}
  }catch{Remove-Item "$agent.new","$module.new" -Force -ErrorAction SilentlyContinue;Write-Host "Auto-Update uebersprungen: $($_.Exception.Message)" -ForegroundColor Yellow}
}else{Write-Host 'Auto-Update uebersprungen (Standard). Fuer den Live-Stand: start-agent.ps1 -Update' -ForegroundColor DarkGray}
if(-not(Test-Path $agent)){throw "$agent wurde nicht gefunden. Zuerst INSTALLIEREN.cmd starten."}
$psArgs="-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agent`""
$p=Start-Process powershell.exe -ArgumentList $psArgs -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1
Write-Host "KI-Markt-Agent gestartet (PID $($p.Id))." -ForegroundColor Green
