#!/usr/bin/env python3
"""Optional read-only diagnostics. No network or credential access."""
import argparse
import json
import os
import platform
import shutil
import sys
from pathlib import Path


def diagnose(repo=None):
    checks = [
        {"name": "Python", "ok": sys.version_info >= (3, 9), "detail": platform.python_version()},
        {"name": "Git executable", "ok": shutil.which("git") is not None, "detail": shutil.which("git") or "Not on PATH"},
        {"name": "GitHub CLI executable", "ok": shutil.which("gh") is not None, "detail": shutil.which("gh") or "Not on PATH"},
    ]
    if repo:
        folder = Path(repo)
        checks += [
            {"name": "Project folder", "ok": folder.is_dir(), "detail": str(folder)},
            {"name": ".gitignore", "ok": (folder / ".gitignore").is_file(), "detail": "Present" if (folder / ".gitignore").is_file() else "Missing"},
        ]
        if folder.is_dir():
            risky = []
            for f in folder.iterdir():
                if f.is_file() and (f.name.lower().startswith(".env") and f.name.lower() not in (".env.example", ".env.sample") or f.suffix.lower() in (".pem", ".p12", ".pfx")):
                    risky.append(f.name)
            checks.append({"name": "Top-level credential filenames", "ok": not risky, "detail": ", ".join(risky) if risky else "No obvious credential filenames at project root"})
    return {"platform": platform.system(), "checks": checks, "note": "Read-only checks; not a complete security audit."}


def main():
    parser = argparse.ArgumentParser(description="GitHub Push Studio diagnostics")
    parser.add_argument("--repo")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = diagnose(args.repo)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for check in result["checks"]:
            print(("OK" if check["ok"] else "CHECK") + ": " + check["name"] + " — " + check["detail"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
