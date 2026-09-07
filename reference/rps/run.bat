@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "PYTHON=%LocalAppData%\Programs\Python\Python312\python.exe"
set "TF_USE_LEGACY_KERAS=1"
set "ONE_SHOT="

if not exist "%PYTHON%" (
    echo [ERROR] Global Python 3.12 was not found:
    echo %PYTHON%
    pause
    exit /b 1
)

if /i "%~1"=="check" set "ONE_SHOT=1" & goto check
if /i "%~1"=="install" set "ONE_SHOT=1" & goto install
if /i "%~1"=="train" set "ONE_SHOT=1" & goto train
if /i "%~1"=="evaluate" set "ONE_SHOT=1" & goto evaluate
if /i "%~1"=="export" set "ONE_SHOT=1" & goto export
if /i "%~1"=="benchmark" set "ONE_SHOT=1" & goto benchmark

:menu
cls
echo ==================================================
echo   Python AI - Rock Paper Scissors CNN
echo   Python: %PYTHON%
echo ==================================================
echo.
echo   1. Check environment
echo   2. Install or update dependencies
echo   3. Train model
echo   4. Evaluate model
echo   5. Export LiteRT models
echo   6. Benchmark LiteRT models
echo   7. Predict one image
echo   0. Exit
echo.
set /p "CHOICE=Select: "

if "%CHOICE%"=="1" goto check
if "%CHOICE%"=="2" goto install
if "%CHOICE%"=="3" goto train
if "%CHOICE%"=="4" goto evaluate
if "%CHOICE%"=="5" goto export
if "%CHOICE%"=="6" goto benchmark
if "%CHOICE%"=="7" goto inference
if "%CHOICE%"=="0" exit /b 0
goto menu

:check
"%PYTHON%" -c "import tensorflow as tf; import keras; import tensorflow_datasets as tfds; import tensorflow_model_optimization as tfmot; import ai_edge_litert; print('Python:', __import__('sys').version.split()[0]); print('TensorFlow:', tf.__version__); print('Keras:', keras.__version__); print('TFDS:', tfds.__version__); print('TFMOT:', tfmot.__version__); print('LiteRT: installed'); print('GPU:', tf.config.list_physical_devices('GPU'))"
goto done

:install
"%PYTHON%" -m pip install --upgrade -r requirements.txt
goto done

:train
"%PYTHON%" -m src.train
goto done

:evaluate
"%PYTHON%" -m src.evaluate
goto done

:export
"%PYTHON%" -m src.export_litert
goto done

:benchmark
"%PYTHON%" -m src.benchmark
goto done

:inference
set "IMAGE_PATH="
set /p "IMAGE_PATH=Enter image path: "
if not defined IMAGE_PATH goto menu
"%PYTHON%" -m src.inference "%IMAGE_PATH%"
goto done

:done
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo [FAILED] Command ended with an error.
) else (
    echo [DONE] Command completed successfully.
)
echo.
if defined ONE_SHOT exit /b %EXIT_CODE%
pause
goto menu
