#!/usr/bin/env python3
"""
gamepad-cli-hub Application Runner
Installs dependencies, starts the gamepad CLI hub controller

Usage:
    python runApp.py
"""

import subprocess
import sys
import os
import time
import atexit
import signal
from pathlib import Path


def print_header(title):
    """Print a formatted header"""
    print("=" * 40)
    print(title)
    print("=" * 40)
    print()


def print_step(step, title):
    """Print a formatted step header"""
    print("-" * 40)
    print(f"Step {step}: {title}")
    print("-" * 40)


def run_command(command, cwd=None):
    """Run a command and return the exit code"""
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            capture_output=False,
            text=True
        )
        return result.returncode
    except Exception as e:
        print(f"[ERROR] Failed to execute command: {e}")
        return 1


# ---- Process management and cleanup ----
_procs = {}


def _register_proc(key, proc):
    if proc is not None:
        _procs[key] = proc


def _terminate_proc(proc, name):
    if not proc:
        return
    if proc.poll() is not None:
        return
    pid = proc.pid
    try:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        print(f"[CLEANUP] Terminated {name} (PID {pid})")
    except Exception as e:
        print(f"[WARN] Failed to terminate {name} (PID {pid}): {e}")


def _cleanup():
    app = _procs.get('app')
    if app is None:
        return
    print("\n[INFO] Shutting down child processes...")
    _terminate_proc(app, 'gamepad-cli-hub')


atexit.register(_cleanup)


def _install_signal_handlers():
    def handler(signum, frame):
        print(f"\n[INFO] Caught signal {signum}. Cleaning up...")
        _cleanup()
        try:
            sys.exit(0)
        except SystemExit:
            os._exit(0)

    for sig in ('SIGINT', 'SIGTERM', 'SIGHUP'):
        if hasattr(signal, sig):
            try:
                signal.signal(getattr(signal, sig), handler)
            except Exception:
                pass


def main():
    start_time = time.time()

    print_header("gamepad-cli-hub Application Runner")
    print(f"[INFO] Startup initiated at {time.strftime('%H:%M:%S')}")
    print()

    _install_signal_handlers()

    # Step 1: Install dependencies
    print_step(1, "Installing Dependencies")

    if not Path("node_modules").exists():
        print("[INFO] Installing npm dependencies...")
        if run_command("npm install") != 0:
            print("[ERROR] Failed to install dependencies")
            sys.exit(1)
        print("[SUCCESS] Dependencies installed")
    else:
        print("[INFO] Dependencies already installed (skipping)")
    print()

    # Step 2: Build TypeScript
    print_step(2, "Building TypeScript")

    print("[INFO] Running tsc...")
    if run_command("npx tsc") != 0:
        print("[WARN] TypeScript compilation had issues (continuing anyway)")
    print()

    # Step 3: Start the application
    print_step(3, "Starting gamepad-cli-hub")

    print("[INFO] Starting gamepad CLI controller...")
    print("[INFO] Connect your Xbox controller now!")
    print()

    try:
        app_process = subprocess.Popen(
            "npm start",
            shell=True,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
        _register_proc('app', app_process)
    except Exception as e:
        print(f"[ERROR] Failed to start app: {e}")
        sys.exit(1)

    print()
    print("=" * 40)
    print("gamepad-cli-hub is now running!")
    print("=" * 40)
    print()
    print("[INFO] Controls:")
    print("  - D-Pad Up/Down: Switch between CLI sessions")
    print("  - Left Trigger: Spawn new Claude Code instance")
    print("  - Right Bumper: Spawn new Copilot CLI instance")
    print("  - A: Clear screen")
    print("  - B: Voice input (long-press spacebar)")
    print("  - X/Y: Custom commands per CLI type")
    print()
    print("[INFO] Press Ctrl+C to stop")
    print()

    try:
        app_process.wait()
    except KeyboardInterrupt:
        pass
    finally:
        _cleanup()


if __name__ == "__main__":
    main()
