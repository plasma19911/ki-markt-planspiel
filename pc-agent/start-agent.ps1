param([string]$Root='E:\KI-Markt-Agent')
$ErrorActionPreference='Stop'
$agent=Join-Path $Root 'pc-agent.ps1'
if(-not(Test-Path $agent)){throw "$agent wurde nicht gefunden. Zuerst INSTALLIEREN.cmd starten."}
$running=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.CommandLine -and $_.CommandLine.IndexOf($agent,[StringComparison]::OrdinalIgnoreCase)-ge 0})
if($running.Count){Write-Host "KI-Markt-Agent läuft bereits (PID $($running[0].ProcessId))." -ForegroundColor Green;return}
$args="-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$agent`""
$p=Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1
Write-Host "KI-Markt-Agent gestartet (PID $($p.Id))." -ForegroundColor Green
