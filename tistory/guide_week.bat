@echo off
rem Guide queue, 2026-11-10 user decision: one guide on Tuesday and one on Friday (07:00 run), each scheduled for the next free 12:00.
rem Empty queue = nothing is posted. "guide_week.bat check" only prints today's decision. Log: data\logs\guide_queue.log
setlocal
cd /d "%~dp0.."
node -e "process.exit([2,5].includes(new Date().getDay())?0:1)"
if errorlevel 1 (echo not a guide day& exit /b 0)
if /i "%~1"=="check" (echo guide day: would schedule 1 from data\guide_queue.txt& exit /b 0)
echo ===== %DATE% %TIME% weekly guide >> data\logs\guide_queue.log
node tistory\schedule_guides.mjs --queue data\guide_queue.txt --max 1 --times 12:00 >> data\logs\guide_queue.log 2>&1
exit /b %ERRORLEVEL%
