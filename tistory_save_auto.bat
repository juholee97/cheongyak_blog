@echo off
rem Tistory save run (Task Scheduler cheongyak_tistory_save, daily 11:30, 2026-11-19 user decision). Never publishes.
rem Since 2026-11-23 (user decision) it only saves drafts on Tistory: scheduled publishing kept stopping at the security check (reCAPTCHA). The user publishes.
rem Saved drafts go to data\drafted_pending.json; a published one is recorded on the next run (RSS title match) or with tistory_pending.bat.
rem Moved out of analysis_auto.bat (07:00): from 11-10 six runs in a row stopped at Tistory's security check (reCAPTCHA) with nobody at the PC.
rem Right before the browser opens for a real save, tistory\notify.mjs sends one KakaoTalk note to me (claude -p + PlayMCP, TISTORY_NOTIFY=kakao).
rem A failed note (no tool, timeout, limit) is one log line and the save goes on.
rem tistory_save_auto.bat check = self-check only (publish guard, notify check mode, pending check, today's guide decision): nothing saved, nothing sent
rem Logs: data\logs\guide_queue.log, weekly_auto.log, weekly_auto_err.log
setlocal
title cheongyak
rem Tistory shows reCAPTCHA to headless browsers, so the browser window is shown (2026-10-24)
set TISTORY_HEADED=1
set TISTORY_NOTIFY=kakao
cd /d "%~dp0"
if /i "%~1"=="check" goto check
if not exist data\logs mkdir data\logs
rem At most 1 save a day here (2026-11-13 user decision). Manual runs and weekly_auto.bat keep 3 a day (tistory\draft.mjs, data\tistory_usage.json).
rem A failed try also uses the save, so later steps end with code 5 without opening a browser. Order: weekly retry, urgent posts, Tue/Fri guide.
set TISTORY_DAY_MAX=1
rem Weekly schedule post retry (2026-11-11): on Monday, if Sunday 18:00 could not save this week's post, it goes first here
rem Errors go to a separate file: redirecting to weekly_auto.log locks it, and auto.mjs (which writes that log itself) died with EBUSY (fixed 2026-11-19)
node posts\auto.mjs --catch-up > nul 2>> data\logs\weekly_auto_err.log
rem Approved time-sensitive posts (policy news) first: data\priority_queue.txt, saved as a draft (2026-11-23, was a 09:30/15:30 scheduled slot since 2026-10-27)
echo ===== %DATE% %TIME% priority >> data\logs\guide_queue.log
node tistory\schedule_guides.mjs --queue data\priority_queue.txt --draft --max 1 >> data\logs\guide_queue.log 2>&1
echo ===== %DATE% %TIME% >> data\logs\guide_queue.log
call tistory\guide_week.bat
rem Monthly refresh of published guides (posts\refresh_run.mjs) is no longer run here: removed 2026-11-23 (user decision). Files are kept.
exit /b 0
:check
node tistory\guard.check.mjs
if errorlevel 1 exit /b 1
node tistory\notify.check.mjs
if errorlevel 1 exit /b 1
node tistory\notify.mjs --check
if errorlevel 1 exit /b 1
node tistory\pending.check.mjs
if errorlevel 1 exit /b 1
call tistory\guide_week.bat check
exit /b 0
