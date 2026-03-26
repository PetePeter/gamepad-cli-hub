# Release Automation — Implementation Plan

## Problem

Currently no way to distribute the app. Users need to clone repo, `npm install`, and run `npm start`. No packaged executable, no version management, no releases.

## Solution

Add **electron-builder** for portable EXE creation + **GitHub Releases** automation via a `runDeploy.py` script that handles version bumps, git operations, building, and publishing.

## Architecture

```mermaid
flowchart TD
    A[runDeploy.py] --> B{Clean git status?}
    B -->|No| Z[Abort: commit or stash changes]
    B -->|Yes| C[Increment version in package.json]
    C --> D[git commit version bump]
    D --> E[git tag v{version}]
    E --> F[git push origin main + tags]
    F --> G[npm run package]
    G --> H[electron-builder builds portable EXE]
    H --> I[Create GitHub Release via API]
    I --> J[Upload artifacts]
    J --> K[Done]
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Release Pipeline                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. runDeploy.py <patch|minor|major>                            │
│     ├── Check git status (abort if dirty)                       │
│     ├── Read package.json version                               │
│     ├── Bump version (0.1.0 → 0.1.1)                            │
│     ├── Write package.json                                      │
│     ├── git commit -m "bump: v0.1.1"                            │
│     ├── git tag -a v0.1.1 -m "v0.1.1"                           │
│     ├── git push origin main --tags                             │
│     └── npm run dist                                            │
│                                                                  │
│  2. electron-builder (npm run dist)                             │
│     ├── Runs existing esbuild                                   │
│     ├── Packages for Windows portable                           │
│     ├── Creates dist/*.exe                                      │
│     └── Publishes to GitHub Release                             │
│                                                                  │
│  3. GitHub Release                                              │
│     ├── Auto-created from tag                                   │
│     ├── Contains: gamepad-cli-hub-portable.exe                  │
│     ├── Release notes: auto-generated                           │
│     └── URL: github.com/PetePeter/.../releases/tag/v0.1.1      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Tasks

### 1. Install electron-builder

```bash
npm install --save-dev electron-builder
```

### 2. Add electron-builder config

**File:** `package.json` (add `build` field)

```json
{
  "build": {
    "appId": "com.gamepadcli.hub",
    "productName": "gamepad-cli-hub",
    "directories": {
      "output": "dist"
    },
    "files": [
      "dist-electron/**/*",
      "dist/renderer/**/*",
      "renderer/index.html",
      "config/**/*",
      "node_modules/**/*"
    ],
    "win": {
      "target": [
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ]
    },
    "publish": {
      "provider": "github",
      "owner": "PetePeter",
      "repo": "gamepad-cli-hub"
    }
  }
}
```

### 3. Add package.json scripts

```json
{
  "scripts": {
    "package": "npm run build && electron-builder --win --x64 --portable",
    "dist": "npm run build && electron-builder --win --x64 --portable --publish always"
  }
}
```

### 4. Create runDeploy.py

**File:** `runDeploy.py` (repo root)

```python
#!/usr/bin/env python3
"""Release automation script."""

import subprocess
import sys
import json
import re
from pathlib import Path

def run(cmd, check=True):
    """Run shell command."""
    return subprocess.run(cmd, shell=True, check=check, capture_output=True, text=True)

def check_git_clean():
    """Abort if working tree is dirty."""
    result = run("git status --porcelain")
    if result.stdout.strip():
        print("❌ Uncommitted changes. Commit or stash first.")
        sys.exit(1)

def bump_version(part):
    """Bump version in package.json."""
    pkg_path = Path("package.json")
    pkg = json.loads(pkg_path.read_text())
    current = pkg["version"]

    parts = current.split(".")
    match part:
        case "patch":
            parts[2] = str(int(parts[2]) + 1)
        case "minor":
            parts[1] = str(int(parts[1]) + 1)
            parts[2] = "0"
        case "major":
            parts[0] = str(int(parts[0]) + 1)
            parts[1] = "0"
            parts[2] = "0"
        case _:
            print(f"❌ Invalid part: {part}")
            sys.exit(1)

    new_version = ".".join(parts)
    pkg["version"] = new_version
    pkg_path.write_text(json.dumps(pkg, indent=2) + "\n")
    return new_version

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("patch", "minor", "major"):
        print("Usage: python runDeploy.py <patch|minor|major>")
        sys.exit(1)

    part = sys.argv[1]

    print(f"🚀 Deploying {part} bump...")

    # 1. Check clean
    print("Checking git status...")
    check_git_clean()

    # 2. Bump version
    print("Bumping version...")
    new_version = bump_version(part)

    # 3. Commit version bump
    print(f"Committing v{new_version}...")
    run(f'git commit -am "bump: v{new_version}"')
    run(f'git tag -a v{new_version} -m "v{new_version}"')

    # 4. Push
    print("Pushing to GitHub...")
    run("git push origin main --tags")

    # 5. Build and publish
    print("Building release...")
    run("npm run dist")

    print(f"✅ v{new_version} released!")

if __name__ == "__main__":
    main()
```

### 5. Add .icon file (optional but recommended)

**File:** `build/icon.ico` (Windows icon)

Can use a simple placeholder or design proper icon. electron-builder will use this if present.

### 6. GitHub Token for Publishing

For `--publish always` to work, need `GH_TOKEN` environment variable:

```bash
# Create Personal Access Token with repo:public_repo scope
export GH_TOKEN=ghp_xxxxxxxxxxxx
```

Or store in GitHub Actions secrets for CI/CD.

## Output

After running `python runDeploy.py patch`:

```
dist/
├── gamepad-cli-hub-portable.exe    # Portable executable
└── gamepad-cli-hub-portable.zip    # GitHub artifact

GitHub Release:
├── Tag: v0.1.1
├── Assets: gamepad-cli-hub-portable.zip
└── Auto-generated release notes
```

## Usage

```bash
# Patch release (0.1.0 → 0.1.1) - bug fixes
python runDeploy.py patch

# Minor release (0.1.0 → 0.2.0) - new features
python runDeploy.py minor

# Major release (0.1.0 → 1.0.0) - breaking changes
python runDeploy.py major
```

## Python Scripts Summary

| Script | Purpose | Steps |
|--------|---------|-------|
| `runApp.py` | **Dev workflow** — run the app locally | 1. `npm install` (if needed) → 2. `npm run build` → 3. `npx electron .` |
| `runDeploy.py` | **Deployment** — publish releases | 1. Version bump → 2. Git commit/tag/push → 3. Build & package → 4. GitHub Release |

Separation of concerns: `runApp.py` for development, `runDeploy.py` for publishing.

## Notes

- Portable EXE extracts to `%LOCALAPPDATA%/gamepad-cli-hub` on first run
- No installer needed — users just download and run
- Config folder (`config/`) created in user's AppData or alongside EXE
- node-pty and robotjs native modules are automatically rebuilt by electron-builder for target platform
- For code signing (avoiding Windows SmartScreen warning), need a code signing certificate — not covered in initial implementation
