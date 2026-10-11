@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 goto launch_py
where python >nul 2>nul
if not errorlevel 1 goto launch_python
echo Установите Python 3.12 с сайта python.org.
echo При установке включите "Add Python to PATH".
pause
exit /b 1
:launch_py
py -3 server.py --open
pause
exit /b
:launch_python
python server.py --open
pause
