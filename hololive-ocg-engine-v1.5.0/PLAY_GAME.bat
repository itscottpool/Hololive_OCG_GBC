@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 22.18 or newer from https://nodejs.org/en/download
  echo Then double-click PLAY_GAME.bat again.
  pause
  exit /b 1
)

echo Starting Hololive OCG Pixel Battle...
echo Keep this window open while playing.
node --experimental-strip-types src\web-server.ts --open

if errorlevel 1 (
  echo.
  echo The game stopped because of an error.
  pause
)
endlocal
