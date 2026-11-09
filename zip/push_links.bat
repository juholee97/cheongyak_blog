@echo off
rem Commit and push crawler\auleezip_links.json only when it changed, so the daily calendar build (GitHub Actions) sees it.
rem Only this file is committed (pathspec), other uncommitted work is never touched. Log: data\logs\zip_daily.log
setlocal
cd /d "%~dp0.."
if not exist data\logs mkdir data\logs
git add -N crawler/auleezip_links.json >> data\logs\zip_daily.log 2>&1
git diff --quiet -- crawler/auleezip_links.json
if not errorlevel 1 exit /b 0
git add crawler/auleezip_links.json >> data\logs\zip_daily.log 2>&1
git commit -m "auleezip links (auto)" -- crawler/auleezip_links.json >> data\logs\zip_daily.log 2>&1
git push >> data\logs\zip_daily.log 2>&1
exit /b %ERRORLEVEL%
