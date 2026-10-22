@echo off
rem Weekly cheongyak post: build next week's draft from schedule.json and open the preview.
rem Summary lines, approval and Tistory draft save happen in the Claude Code session (tistory\draft.mjs --approved).
rem weekly_post.bat check = pipeline self test (no network save)
setlocal
cd /d "%~dp0"
if /i "%~1"=="check" goto check
node posts\weekly.mjs %*
if errorlevel 1 (
  pause
  exit /b 1
)
for /f "delims=" %%f in ('dir /b /o-d drafts\*_weekly.json') do (
  set NAME=%%~nf
  goto open
)
:open
start "" /min node preview\serve.mjs
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:5178/draft/%NAME%"
exit /b

:check
node preview\serve.mjs --check
exit /b %ERRORLEVEL%
