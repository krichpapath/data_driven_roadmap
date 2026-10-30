@echo off
rem Double-click to start the analysis service and the web page in one window.
rem Close this window to stop both. Uses .venv-gpu if installed, else .venv-cpu.
cd /d "%~dp0"
set "PY=.venv-cpu\Scripts\python.exe"
if exist ".venv-gpu\Scripts\python.exe" set "PY=.venv-gpu\Scripts\python.exe"
if not exist "%PY%" (
  echo No .venv-cpu or .venv-gpu folder found. Follow "Install (once)" in README.md first.
  pause
  exit /b 1
)
rem Port 8000 must stay the same: roadmaps are saved per browser address.
start "" /b "%PY%" -m http.server 8000 --bind 127.0.0.1 --directory roadmap_builder >nul 2>&1
ping -n 3 127.0.0.1 >nul
start "" http://127.0.0.1:8000
echo Roadmap Review is running at http://127.0.0.1:8000  -  close this window to stop it.
"%PY%" src\api\roadmap_api.py
pause
