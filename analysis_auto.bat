@echo off
rem Daily auto run (Task Scheduler, 07:00): analysis posts for notices whose first receipt is 7 days away, scheduled to publish at 10:00 that day.
rem User decision 2026-10-23: no chat approval; only posts that pass the check are scheduled. Never publishes immediately.
rem analysis_auto.bat check = same steps, Tistory step as --dry-run (no save)
rem Log: data\logs\analysis_auto.log
setlocal
title cheongyak
rem Tistory shows reCAPTCHA to headless browsers, so the browser window is shown (2026-10-24)
set TISTORY_HEADED=1
cd /d "%~dp0"
if /i "%~1"=="check" goto check
if not exist data\logs mkdir data\logs
rem Policy news candidates (official press releases and legislative notices), list only: data\policy_candidates.md (2026-10-27)
echo ===== %DATE% %TIME% >> data\logs\policy_watch.log
node posts\policy_watch.mjs >> data\logs\policy_watch.log 2>&1
rem auleezip: notices open for application with no price-comparison post yet -> popup + data\zip_new.json (2026-10-28). Posts are made together with the user.
node zip\new_notices.mjs >> data\logs\zip_new.log 2>&1
rem auleezip daily refresh (2026-10-29 user decision): closed-notice banners, open-notices page (receipt status, D-day), revision log, cache purge.
rem Only existing data is re-rendered (no new notices are added here) and held drafts are not touched (--live = already published only).
rem Interest numbers (Naver search trend, news count, YouTube metadata) refreshed once a week per notice; closed notices keep their last values (2026-10-29)
node zip\buzz.mjs --max-age 6.5 >> data\logs\zip_buzz.log 2>&1
node zip\post.mjs >> data\logs\zip_daily.log 2>&1
node zip\sh_write.mjs --publish --live >> data\logs\zip_daily.log 2>&1
node zip\publish.mjs --go >> data\logs\zip_daily.log 2>&1
rem auleezip deep-analysis posts: re-check published pages for leftover markup (scheduled posts go live 06:00, 7 days before first receipt) (2026-10-30)
node zip\deep.mjs --verify all >> data\logs\zip_daily.log 2>&1
rem SH notices whose schedule is only in attachments: read the viewer page images with OCR (tools\ocr_venv) -> crawler\sh_attach.json (commit it to reach the calendar) (2026-10-28)
node crawler\sh_attach.mjs >> data\logs\sh_attach.log 2>&1
call crawler\push_attach.bat
node posts\analysis_auto.mjs %*
set RC=%ERRORLEVEL%
if not exist data\logs mkdir data\logs
rem Tistory daily post limit is now 5 (2026-10-27), so one run in priority order: analysis posts, then up to 3 queued guides, then retrofits.
rem Since 2026-10-30 tistory\draft.mjs allows 3 saves a day in total, 30 minutes apart, and no edits of posts until 2026-11-03 (data\tistory_usage.json).
rem The 00:30 guide queue task is disabled; guides run here after analysis posts.
rem Approved time-sensitive posts (policy news) first: data\priority_queue.txt, earliest free 09:30 or 15:30 slot from one hour later (2026-10-27)
echo ===== %DATE% %TIME% priority >> data\logs\guide_queue.log
node tistory\schedule_guides.mjs --queue data\priority_queue.txt --soon --times 09:30,15:30 --max 2 >> data\logs\guide_queue.log 2>&1
rem Monthly refresh of published guides (new check date and month stamp, queue data\guide_refresh.txt) goes before new guides (2026-10-27)
echo ===== %DATE% %TIME% >> data\logs\guide_refresh.log
node posts\refresh_run.mjs --max 2 >> data\logs\guide_refresh.log 2>&1
echo ===== %DATE% %TIME% >> data\logs\guide_queue.log
node tistory\schedule_guides.mjs --queue data\guide_queue.txt --max 3 >> data\logs\guide_queue.log 2>&1
rem Then fix up to 3 already-published analysis posts (new card, region tag in title). Queue: data\analysis_retrofit.txt (2026-10-26)
echo ===== %DATE% %TIME% >> data\logs\analysis_retrofit.log
node posts\retrofit_analysis.mjs --max 3 >> data\logs\analysis_retrofit.log 2>&1
exit /b %RC%
:check
node posts\analysis_auto.mjs --dry-run %2 %3
exit /b %ERRORLEVEL%
