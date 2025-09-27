@echo off
REM Windows wrapper: WSL only (cmd.exe not supported)

where wsl >NUL 2>NUL
IF %ERRORLEVEL% NEQ 0 (
  echo [setup] WSL not found. Please enable WSL:  wsl --install
  echo After install, open Ubuntu ^(WSL^) ^and run:  ./setup.sh
  exit /B 1
)

REM Convert current Windows path to WSL path, ensure dos2unix, and run setup.sh in that directory
wsl.exe bash -lc "cd \"$(wslpath -u '%cd%')\" ^&^& if ! command -v dos2unix >/dev/null 2>&1; then sudo apt-get update; sudo apt-get install -y dos2unix; fi ^&^& dos2unix ./setup.sh ^&^& ./setup.sh %*"
exit /B %ERRORLEVEL%
