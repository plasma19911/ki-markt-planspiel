@echo off
chcp 65001 >nul
title KI-Markt-Agent Status
echo === Windows-Aufgabe ===
schtasks /Query /TN "KI-Markt-Agent" /FO LIST /V
echo.
echo === Cloudflare-Agentstatus ===
powershell.exe -NoProfile -Command "try { Invoke-RestMethod 'https://ki-markt-planspiel.orkimperium.workers.dev/api/agent/status' -TimeoutSec 15 ^| ConvertTo-Json -Depth 6 } catch { Write-Host $_.Exception.Message -ForegroundColor Red }"
echo.
pause
