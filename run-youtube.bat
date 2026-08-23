@echo off
setlocal
cd /d "%~dp0"

echo Starting YouTube...
echo Local address: http://127.0.0.1:5050
echo.

dotnet run --project YouTube.csproj

if errorlevel 1 (
  echo.
  echo YouTube could not start. Make sure the .NET 8 SDK is installed.
  pause
)
