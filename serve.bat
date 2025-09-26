@echo off
REM Windows wrapper: WSL only (cmd.exe not supported)

where wsl >NUL 2>NUL
IF %ERRORLEVEL% NEQ 0 (
  echo [start] WSL not found. Please enable WSL:  wsl --install
  echo After install, open Ubuntu (WSL) and run:  ./serve.sh [dev^|prod]
  exit /B 1
)

wsl.exe bash -lc "cd \"$(wslpath -u '%cd%')\" && ./serve.sh %*"
exit /B %ERRORLEVEL%
