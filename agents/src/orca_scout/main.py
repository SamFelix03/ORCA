from __future__ import annotations

import asyncio
from pathlib import Path

from dotenv import load_dotenv

from orca_scout.config import ScoutConfig
from orca_scout.logger import configure_logging
from orca_scout.scout_runtime import ScoutRuntime


async def _async_main() -> None:
    env_path = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(env_path)
    config = ScoutConfig()
    configure_logging(config.log_level)

    runtime = ScoutRuntime(config)
    try:
        await runtime.run_forever()
    finally:
        await runtime.close()


def main() -> None:
    asyncio.run(_async_main())


if __name__ == "__main__":
    main()
