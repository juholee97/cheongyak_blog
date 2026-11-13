@echo off
rem Daily auto run (Task Scheduler, 07:00). Tistory analysis posts and retrofits stopped 2026-11-10 (user): deep analysis moved to auleezip.      
rem Never publishes immediately.                                                                                          
rem analysis_auto.bat check = publish guard self-check only (no save)        
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
rem SH rent posts removed from the site 2026-11-03 (user: apartments, officetels, villas only) - zip\sh_write.mjs no longer runs here
node zip\publish.mjs --go >> data\logs\zip_daily.log 2>&1
call zip\push_links.bat
rem auleezip deep-analysis posts: re-check published pages for leftover markup (2026-10-30)                                     
node zip\deep.mjs --verify all >> data\logs\zip_daily.log 2>&1
rem auleezip deep-analysis targets: sale notices (APT, unranked, random) in the capital area or key regional districts, plus capital-area youth housing and LH happy housing (2026-11-05), receipt 3+ days away -> analyzer folder + data\deep_folders.json
node zip\deep_targets.mjs --make >> data\logs\zip_daily.log 2>&1
rem SH notices whose schedule is only in attachments: read the viewer page images with OCR (tools\ocr_venv) -> crawler\sh_attach.json (commit it to reach the calendar) (2026-10-28)
node crawler\sh_attach.mjs >> data\logs\sh_attach.log 2>&1
call crawler\push_attach.bat
rem Seoul youth housing building types from the building register -> crawler\youth_house.json (2026-11-11)
call crawler\push_house.bat
rem analysis posts off 2026-11-10
set RC=0         
if not exist data\logs mkdir data\logs
rem Tistory saves here: at most 1 a day (2026-11-13 user decision). The second save of a morning usually hits Tistory's security check (reCAPTCHA)
rem and nobody is at the PC at 07:00. Manual runs and weekly_auto.bat keep 3 a day (tistory\draft.mjs, data\tistory_usage.json).
rem A failed try also uses the save, so later steps end with code 5 without opening a browser. Order: weekly retry, urgent posts, Tue/Fri guide, refresh.
set TISTORY_DAY_MAX=1
rem Weekly schedule post retry (2026-11-11): on Monday, if Sunday 18:00 could not save this week's post, it goes first here
node posts\auto.mjs --catch-up > nul 2>> data\logs\weekly_auto.log
rem Approved time-sensitive posts (policy news) first: data\priority_queue.txt, earliest free 09:30 or 15:30 slot from one hour later (2026-10-27)
echo ===== %DATE% %TIME% priority >> data\logs\guide_queue.log
node tistory\schedule_guides.mjs --queue data\priority_queue.txt --soon --times 09:30,15:30 --max 1 >> data\logs\guide_queue.log 2>&1
echo ===== %DATE% %TIME% >> data\logs\guide_queue.log
call tistory\guide_week.bat
rem Monthly refresh of published guides (new check date and month stamp, queue data\guide_refresh.txt), after the Tue/Fri guide since 2026-11-13
echo ===== %DATE% %TIME% >> data\logs\guide_refresh.log
node posts\refresh_run.mjs --max 2 >> data\logs\guide_refresh.log 2>&1
rem Retrofit of published analysis posts stopped 2026-11-10.                                                                         
rem off                                                    
rem off                                                                         
exit /b %RC%
:check
node tistory\guard.check.mjs                
exit /b %ERRORLEVEL%
