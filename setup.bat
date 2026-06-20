@echo off
set CHECKPOINT_REF=release/v1.0.8
echo Caramel Board CLI / Docker edition is frozen at %CHECKPOINT_REF%.
echo This branch no longer provides Docker setup.
echo.
echo To use the legacy Docker edition:
echo   git fetch origin %CHECKPOINT_REF%
echo   git checkout %CHECKPOINT_REF%
echo   setup.bat
echo.
echo For normal use, install the Desktop edition from GitHub Releases.
exit /b 1
