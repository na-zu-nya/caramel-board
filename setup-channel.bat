@echo off
REM Windows wrapper: WSL only (cmd.exe not supported)

where wsl >NUL 2>NUL
IF %ERRORLEVEL% NEQ 0 (
  echo [setup-channel] WSL not found. Please enable WSL:  wsl --install
  echo After install, open Ubuntu ^(WSL^) ^and run:  ./setup.sh channel
  exit /B 1
)

wsl.exe bash -lc "cd \"$(wslpath -u '%cd%')\" && if ! command -v dos2unix >/dev/null 2>&1; then sudo apt-get update; sudo apt-get install -y dos2unix; fi && dos2unix ./setup.sh && ./setup.sh channel %*"
exit /B %ERRORLEVEL%
