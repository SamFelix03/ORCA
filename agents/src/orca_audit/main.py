from __future__ import annotations

import asyncio
from pathlib import Path

from dotenv import load_dotenv

from orca_audit.config import AuditConfig
from orca_audit.runtime import AuditRuntime
from orca_scout.logger import configure_logging


async def _async_main() -> None:
    env_path = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(env_path)
    config = AuditConfig()
    configure_logging(config.log_level)
    runtime = AuditRuntime(config)
    try:
        await runtime.run_forever()
    finally:
        await runtime.close()


def main() -> None:
    asyncio.run(_async_main())


if __name__ == "__main__":
    main()
