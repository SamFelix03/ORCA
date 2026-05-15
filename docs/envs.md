env provisioning must match each component, and a few pieces still diverge from “everything works exactly as the architecture implies.”

Dependencies (are they enough?)
Area	What you need
Monorepo
Node 20+, pnpm (workspace uses pnpm@10.19.0). Run pnpm install from repo root.
Python agents
Python ≥ 3.11, then pip install -e . from agents/. Declared deps are in agents/pyproject.toml (redis, web3, httpx, pydantic-settings, etc.).
API
Postgres + Redis reachable from DATABASE_URL / REDIS_URL. pnpm --filter @orca/api prisma:generate (and schema sync via prisma db push or migrations).
Frontend
NEXT_PUBLIC_ORCA_API_BASE_URL / NEXT_PUBLIC_ORCA_WS_URL (see frontend/.env.example).
Contracts
Hardhat toolchain via @orca/contracts (pnpm --filter @orca/contracts build).
Kite Passport / x402
kpass installed and logged in; Scout/Risk/Executor need active Passport sessions for micropayments.
Windows / pnpm caveat: If installs skip lifecycle scripts, Prisma/native addons may misbehave until you allow builds (pnpm approve-builds) or reinstall with scripts enabled—something to verify if Prisma fails at runtime.

Env vars — what must be set
API (api/.env.example is incomplete for strict mode)
With default STRICT_MODE=true, startup requires:

DATABASE_URL, REDIS_URL, JWT_SECRET, WEBHOOK_SECRET
api/.env.example currently omits JWT_SECRET (and doesn’t mention STRICT_MODE). Add strong random values for both secrets.

Agents (agents/.env.example covers Scout heavily but not the other three)
Scout still needs everything it validates (DefiLlama/Goldsky keys for hybrid mode, keys/addresses, X402_*, PoAI, vault/OApp if execution intents are on, etc.).

For Risk / Executor / Audit, you must also set (not all appear in agents/.env.example):

RISK_AGENT_DID, RISK_PRIVATE_KEY
EXECUTOR_AGENT_DID, EXECUTOR_PRIVATE_KEY
AUDIT_AGENT_DID, AUDIT_PRIVATE_KEY
Shared: REDIS_URL, KITE_RPC_URL, KITE_CHAIN_ID, POAI_CONTRACT_ADDRESS, X402_SERVICE_URL, X402_ASSET_ADDRESS, …
Stream keys if non-default: SCOUT_REDIS_STREAM_KEY, RISK_INSTRUCTION_STREAM_KEY, EXECUTION_STREAM_KEY
Important: agents/.env.example still suggests X402_SERVICE_URL can be empty, but X402Client fails fast if there’s no URL when kpass requires --url. Treat X402_SERVICE_URL as required unless you change code/kpass behavior.

Frontend
Only needs API base + WS URL unless you add auth to the UI later.

Will everything “work as intended” end-to-end?
Partially, with correct provisioning—and with these honest gaps:

/auth/verify does not verify signatures. It checks presence of address, signature, nonce and issues a JWT; it does not recover/verify the wallet signature. That is not full SIWE-style security yet.

On-chain execution path: Executor logic is not the full “AA UserOp + OApp + vault execute” described in the plan; chain interaction is still simplified vs a production executor.

PoAI: recordAction only succeeds if your deploy/config matches the contract (e.g. agent DID registered on PoAIAttribution, funded epochs, etc.). Missing registration or wrong epoch will fail at runtime.

Docs vs code: agents/.env.example and strict x402/kpass behavior should be aligned manually (URL requirement, USDC vs PIEUSD for sessions).

Marketplace / BYO: API + DB models exist; on-chain DID verification / stake / payout settlement still depends on your deployed contracts, indexer, and treasury flows—you must wire addresses and operational steps outside “env only.”

Bottom line
Dependencies: Yes—the repo declares what’s needed; install Node/pnpm, Postgres, Redis, Python venv, kpass, and run Prisma generate + DB sync.
Envs: No single file lists everything for API strict mode + all four agents; extend api/.env.example and agents/.env.example with the variables above or you’ll hit startup/runtime failures.
“Everything works as intended”: Only after real endpoints/keys/sessions/contracts match—and with the known gaps (especially JWT without crypto verification and simplified executor on-chain path) resolved if your bar is full production fidelity.
If you want, I can update agents/.env.example and api/.env.example only (no plan file) so they reflect Risk/Executor/Audit + strict API fields and the mandatory X402_SERVICE_URL note—say the word and I’ll patch those files.