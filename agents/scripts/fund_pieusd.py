#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys


def main() -> int:
    script_dir = os.path.dirname(__file__)
    target = os.path.join(script_dir, "fund_passport_token.py")
    args = [sys.executable, target, "--token", "PIEUSD", *sys.argv[1:]]
    return subprocess.call(args)


if __name__ == "__main__":
    raise SystemExit(main())
