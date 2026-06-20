@echo off
set CHECKPOINT_REF=release/v1.0.8
echo Caramel Board CLI / Docker controls are available only on the frozen checkpoint.
echo.
echo Switch to:
echo   git fetch origin %CHECKPOINT_REF%
echo   git checkout %CHECKPOINT_REF%
echo   stop.bat
exit /b 1
