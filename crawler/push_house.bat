@echo off
rem Look up building types of Seoul youth housing (crawler\youth_house.mjs) and push crawler\youth_house.json only when it changed, so the daily calendar build sees them. 2026-11-11 user decision.
rem Only this file is committed (pathspec), other uncommitted work is never touched. Log: data\logs\youth_house.log
setlocal
cd /d "%~dp0.."
if not exist data\logs mkdir data\logs
echo ===== %DATE% %TIME% >> data\logs\youth_house.log
node --env-file=.env crawler\youth_house.mjs >> data\logs\youth_house.log 2>&1
if errorlevel 1 exit /b 1
git diff --quiet -- crawler/youth_house.json
if not errorlevel 1 exit /b 0
git add crawler/youth_house.json >> data\logs\youth_house.log 2>&1
git commit -m "Youth housing building types (auto)" -- crawler/youth_house.json >> data\logs\youth_house.log 2>&1
git push >> data\logs\youth_house.log 2>&1
exit /b %ERRORLEVEL%
