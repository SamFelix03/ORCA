# ORCA Production Runbook

## Preflight Checklist
- Confirm env vars are present for all services (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `WEBHOOK_SECRET`, `KITE_RPC_URL`, Passport and x402 config).
- Validate connectivity to Redis, Postgres, Kite RPC, and Passport CLI before starting any service.
- Confirm deployed contract addresses match `contracts/deployments/kite-testnet.latest.json`.
- Verify x402 service endpoint returns transaction hash for execute requests.

## Startup Order
1. Start Redis and Postgres.
2. Run API migrations and start API.
3. Start Scout, Risk, Executor, and Audit agents.
4. Start frontend.
5. Verify websocket events are flowing (`signal.created`, `execution.created`, `execution.settled`).

## Incident Response
- If agent fails preflight, do not restart in degraded mode; fix dependency and restart cleanly.
- If x402 payment response lacks tx hash, halt flow and inspect service provider logs.
- If PoAI write fails, halt execution flow and resolve signer/funding issues before resume.
- If stream lag grows, pause new signal intake and inspect Redis consumer group state.

## Rollback
- Stop agents in reverse order (Audit -> Executor -> Risk -> Scout).
- Revert API and frontend to previous known-good release.
- Keep deployment artifacts immutable; only switch to prior artifact after explicit approval.

## Post-Deploy Smoke
- Create one valid scout signal.
- Observe risk instruction publication with x402 tx hash.
- Observe execution settlement with tx hash.
- Observe audit PoAI write tx hash.
- Confirm API and frontend show the complete lifecycle records.
