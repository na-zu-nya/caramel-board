@echo off
REM Windows wrapper: WSL only (cmd.exe not supported)

where wsl >NUL 2>NUL
IF %ERRORLEVEL% NEQ 0 (
  echo [update] WSL not found. Please enable WSL:  wsl --install
  echo After install, open Ubuntu ^(WSL^) ^and run:  ./serve.sh update
  exit /B 1
)

wsl.exe bash -lc "cd \"$(wslpath -u '%cd%')\" && dos2unix ./serve.sh && ./serve.sh update %*"
exit /B %ERRORLEVEL%
