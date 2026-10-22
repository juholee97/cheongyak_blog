@echo off
rem Cheongyak calendar Tistory skin - local preview (preview.bat check = self test)
cd /d "%~dp0"
if /i "%~1"=="check" goto check
node preview\serve.mjs --open
exit /b

:check
node preview\serve.mjs --check
exit /b %ERRORLEVEL%
