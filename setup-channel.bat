@echo off
set CHECKPOINT_REF=release/v1.0.8
echo Caramel Board CLI / Docker channels are frozen at %CHECKPOINT_REF%.
echo This branch is now for the Desktop / SQLite edition.
echo.
echo To use the legacy Docker edition:
echo   git fetch origin %CHECKPOINT_REF%
echo   git checkout %CHECKPOINT_REF%
exit /b 1
