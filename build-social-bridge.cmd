@echo off
setlocal
set "SDK=C:\Users\tratr\Downloads\DiscordSocialSdk-1.10.19337\discord_social_sdk"
set "VS=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat"
if not exist "%SDK%\include\discordpp.h" exit /b 2
if not exist "%VS%" exit /b 3
call "%VS%" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b 4
cl /nologo /std:c++20 /EHsc /MT /O2 /I "%SDK%\include" native\social_bridge.cpp /link /LIBPATH:"%SDK%\lib\release" discord_partner_sdk.lib /OUT:native\social-bridge.exe
exit /b %errorlevel%
