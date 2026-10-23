@echo off
rem Daily auto run (Task Scheduler, 07:00): analysis posts for notices whose first receipt is 7 days away, scheduled to publish at 10:00 that day.
rem User decision 2026-10-23: no chat approval; only posts that pass the check are scheduled. Never publishes immediately.
rem analysis_auto.bat check = same steps, Tistory step as --dry-run (no save)
rem Log: data\logs\analysis_auto.log
setlocal
cd /d "%~dp0"
if /i "%~1"=="check" (
  node posts\analysis_auto.mjs --dry-run %2 %3
) else (
  node posts\analysis_auto.mjs %*
)
exit /b %ERRORLEVEL%
