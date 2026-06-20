@echo off
set CHECKPOINT_REF=release/v1.0.8
echo Caramel Board CLI / Docker update is discontinued.
echo The legacy Docker edition is frozen at %CHECKPOINT_REF%.
echo.
echo Do not update this checkout for Docker operation. Switch back to:
echo   git fetch origin %CHECKPOINT_REF%
echo   git checkout %CHECKPOINT_REF%
exit /b 1
