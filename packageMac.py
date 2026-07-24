#!/usr/bin/env python3
"""
 Helm macOS Packager — mac counterpart of prepareDeploy.py's packaging step.

 Builds the app and produces release/Helm-<version>.dmg containing Helm.app
 with an /Applications symlink.

 Why not electron-builder's dmg target: its bundled dmgbuild tool requires
 Homebrew gettext and a Python built for a newer macOS than this machine runs
 (ERR_ELECTRON_BUILDER_CANNOT_EXECUTE). We build the .app with electron-builder
 and create the dmg with the OS-native hdiutil instead.

 The build is unsigned/unnotarized unless you configure Apple Developer ID
 signing. First launch on another Mac: right-click -> Open, or
 `xattr -dr com.apple.quarantine /Applications/Helm.app`.

Usage:
    python3 packageMac.py
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path


def run(cmd: str) -> None:
    print(f"[RUN] {cmd}")
    if subprocess.run(cmd, shell=True).returncode != 0:
        print(f"[ERROR] Command failed: {cmd}")
        sys.exit(1)


def create_deploy_configs() -> None:
    """Stage clean seed configs into config-deploy/ (overlaid onto config/ by
    electron-builder). Seeds come from src/config/ — the same files
    seedConfigIfNeeded copies on first launch in dev."""
    deploy_dir = Path("config-deploy")
    if deploy_dir.exists():
        shutil.rmtree(deploy_dir)
    deploy_dir.mkdir()
    src = Path("src/config")
    for pattern in ("*.yaml", "*.json"):
        for f in sorted(src.glob(pattern)):
            shutil.copyfile(f, deploy_dir / f.name)
            print(f"    {f} -> {deploy_dir / f.name}")


def main() -> None:
    if sys.platform != "darwin":
        print("[ERROR] packageMac.py must run on macOS. Use prepareDeploy.py on Windows.")
        sys.exit(1)

    version = json.loads(Path("package.json").read_text())["version"]
    print(f"[INFO] Packaging Helm {version} for macOS x64")

    create_deploy_configs()
    run("npm run build")
    # --dir: build the .app only; the dmg is created below with hdiutil.
    run("npx electron-builder --mac --x64 --dir")

    app = Path("release/mac/Helm.app")
    if not app.exists():
        print(f"[ERROR] {app} not found after build")
        sys.exit(1)

    staging = Path("release/dmg-staging")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    run(f'cp -R "{app}" "{staging}/"')
    (staging / "Applications").symlink_to("/Applications")

    dmg = Path(f"release/Helm-{version}.dmg")
    run(
        f'hdiutil create -volname "Helm {version}" -srcfolder "{staging}" '
        f'-ov -format UDZO "{dmg}"'
    )
    shutil.rmtree(staging)

    print(f"[SUCCESS] {dmg} ({dmg.stat().st_size // (1024 * 1024)} MB)")


if __name__ == "__main__":
    main()
