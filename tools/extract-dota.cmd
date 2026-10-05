@echo off
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0extract-dota.ps1" %*
