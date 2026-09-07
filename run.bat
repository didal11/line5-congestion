@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHON=%LocalAppData%\Programs\Python\Python312\python.exe"
set "PYTHONUTF8=1"
if not exist "%PYTHON%" (
    echo [ERROR] Global Python 3.12 not found: %PYTHON%
    pause
    exit /b 1
)
if "%~1"=="" goto menu
"%PYTHON%" -m subway.cli %*
exit /b %ERRORLEVEL%

:menu
echo.
echo === Line 5: Jongno 3-ga to Hwagok ===
echo 1. Project status
echo 2. Development plan
echo 3. Global Python packages
echo 0. Exit
set "CHOICE="
set /p "CHOICE=Select: "
if "%CHOICE%"=="0" exit /b 0
if "%CHOICE%"=="1" goto status
if "%CHOICE%"=="2" goto plan
if "%CHOICE%"=="3" goto check
goto menu
:status
"%PYTHON%" -m subway.cli status
goto done
:plan
"%PYTHON%" -m subway.cli plan
goto done
:check
"%PYTHON%" -m subway.cli check
goto done
:done
if errorlevel 1 echo [FAILED] Command returned an error.
pause
goto menu
