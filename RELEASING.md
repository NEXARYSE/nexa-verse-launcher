# Releasing launcher updates

The launcher uses Electron Updater with the GitHub Releases provider. Releases are served over HTTPS, and installed copies check for a newer version when they start. Downloads happen in the background and the NSIS updater applies the package when the user restarts or exits the launcher.

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

The Windows workflow builds the NSIS installer and publishes the installer, `latest.yml`, and block map to a GitHub Release. Once the release is published, installed launchers download it automatically. Keep each release public; drafts are not visible to the updater.

## First install

Portable self-extracting builds cannot use Electron Updater. Users need to install the NSIS build once to enable automatic updates. After that, they do not have to manually download each new launcher build.
