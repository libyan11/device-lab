@echo off
rem Starts a local web server and opens Device Lab in Chrome (or Edge). Close this window to stop the server.
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH", then run this again.
  pause
  exit /b 1
)
set URL=http://127.0.0.1:8790/devices.html
set BROWSER=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not defined BROWSER (
  echo Chrome or Edge was not found; opening your default browser. USB, HID and serial tests only work in Chrome or Edge.
  set BROWSER=explorer
)
rem Open the browser a moment after the server starts, so the page is never requested before the server is up.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" "%BROWSER%" %URL%"
echo Serving Device Lab at %URL%  - close this window to stop.
py -m http.server 8790 --bind 127.0.0.1
if errorlevel 1 echo.& echo The server stopped. If port 8790 is already in use, close the other window running start.bat and try again.& pause
