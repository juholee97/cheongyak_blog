@echo off
rem Naver SearchAd keyword volume lookup.
rem Reads the newest *.txt list in D:\dev\blogging_ai\_workspace\research and writes a result .md next to it.
rem Usage: keyword_volume.bat            (newest list, opens result)
rem        keyword_volume.bat --check    (self-check, no network)
cd /d "%~dp0.."
if "%~1"=="--check" (
  node tools\keyword_volume.mjs --check
  exit /b %errorlevel%
)
node tools\keyword_volume.mjs --open %*
if errorlevel 1 pause
