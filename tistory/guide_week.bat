@echo off
rem Guide queue, 2026-11-10 user decision: one guide on Tuesday and one on Friday (11:30 run).
rem Since 2026-11-23 (user decision) it only saves a draft on Tistory (no scheduled publish): the user publishes it. Saved drafts go to data\drafted_pending.json.
rem Empty queue = nothing is saved. 2 or more saved drafts not yet published = nothing new is saved. "guide_week.bat check" only prints today's decision. Log: data\logs\guide_queue.log
setlocal
cd /d "%~dp0.."
node -e "process.exit([2,5].includes(new Date().getDay())?0:1)"
if errorlevel 1 (echo not a guide day& exit /b 0)
if /i "%~1"=="check" (echo guide day: would save 1 draft from data\guide_queue.txt& exit /b 0)
echo ===== %DATE% %TIME% weekly guide >> data\logs\guide_queue.log
node tistory\schedule_guides.mjs --queue data\guide_queue.txt --draft --max 1 >> data\logs\guide_queue.log 2>&1
exit /b %ERRORLEVEL%
