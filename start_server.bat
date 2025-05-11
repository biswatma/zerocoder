@echo off
set SCRIPT_DIR=%~dp0
set SERVER_LOG_FILE="%SCRIPT_DIR%server_runtime.log"

echo Changing directory to: %SCRIPT_DIR%
cd /d "%SCRIPT_DIR%"
echo Current directory is now: %CD%
echo.

echo ================================================================================
echo Checking for dependencies (node_modules folder)...
if not exist "node_modules" (
    echo "node_modules" folder not found.
    echo Running "npm install" to install dependencies. This may take a moment...
    echo.
    call npm install
    echo.
    if errorlevel 1 (
        echo ERROR: "npm install" failed. Please check messages above.
        echo Exiting.
        pause
        exit /b %errorlevel%
    )
    echo "npm install" finished successfully.
) else (
    echo "node_modules" folder found. Skipping "npm install".
)
echo ================================================================================
echo.

:START_SERVER_LOGIC
echo Attempting to start the ZeroCoder server...
echo Output from the server (including errors) will be logged to:
echo %SERVER_LOG_FILE%
echo.
echo If the server starts successfully, this window will remain open.
echo You can then access the site at http://localhost:3000
echo To STOP the server, press CTRL+C in this window.
echo ================================================================================
echo.

REM Clear the log file before starting the server
echo Server runtime log starting at %TIME% on %DATE% > %SERVER_LOG_FILE%

REM Run node server.js in a new cmd instance and append its output to the log file.
cmd /c "node server.js >> %SERVER_LOG_FILE% 2>&1"
set NODE_EXIT_CODE=%ERRORLEVEL%

REM This part will execute if node server.js exits.
echo. >> %SERVER_LOG_FILE%
echo Node.js server process (run via cmd /c) exited with code: %NODE_EXIT_CODE% at %TIME% on %DATE% >> %SERVER_LOG_FILE%

echo.
echo ================================================================================
echo The Node.js server process has exited with code: %NODE_EXIT_CODE%
echo Please check the log file for details:
echo %SERVER_LOG_FILE%
echo.
echo If the exit code is 0, the server may have been stopped manually (e.g. Ctrl+C).
echo If the exit code is not 0, an error likely occurred.
echo ================================================================================
echo.
echo Press any key to close this window...
pause
