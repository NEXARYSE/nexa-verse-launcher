# Releasing launcher updates

The launcher is distributed as a single portable Windows executable; it does not install itself. Signed UI patches are checked in the background and applied in place while the launcher is open. UI changes can update without a full executable download. Changes to Electron's native runtime still require replacing the portable executable.

## One-time repository setup

Create a **public** repository for this project and push the launcher source, assets, native Social SDK bridge, and `.github/workflows/release.yml`. Public visibility is required so launcher users can fetch release metadata and packages without GitHub credentials. The repository will also make its source and committed assets public.

The release workflow uses GitHub Actions' `GITHUB_TOKEN`; no long-lived publishing secret is required. Its permission is limited to writing releases in this repository.

## Publish each version

1. Update `version` in `package.json` (for example, `0.3.9`).
2. Commit the source changes and push them to the repository's default branch.
3. Create and push a matching version tag:

   ```powershell
   git tag v0.3.9
   git push origin v0.3.9
   ```

The Windows workflow builds one portable executable and publishes it to a GitHub Release. Keep each release public so users can download the file without credentials.

## First install

The first portable release requires one download. Future UI patches are applied automatically by the launcher while it is running. Electron/runtime changes require a replacement portable executable.
