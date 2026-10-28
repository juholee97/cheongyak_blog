@echo off
rem Commit and push crawler\sh_attach.json only when it changed, so the daily calendar build (GitHub Actions) sees newly read SH attachment schedules. 2026-10-28 user decision.
rem Only this file is committed (pathspec), other uncommitted work is never touched. Log: data\logs\sh_attach.log
setlocal
cd /d "%~dp0.."
if not exist data\logs mkdir data\logs
git diff --quiet -- crawler/sh_attach.json
if not errorlevel 1 exit /b 0
echo ===== %DATE% %TIME% sh_attach.json changed >> data\logs\sh_attach.log
git add crawler/sh_attach.json >> data\logs\sh_attach.log 2>&1
git commit -m "SH attachment schedules (auto)" -- crawler/sh_attach.json >> data\logs\sh_attach.log 2>&1
git push >> data\logs\sh_attach.log 2>&1
exit /b %ERRORLEVEL%
