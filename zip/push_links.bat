@echo off
rem Commit crawler\auleezip_links.json when it changed, and push whenever a commit of that file has not reached the remote yet,
rem so a failed push is retried on the next run. Nothing to send = no push, so other sessions' unpushed commits are not pushed by this script.
rem Only this file is committed (pathspec), other uncommitted work is never touched. Log: data\logs\zip_daily.log
setlocal
cd /d "%~dp0.."
if not exist data\logs mkdir data\logs
git add -N crawler/auleezip_links.json >> data\logs\zip_daily.log 2>&1
git diff --quiet -- crawler/auleezip_links.json
if errorlevel 1 (
  git add crawler/auleezip_links.json >> data\logs\zip_daily.log 2>&1
  git commit -m "auleezip links (auto)" -- crawler/auleezip_links.json >> data\logs\zip_daily.log 2>&1
)
git log --oneline origin/main..HEAD -- crawler/auleezip_links.json | findstr . > nul
if errorlevel 1 exit /b 0
git push >> data\logs\zip_daily.log 2>&1
exit /b %ERRORLEVEL%
