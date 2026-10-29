@echo off
rem Starts Task & Conquer and opens it in your browser. Close this window to stop the app.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:4173"
node server.js
pause
