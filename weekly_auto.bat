@echo off
rem Weekly auto run (Task Scheduler, Sunday 18:00): next week's draft, images, auto summary, check, Tistory draft save. Never publishes.
rem weekly_auto.bat check = same steps, Tistory step as --dry-run (no save)
rem Log: data\logs\weekly_auto.log
setlocal
title cheongyak
rem Tistory shows reCAPTCHA to headless browsers, so the browser window is shown (2026-10-24)
set TISTORY_HEADED=1
cd /d "%~dp0"
if /i "%~1"=="check" (
  node posts\auto.mjs --dry-run %2 %3 %4
) else (
  node posts\auto.mjs %*
)
exit /b %ERRORLEVEL%
