@echo off
rem Tistory login for draft automation (profile: data\tistory-session). A browser opens: log in yourself, then close it.
rem tistory_login.bat check = only report login status (exit 0 = logged in, 3 = not logged in)
setlocal
cd /d "%~dp0"
if /i "%~1"=="check" goto check
node tistory\login.mjs
echo.
echo Exit code: %ERRORLEVEL%  (0 = logged in, 3 = not logged in)
pause
exit /b

:check
node tistory\login.mjs --check
exit /b %ERRORLEVEL%
