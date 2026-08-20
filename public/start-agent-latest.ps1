param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$server='https://ki-markt-planspiel.orkimperium.workers.dev'
$agent=Join-Path $Root 'pc-agent.ps1';$module=Join-Path $Root 'pc-first-scanner.ps1'
if(-not(Test-Path $Root)){throw "$Root wurde nicht gefunden. Zuerst INSTALLIEREN.cmd starten."}
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.CommandLine -and $_.CommandLine.IndexOf($agent,[StringComparison]::OrdinalIgnoreCase)-ge 0})
if($running.Count){Write-Host "KI-Markt-Agent läuft bereits (PID $($running[0].ProcessId))." -ForegroundColor Green;return}
try{$tmpAgent="$agent.new";$tmpModule="$module.new";Invoke-WebRequest -Uri "$server/pc-agent-latest.ps1?v=$(Get-Date -Format yyyyMMddHHmm)" -UseBasicParsing -TimeoutSec 20 -OutFile $tmpAgent;Invoke-WebRequest -Uri "$server/pc-first-scanner.ps1?v=$(Get-Date -Format yyyyMMddHHmm)" -UseBasicParsing -TimeoutSec 20 -OutFile $tmpModule;if((Get-Item $tmpAgent).Length-gt 2000 -and (Get-Item $tmpModule).Length-gt 3000){Move-Item $tmpAgent $agent -Force;Move-Item $tmpModule $module -Force}}catch{Remove-Item "$agent.new","$module.new" -Force -ErrorAction SilentlyContinue}
if(-not(Test-Path $agent)){throw "$agent wurde nicht gefunden."}
$args="-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agent`"";$p=Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru;Start-Sleep -Seconds 1;Write-Host "KI-Markt-Agent gestartet (PID $($p.Id))." -ForegroundColor Green
