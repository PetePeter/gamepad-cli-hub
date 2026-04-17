#!/usr/bin/env python3
"""
 Helm Test Runner
Runs TypeScript tests and linting

Usage:
    python runTests.py           # Default: Show test results
    python runTests.py -v        # Verbose: Show all output
    python runTests.py -f        # Full: Show ALL output unformatted
"""

import subprocess
import sys
import os
import argparse
from pathlib import Path


def run_command(cmd, cwd=None, capture_output=True):
    """Run a command and return result info."""
    try:
        if os.name == 'nt':  # Windows
            full_cmd = f'cmd /c "{cmd}"'
            result = subprocess.run(
                full_cmd,
                cwd=cwd,
                capture_output=capture_output,
                text=True,
                encoding='utf-8',
                errors='ignore'
            )
        else:
            result = subprocess.run(
                cmd,
                shell=True,
                cwd=cwd,
                capture_output=capture_output,
                text=True,
                encoding='utf-8',
                errors='ignore'
            )

        if capture_output:
            stdout = result.stdout if result.stdout is not None else ""
            stderr = result.stderr if result.stderr is not None else ""
            return result.returncode, stdout, stderr
        return result.returncode, "", ""
    except Exception as e:
        if capture_output:
            return 1, "", str(e)
        return 1, "", ""


def extract_test_results(output):
    """Extract test results from output."""
    lines = output.split('\n') if output else []

    passed = 0
    failed = 0
    failures = []

    for line in lines:
        line = line.strip()
        if '✓' in line or 'pass' in line.lower():
            passed += 1
        if '✗' in line or 'fail' in line.lower():
            failed += 1
            if 'Test' in line or 'test' in line:
                failures.append(line)

    return passed, failed, failures


def format_markdown_output(tests_passed, tests_failed, failures, lint_errors):
    """Format results as markdown."""
    output = []

    if tests_failed == 0 and lint_errors == 0:
        output.append("**Test Results:** ✅ ALL PASSED")
    elif lint_errors > 0:
        output.append("**Test Results:** ❌ LINTING ERRORS")
    else:
        output.append("**Test Results:** ❌ FAILURES DETECTED")
    output.append("")

    output.append("## Summary")
    output.append(f"- **Tests:** {tests_passed} passed, {tests_failed} failed")
    output.append(f"- **Linting:** {lint_errors} issues")
    output.append("")

    if failures:
        output.append("## Failed Tests")
        for f in failures[:10]:
            output.append(f"- {f}")
        if len(failures) > 10:
            output.append(f"- ... and {len(failures) - 10} more")
        output.append("")

    return "\n".join(output)


def run_tests(mode):
    """Run tests based on mode."""
    print("Running tests...")

    if mode == "full":
        print("Test Output:")
        print("------------")
        exit_code = run_command("npx vitest run", capture_output=False)[0]
        return exit_code, [], 0, []
    else:
        exit_code, stdout, stderr = run_command("npx vitest run")
        output = (stdout or "") + (stderr or "")
        passed, failed, failures = extract_test_results(output)
        return exit_code, failures, passed, failed


def run_linting(mode):
    """Run ESLint if available."""
    # Check if eslint is a project dependency (not a global install prompt)
    eslint_bin = Path("node_modules/.bin/eslint")
    eslint_cmd = Path("node_modules/.bin/eslint.cmd")
    if not eslint_bin.exists() and not eslint_cmd.exists():
        print("[INFO] ESLint not installed as project dependency (skipping)")
        return 0, []

    print("Running linting...")

    if mode == "full":
        print("Linting Output:")
        print("--------------")
        exit_code = run_command("npx eslint src/", capture_output=False)[0]
        return exit_code, []
    else:
        exit_code, stdout, stderr = run_command("npx eslint src/")
        output = (stdout or "") + (stderr or "")

        errors = [line.strip() for line in output.split('\n')
                  if line.strip() and 'error' in line.lower()]

        return exit_code, errors


def main():
    parser = argparse.ArgumentParser(
        description="Helm Test Runner"
    )
    parser.add_argument("-v", "--verbose", action="store_true",
                       help="Show all failing test details")
    parser.add_argument("-f", "--full", action="store_true",
                       help="Show ALL output unformatted")

    args = parser.parse_args()

    if args.full:
        mode = "full"
    elif args.verbose:
        mode = "verbose"
    else:
        mode = "markdown"

    # Ensure dependencies are installed
    if not Path("node_modules").exists():
        print("Installing dependencies...")
        run_command("npm install", capture_output=False)
        print()

    # Run tests
    test_exit_code, test_failures, tests_passed, tests_failed = run_tests(mode)

    # Run linting
    lint_exit_code, lint_errors = run_linting(mode)

    # Determine overall success
    overall_success = (test_exit_code == 0 and lint_exit_code == 0)

    if mode == "full":
        print()
        print("=" * 40)
        print("FINAL RESULT: PASS" if overall_success else "FINAL RESULT: FAIL")
        print("=" * 40)

    elif mode == "markdown":
        output = format_markdown_output(
            tests_passed, tests_failed, test_failures, len(lint_errors)
        )
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()

    else:
        if overall_success:
            print("PASS")
        else:
            print("FAILED")
            if test_failures:
                print("\nTest Failures:")
                for f in test_failures[:10]:
                    print(f"  {f}")
            if lint_errors:
                print("\nLinting Errors:")
                for e in lint_errors[:10]:
                    print(f"  {e}")

    return 0 if overall_success else 1


if __name__ == "__main__":
    sys.exit(main())
