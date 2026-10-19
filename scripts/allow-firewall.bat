@echo off
:: ToolCEO Windows Firewall Helper
:: This script allows inbound LAN connections on port 8765 for ToolCEO Mobile Transfer.
echo ========================================================
echo  ToolCEO - Configuring Windows Firewall for Mobile Transfer
echo ========================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Administrator permissions required.
    echo Requesting administrative privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~dpnx0\"' -Verb RunAs"
    exit /b
)

echo [*] Adding Windows Firewall rule for ToolCEO Port 8765...
netsh advfirewall firewall delete rule name="ToolCEO Mobile Transfer" >nul 2>&1
netsh advfirewall firewall add rule name="ToolCEO Mobile Transfer" dir=in action=allow protocol=TCP localport=8765 profile=any

echo [*] Adding Windows Firewall rule for ToolCEO Backend...
netsh advfirewall firewall delete rule name="ToolCEO Backend" >nul 2>&1
if exist "%~dp0..\dist\ToolCEO.exe" (
    netsh advfirewall firewall add rule name="ToolCEO Backend" dir=in action=allow program="%~dp0..\dist\ToolCEO.exe" profile=any
)
if exist "%~dp0..\backend\venv\Scripts\pythonw.exe" (
    netsh advfirewall firewall add rule name="ToolCEO Pythonw" dir=in action=allow program="%~dp0..\backend\venv\Scripts\pythonw.exe" profile=any
)
if exist "%~dp0..\backend\venv\Scripts\python.exe" (
    netsh advfirewall firewall add rule name="ToolCEO Python" dir=in action=allow program="%~dp0..\backend\venv\Scripts\python.exe" profile=any
)

echo.
echo [SUCCESS] Windows Firewall rules configured successfully!
echo You can now connect your phone to ToolCEO via Wi-Fi.
echo.
pause
