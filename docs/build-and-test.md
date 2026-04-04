# Build & Test

## Commands

```bash
npm run build    # esbuild: electron (dist-electron/main.js) + renderer (dist/renderer/main.js)
npm run start    # Build and launch
npm run package  # Build + package portable Windows EXE to release/
npm run dist     # Build + package + publish to GitHub Releases (needs GH_TOKEN)
npm test         # Vitest suite
```

## Release Workflow (two-step)

```bash
python prepareDeploy.py patch   # Bump version, strip configs, build, package EXE → release/YYYYMMDD-vX.Y.Z/
# ... validate the EXE manually ...
python sendDeploy.py            # Commit, tag, push, publish to GitHub Releases
```

| Script | Purpose |
|--------|---------|
| `runApp.py` | Dev workflow — install deps, build, launch |
| `runTests.py` | Run Vitest suite |
| `prepareDeploy.py` | Release step 1 — bump version, strip configs for deploy, build, package EXE |
| `sendDeploy.py` | Release step 2 — commit, tag, push, publish |

## Deploy Config Stripping

`prepareDeploy.py` creates a `config-deploy/` staging directory containing sanitised config files:
- **Profile YAMLs** — `workingDirectories` removed (no personal paths)
- **settings.yaml** — clean defaults only (no window bounds or session groups)
- **sessions.yaml** — empty (no saved sessions)

`electron-builder` overlays `config-deploy/` onto `config/` during packaging (see `build.files` in `package.json`). The staging directory is automatically cleaned up after the build, and is gitignored.

## Build Notes

- Renderer output: `dist/renderer/main.js` (not `renderer/main.js`)
- node-pty is `--external` in the electron esbuild (native addon, not bundled)
- No `--allow-overwrite` flag
- Build produces two bundles: main process (`dist-electron/main.js`) and renderer (`dist/renderer/main.js`)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop shell | Electron 41 |
| Language | TypeScript (ESM) |
| Bundler | esbuild |
| Tests | Vitest |
| Gamepad input | Browser Gamepad API (sole input source) |
| Embedded terminals | node-pty (PTY) + @xterm/xterm (xterm.js) |
| PTY shell | cmd.exe (Windows), bash (Unix) |
| Haptic feedback | Config setting (implementation pending — PowerShell XInput path removed) |
| Config | YAML (yaml package) |
| Logging | Winston |
