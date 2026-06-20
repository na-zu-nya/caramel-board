@echo off
set CHECKPOINT_REF=release/v1.0.8
echo Caramel Board CLI / Docker edition is frozen at %CHECKPOINT_REF%.
echo.
echo To run the legacy Docker edition:
echo   git fetch origin %CHECKPOINT_REF%
echo   git checkout %CHECKPOINT_REF%
echo   serve.bat
echo.
echo This branch is now for the Desktop / SQLite edition.
exit /b 1
