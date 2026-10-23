@echo off
rem Daily queue run (Task Scheduler, 00:30): schedule approved guides waiting in data\guide_queue.txt into free 08:00/12:00/19:00 slots.
rem Stops quietly at Tistory daily post limit (50) and keeps the rest for the next day. Never publishes immediately.
rem Log: data\logs\guide_queue.log
setlocal
cd /d "%~dp0"
if not exist data\logs mkdir data\logs
echo ===== %DATE% %TIME% >> data\logs\guide_queue.log
node tistory\schedule_guides.mjs --queue data\guide_queue.txt >> data\logs\guide_queue.log 2>&1
exit /b %ERRORLEVEL%
