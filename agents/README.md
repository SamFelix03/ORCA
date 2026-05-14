# ORCA Agents

This package contains the Scout Agent implementation for ORCA (`AG-01`, modules `SC-01` to `SC-06`).

## Stack

- Python 3.11+
- `asyncio`, `httpx`, `redis`, `web3`, `eth-account`
- LangChain dependency included for future reasoning/tool extensions

## Install

```bash
cd agents
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

Windows PowerShell:

```powershell
cd agents
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
```

## Configure

Copy `.env.example` to `.env` and fill all required live integrations:

- Lucid (`LUCID_*`)
- Goldsky (`GOLDSKY_*`)
- Bridge quote provider (`BRIDGE_FEE_*`)
- Passport CLI + session policy (`PASSPORT_*`)
- x402 payment relay (`X402_*`)
- Kite chain + PoAI contract (`KITE_*`, `POAI_CONTRACT_ADDRESS`)
- Allowed Hyperlane route pairs (`SCOUT_ALLOWED_ROUTE_PAIRS`)
- Optional route auto-load artifact (`SCOUT_ROUTES_ARTIFACT_PATH`)

Additional execution-intent requirements (when `SCOUT_EXECUTION_INTENT_ENABLED=true`):

- `CLIENT_AGENT_VAULT_ADDRESS`
- `ORCA_OAPP_ADDRESS`
- `SCOUT_PROTOCOL_ADDRESS_MAP` (strict CSV format: `chainId:protocol:0xAddress`)
- `HYP_TRUSTED_REMOTES` (strict CSV format: `domain:0xBytes32`)

## Preflight Checklist (Before Run)

- Redis reachable at `REDIS_URL` (`PING` works).
- `kpass` is installed and callable from `PASSPORT_CLI_BIN`.
- `KITE_RPC_URL` is reachable.
- Scout private key wallet has gas on Kite testnet.
- `POAI_CONTRACT_ADDRESS` is deployed and writable by the Scout signer.
- Lucid/Goldsky/Bridge/x402 credentials are valid.
- If using artifact route auto-load, `SCOUT_ROUTES_ARTIFACT_PATH` exists.
- If using execution intents, protocol map + trusted remotes are fully populated.

## Run Scout

```bash
# run from the agents directory so .env + relative artifact path resolve correctly
cd agents
python -m orca_scout.main
```

or:

```bash
orca-scout
```

## Module Map

- `SC-01`: `services/yield_scanner.py` + `integrations/lucid_client.py` / `integrations/goldsky_client.py`
- `SC-02`: `services/bridge_cost_estimator.py` + `integrations/bridge_fee_client.py`
- `SC-03`: `services/opportunity_ranker.py`
- `SC-04`: `services/signal_broadcaster.py` + `integrations/x402_client.py`
- `SC-05`: `services/passport_signer.py` + `integrations/passport_cli.py`
- `SC-06`: `services/poai_reporter.py` + `integrations/poai_client.py`

## Execution Intent Payloads

Scout now emits execution-ready payloads (optional, enabled by default) inside each signal:

- `execution_intent.oapp_calldata`: ABI-encoded call for `ORCAOApp.executeCrossChainRebalance(...)`
- `execution_intent.vault_execute_calldata`: ABI-encoded call for `ClientAgentVault.execute(...)`

These are controlled by:

- `SCOUT_EXECUTION_INTENT_ENABLED`
- `CLIENT_AGENT_VAULT_ADDRESS`
- `ORCA_OAPP_ADDRESS`
- `SCOUT_PROTOCOL_ADDRESS_MAP` (`chainId:protocol:address` CSV)
- `HYP_TRUSTED_REMOTES` (or auto-load from `SCOUT_ROUTES_ARTIFACT_PATH`)

## First Successful Cycle Signals

Expected logs in healthy startup/cycle:

- `Redis preflight OK.`
- `Passport CLI preflight OK.`
- `Kite RPC preflight OK.`
- `Using Passport session: ...`
- `Published signal_id=... event_id=... intent=yes|no poai_tx=...`

Quick troubleshooting:

- Passport errors: verify `PASSPORT_CLI_BIN` and active user auth in `kpass`.
- No opportunities: verify Lucid response shape and route pairs.
- No execution intent: fill `SCOUT_PROTOCOL_ADDRESS_MAP` and `HYP_TRUSTED_REMOTES`.
- Redis stream issues: check `SCOUT_REDIS_STREAM_KEY` and Redis connectivity.
