@echo off
echo Current directory before change: %CD%
cd /d "%~dp0"
echo Current directory after change: %CD%
echo Checking if server.js exists: 
if exist server.js (
    echo server.js found!
) else (
    echo server.js NOT found!
    pause
    exit /b 1
)

echo ========================================
echo    Bible App Web Server
echo ========================================
echo.
echo Starting web server on port 8080...
echo Your Bible App will be available at:
echo   http://localhost:8080
echo.
echo To access on your touchscreen TV:
echo   1. Open TV web browser
echo   2. Go to: http://localhost:8080
echo   3. Start using the Bible app!
echo.
echo Press Ctrl+C to stop the server
echo.

npm start

pause 