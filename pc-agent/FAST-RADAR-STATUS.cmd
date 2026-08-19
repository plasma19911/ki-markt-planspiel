@echo off
setlocal
set ROOT=E:\KI-Markt-Agent
echo.
echo =============================================
echo   KI-MARKT FAST-RADAR STATUS
echo =============================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue ^| Where-Object { $_.CommandLine -like '*fast-wide-radar.ps1*' }); if($p.Count){Write-Host ('FAST-RADAR LAEUFT - PID ' + (($p.ProcessId -join ', '))) -ForegroundColor Green}else{Write-Host 'FAST-RADAR LAEUFT NICHT' -ForegroundColor Red}; $log='E:\KI-Markt-Agent\data\logs\fast-wide-radar.log'; if(Test-Path $log){Write-Host ''; Write-Host 'Letzte Meldungen:'; Get-Content $log -Tail 12}"
echo.
pause
