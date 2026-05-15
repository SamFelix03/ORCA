from __future__ import annotations

import asyncio

from orca_common.agents_env import load_agents_dotenv
from orca_risk.config import RiskConfig
from orca_risk.runtime import RiskRuntime
from orca_scout.logger import configure_logging


async def _async_main() -> None:
    load_agents_dotenv()
    config = RiskConfig()
    configure_logging(config.log_level)
    runtime = RiskRuntime(config)
    try:
        await runtime.run_forever()
    finally:
        await runtime.close()


def main() -> None:
    asyncio.run(_async_main())


if __name__ == "__main__":
    main()
