@echo off
chcp 65001 >nul
title KI-Markt-Agent Status
echo === Windows-Autostart ===
powershell.exe -NoProfile -Command "$v=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'KI-Markt-Agent' -ErrorAction SilentlyContinue).'KI-Markt-Agent'; if($v){Write-Host ('OK: '+$v) -ForegroundColor Green}else{Write-Host 'FEHLT - INSTALLIEREN.cmd erneut starten' -ForegroundColor Yellow}"
echo.
echo === Laufender Agent ===
powershell.exe -NoProfile -Command "$p=@(Get-CimInstance Win32_Process ^| Where-Object { $_.CommandLine -and $_.CommandLine -like '*E:\KI-Markt-Agent\pc-agent.ps1*' }); if($p.Count){$p ^| Select-Object ProcessId,Name,CommandLine ^| Format-List}else{Write-Host 'Agent derzeit nicht als Prozess gefunden.' -ForegroundColor Yellow}"
echo.
echo === Cloudflare-Agentstatus ===
powershell.exe -NoProfile -Command "try { Invoke-RestMethod 'https://ki-markt-planspiel.orkimperium.workers.dev/api/agent/status' -TimeoutSec 15 ^| ConvertTo-Json -Depth 6 } catch { Write-Host $_.Exception.Message -ForegroundColor Red }"
echo.
pause
