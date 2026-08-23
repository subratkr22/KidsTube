@echo off
setlocal
cd /d "%~dp0"

echo Starting KidsTube...
echo Local address: http://127.0.0.1:5050
echo.

dotnet run --project KidsTube.csproj

if errorlevel 1 (
  echo.
  echo KidsTube could not start. Make sure the .NET 8 SDK is installed.
  pause
)
