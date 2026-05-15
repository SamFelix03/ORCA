from __future__ import annotations

import asyncio

from orca_common.agents_env import load_agents_dotenv
from orca_executor.config import ExecutorConfig
from orca_executor.runtime import ExecutorRuntime
from orca_scout.logger import configure_logging


async def _async_main() -> None:
    load_agents_dotenv()
    config = ExecutorConfig()
    configure_logging(config.log_level)
    runtime = ExecutorRuntime(config)
    try:
        await runtime.run_forever()
    finally:
        await runtime.close()


def main() -> None:
    asyncio.run(_async_main())


if __name__ == "__main__":
    main()
