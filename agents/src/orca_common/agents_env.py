"""Load `agents/.env` from any agent entrypoint regardless of process CWD."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def load_agents_dotenv() -> None:
    """Resolve `agents/` from `agents/src/orca_common/agents_env.py` → parents[2]."""
    agents_dir = Path(__file__).resolve().parents[2]
    load_dotenv(agents_dir / ".env")
