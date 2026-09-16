@echo off
rem Debug launcher - shows server errors in a console window
cd /d "%~dp0"
set DOWNLOAD_DIR=%~dp0..\downloads
node server.js
pause
