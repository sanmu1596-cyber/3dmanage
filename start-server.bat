@echo off
cd /d "%~dp0"
start "Project Management Server" cmd /k "node server.js"
echo Server is starting...
timeout /t 2 /nobreak >nul
echo Please open http://localhost:3000 in your browser.
