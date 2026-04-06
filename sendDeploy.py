#!/usr/bin/env python3
"""
Release publishing script — Step 2 of 2.

Finds the latest prepared release in release/, commits the version bump,
tags, pushes to GitHub, and publishes the release with artifacts.

Prerequisites:
    - Run prepareDeploy.py first
    - Validate the EXE manually
    - Set GH_TOKEN environment variable for GitHub publishing

Usage:
    python sendDeploy.py
"""

import subprocess
import sys
import json
import os
import re
from pathlib import Path

from prepareDeploy import create_deploy_configs, cleanup_deploy_configs


def run(cmd, check=True, capture=False):
    """Run shell command."""
    print(f"  $ {cmd}")
    if capture:
        result = subprocess.run(
            cmd, shell=True, check=check, capture_output=True, text=True
        )
    else:
        result = subprocess.run(cmd, shell=True, check=check)
    return result


def find_latest_release():
    """Find the latest dated release folder."""
    release_root = Path("release")
    if not release_root.exists():
        return None

    # Match folders like 20260403-v0.1.1
    pattern = re.compile(r"^(\d{8})-v(\d+\.\d+\.\d+)$")
    candidates = []
    for item in release_root.iterdir():
        if item.is_dir():
            match = pattern.match(item.name)
            if match:
                candidates.append((item.name, match.group(2), item))

    if not candidates:
        return None

    # Sort by folder name (date+version) descending — latest first
    candidates.sort(key=lambda x: x[0], reverse=True)
    folder_name, version, path = candidates[0]
    return {"version": version, "path": path, "folder_name": folder_name}


def main():
    print("=" * 50)
    print("🚀 Publishing release to GitHub...")
    print("=" * 50)
    print()

    # 1. Find latest release
    print("[1/5] Finding latest prepared release...")
    release = find_latest_release()
    if not release:
        print("❌ No prepared release found in release/")
        print("   Run prepareDeploy.py first.")
        sys.exit(1)

    version = release["version"]
    release_path = release["path"]
    print(f"  ✅ Found: {release['folder_name']} (v{version})")
    print()

    # 2. Verify artifacts
    print("[2/5] Verifying artifacts...")
    exes = list(release_path.glob("*.exe"))
    if not exes:
        print("⚠️  No .exe found. Continuing anyway (may be expected for some configs).")
    else:
        for exe in exes:
            size_mb = exe.stat().st_size / (1024 * 1024)
            print(f"  📄 {exe.name} ({size_mb:.1f} MB)")

    # Verify package.json version matches
    pkg = json.loads(Path("package.json").read_text(encoding="utf-8"))
    if pkg["version"] != version:
        print(f"❌ Version mismatch: package.json has {pkg['version']}, release folder has {version}")
        print("   Did you run prepareDeploy.py for this version?")
        sys.exit(1)
    print(f"  ✅ package.json version matches: {version}")
    print()

    # 3. Check GH_TOKEN
    print("[3/5] Checking GitHub token...")
    if not os.environ.get("GH_TOKEN"):
        print("⚠️  GH_TOKEN not set. GitHub publish will fail.")
        print("   Set it with: set GH_TOKEN=ghp_xxxxxxxxxxxx")
        response = input("   Continue anyway? (y/N): ").strip().lower()
        if response != "y":
            sys.exit(1)
    else:
        print("  ✅ GH_TOKEN is set")
    print()

    # 4. Git commit, tag, push
    print("[4/5] Committing and pushing...")
    run(f'git commit -am "bump: v{version}"')
    run(f'git tag -f -a v{version} -m "v{version}"')
    run("git push origin HEAD --tags")
    print()

    # 5. Publish to GitHub Releases (with deploy configs for clean packaging)
    print("[5/5] Publishing to GitHub Releases...")
    create_deploy_configs()
    try:
        run("npm run dist")
    finally:
        cleanup_deploy_configs()

    print()
    print("=" * 50)
    print(f"✅ v{version} published!")
    print("=" * 50)
    print()
    print(f"  GitHub Release: https://github.com/PetePeter/gamepad-cli-hub/releases/tag/v{version}")


if __name__ == "__main__":
    main()
