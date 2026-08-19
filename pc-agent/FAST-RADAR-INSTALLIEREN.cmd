@echo off
setlocal
cd /d "%~dp0"
echo.
echo =============================================
echo   KI-MARKT FAST-RADAR WIRD AKTIVIERT
echo =============================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-fast-radar.ps1"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo FEHLER: Fast-Radar konnte nicht aktiviert werden.
) else (
  echo Fertig. Der Haupt-Agent und der Fast-Radar laufen parallel.
)
echo.
pause
exit /b %ERR%
