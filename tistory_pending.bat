@echo off
rem Saved Tistory drafts waiting for the user to publish (data\drafted_pending.json, 2026-11-23).
rem Reads the blog RSS once: a draft published with the same title is recorded in posts\published.json and posts\scheduled.json and leaves the list.
rem Then shows the drafts still waiting. Title changed when publishing: node tistory\record_published.mjs --set slug url "YYYY-MM-DD HH:MM"
rem Not going to publish it: node tistory\record_published.mjs --drop slug   (the Tistory draft itself is never deleted)
setlocal
title cheongyak
cd /d "%~dp0"
node tistory\record_published.mjs
echo.
pause
