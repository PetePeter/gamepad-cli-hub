#!/usr/bin/env python3
"""
Release preparation script — Step 1 of 2.

Bumps version in package.json, builds the app, and packages a Windows
NSIS installer into a date+version stamped folder under release/.

Does NOT commit, tag, or push. Run sendDeploy.py after validating the EXE.

Usage:
    python prepareDeploy.py <patch|minor|major>

Rollback (if unhappy with build):
    git checkout package.json
    # Optionally delete the release/YYYYMMDD-vX.Y.Z/ folder
"""

import subprocess
import sys
import json
import shutil
from datetime import datetime
from pathlib import Path


def run(cmd, check=True):
    """Run shell command, printing output in real-time."""
    print(f"  $ {cmd}")
    result = subprocess.run(cmd, shell=True, check=check)
    return result


def patch_native_modules():
    """Patch node-pty .gyp files to disable Spectre mitigation requirement.

    VS 2026 (v18) doesn't ship Spectre-mitigated libraries as a component.
    node-pty's binding.gyp hardcodes SpectreMitigation: 'Spectre', which
    fails the build. We patch it to 'false' before electron-builder runs
    @electron/rebuild.
    """
    gyp_files = [
        Path("node_modules/node-pty/binding.gyp"),
        Path("node_modules/node-pty/deps/winpty/src/winpty.gyp"),
    ]
    for gyp in gyp_files:
        if not gyp.exists():
            continue
        content = gyp.read_text(encoding="utf-8")
        if "'SpectreMitigation': 'Spectre'" in content:
            content = content.replace(
                "'SpectreMitigation': 'Spectre'",
                "'SpectreMitigation': 'false'"
            )
            gyp.write_text(content, encoding="utf-8")
            print(f"  Patched {gyp}")


def bump_version(part):
    """Bump version in package.json and return (old_version, new_version)."""
    pkg_path = Path("package.json")
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
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
    pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
    return current, new_version


def check_git_clean():
    """Abort if working tree is dirty."""
    result = subprocess.run(
        "git status --porcelain",
        shell=True, capture_output=True, text=True
    )
    if result.stdout.strip():
        print("❌ Uncommitted changes detected. Commit or stash first.")
        print()
        print("Dirty files:")
        for line in result.stdout.strip().split("\n"):
            print(f"  {line}")
        sys.exit(1)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("patch", "minor", "major"):
        print("Usage: python prepareDeploy.py <patch|minor|major>")
        sys.exit(1)

    part = sys.argv[1]

    print("=" * 50)
    print(f"📦 Preparing {part} release...")
    print("=" * 50)
    print()

    # 1. Check git is clean
    print("[1/5] Checking git status...")
    check_git_clean()
    print("  ✅ Working tree is clean")
    print()

    # 2. Bump version
    print("[2/5] Bumping version...")
    old_version, new_version = bump_version(part)
    print(f"  ✅ {old_version} → {new_version}")
    print()

    # 3. Patch native modules for VS 2026 compatibility, then build + package
    print("[3/5] Patching native modules for build...")
    patch_native_modules()
    print("  ✅ Native modules patched")
    print()

    print("[4/5] Building and packaging...")
    result = run("npm run package")
    if result.returncode != 0:
        print("❌ Build failed. Revert with: git checkout package.json")
        sys.exit(1)
    print()

    # 4. Move artifacts to dated folder
    print("[5/5] Organizing release artifacts...")
    date_stamp = datetime.now().strftime("%Y%m%d")
    release_dir = Path("release") / f"{date_stamp}-v{new_version}"

    # electron-builder outputs to release/ — move files into the dated subfolder
    release_root = Path("release")
    if not release_root.exists():
        print("❌ No release output found. Build may have failed.")
        sys.exit(1)

    # Create dated folder and move all artifacts (except existing dated folders)
    release_dir.mkdir(parents=True, exist_ok=True)
    for item in release_root.iterdir():
        if item == release_dir or item.name.startswith("."):
            continue
        # Skip other dated folders from previous builds
        if item.is_dir() and len(item.name) >= 8 and item.name[:8].isdigit():
            continue
        dest = release_dir / item.name
        if dest.exists():
            if dest.is_dir():
                shutil.rmtree(dest)
            else:
                dest.unlink()
        item.rename(dest)

    # Find the installer EXE
    exes = list(release_dir.glob("*.exe"))
    if not exes:
        # Also check for NSIS installer pattern
        exes = list(release_dir.glob("*Setup*.exe"))
    if not exes:
        print("⚠️  No installer found in release output. Check electron-builder config.")
    else:
        for exe in exes:
            size_mb = exe.stat().st_size / (1024 * 1024)
            print(f"  📄 {exe.name} ({size_mb:.1f} MB)")

    print()
    print("=" * 50)
    print(f"✅ Release v{new_version} prepared!")
    print("=" * 50)
    print()
    print(f"  Artifacts: {release_dir}")
    print()
    print("Next steps:")
    print(f"  1. Test the EXE in {release_dir}")
    print("  2. If happy:  python sendDeploy.py")
    print("  3. If not:    git checkout package.json")


if __name__ == "__main__":
    main()
