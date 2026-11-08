# NEXA VERSE LAUNCHER

Official Windows launcher build for the Nexa Verse project. Build 0.5.0 includes the GTA VI themed interface, six animated background images, Discord account linking and Nexa Verse server membership checks, game-folder selection, controller detection, Discord Rich Presence, and launcher update checks. The Discord friends list scrolls independently from its status banner, and the cover-style title is flat (no stacked 3D shadow).

## Discord account and server membership

The launcher uses Discord OAuth with PKCE and requests `identify` plus `guilds.members.read` for guild `1563364055543185470`. Public Client is enabled for application `1568756074692083925`. Session tokens are encrypted with Windows secure storage and refresh automatically.

The Discord Developer Portal OAuth2 settings must list this exact redirect URL: `http://127.0.0.1:4317/auth/callback`. If linking fails, the browser callback now shows Discord's error text and this URL when Discord rejects the token exchange. The launcher stores the linked session in Windows secure storage; you should not need to link again unless you disconnect, revoke the app in Discord, or the refresh token is revoked.

The Discord profile shows the linked account and Nexa Verse membership status. Role names and colors are not displayed. Server membership remains required to unlock Play.

## Discord friends and activity

The Friends page uses the official Discord Social SDK through a native Windows bridge compiled against the supplied C++ SDK. It displays real Discord friend names, avatars, online status, and current-game activity. The Social SDK connection has its own one-time Discord approval because the existing server-membership link does not include Social SDK permissions. Its refresh token is stored encrypted with Windows secure storage.

The Discord Developer Portal must allow the Social SDK for this application, keep Public Client enabled for the SDK token flow, and list `http://127.0.0.1/callback` as an OAuth2 redirect URI. The Social SDK runtime DLL and license notices are bundled inside the single-file launcher package. No private Discord API is used.
## Game folder and controller

Use **Link game folder** to select a legitimate installed PC game directory. This saves the path in the current Windows profile; the game launch command must be configured for the PC game build you distribute. The controller card uses the browser Gamepad API and displays the reported controller name after a controller connects.

## Build the Windows launcher

With Node.js 22.12 or later on Windows:

```powershell
npm install
npm run dist:win
```

`dist/win-unpacked` contains the app runtime. The single downloadable `NEXAVERSE LAUNCHER.exe` is an NSIS installer; users install it once. The launcher checks GitHub Releases at startup and downloads updates in the background. It installs a downloaded update when the user restarts or exits the launcher, so players do not need to find and run a new installer. The installer is unsigned. The role metadata service can be hosted alongside releases. A public GitHub repository is required so every launcher can read releases without user credentials. See `RELEASING.md` for the release workflow.

## Connected launcher count

The home card counts active sessions. The launcher sends a random, temporary session ID every 20 seconds after its local Discord membership check succeeds. Without the shared Worker endpoint configured in `presence-service.json`, the count is limited to the current launcher process. To make it network-wide, deploy the Cloudflare Worker in `presence-worker/`, then set the deployed HTTPS URL in `presence-service.json` and publish a launcher release. The Worker stores only anonymous session IDs and heartbeat times, expiring them after 45 seconds.

## Discord activity

When the Discord desktop client is open, the launcher can show Nexa Verse Launcher as the user's Discord activity. This is enabled by default and can be disabled in Settings. Discord's activity status must be enabled in the user's Discord client. The launcher communicates over Discord's local IPC and does not need to publish the user's linked account or game-folder path.

## Controller icon

The controller card defaults to the supplied mouse image and switches to DualShock 4, DualSense, Xbox, or SCUF artwork based on the Windows Gamepad API identifier. DGM20 USB Microphone and gamepad identifiers containing USB microphone are shown as SCUF Controller. The DS4 button lets the player select and open a local DS4Windows.exe; controllers exposed by its virtual gamepad are detected by the launcher. DS4Windows and its driver dependencies are not redistributed inside the launcher. Unknown gamepads use a generic outline icon.

