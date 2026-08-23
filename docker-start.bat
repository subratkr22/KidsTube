@echo off
setlocal
cd /d "%~dp0"

echo Starting local YouTube with Docker...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Docker could not start the app. Make sure Docker Desktop is running.
  pause
  exit /b 1
)

echo.
echo YouTube is running at http://127.0.0.1:5050
start "" http://127.0.0.1:5050
