# ORCA Contracts

This package contains ORCA control-plane contracts for registry, spending rules, attribution, Hyperlane mailbox routing, and x402 channel primitives.

## Contracts

- `ORCARegistry.sol`
- `SpendingRuleEnforcer.sol`
- `PoAIAttribution.sol`
- `ORCAOApp.sol`
- `LZBridgeGuard.sol`
- `RemoteAdapter.sol`
- `x402ChannelManager.sol`
- `ClientAgentVault.sol`
- `ORCAMultisigTreasury.sol`
- `OrcaStubYieldVaultBase.sol` — shared demo yield accounting
- `OrcaAaveV3StubVault.sol` — Aave V3–shaped `supply` / `withdraw` (interfaces under `interfaces/external/aave-v3/`)
- `OrcaCompoundV3StubVault.sol` — Compound III Comet–shaped `supply` / `withdraw`
- `OrcaMorphoBlueStubVault.sol` — Morpho Blue–shaped `supply`
- `OrcaUniswapV3StubVault.sol` — Uniswap v3 NPM–shaped `mint` (one-sided stub)

## Kite Network Defaults

- Mainnet chain id: `2366`
- Testnet chain id: `2368`
- Mainnet RPC: `https://rpc.gokite.ai`
- Testnet RPC: `https://rpc-testnet.gokite.ai`
- Hyperlane Mailbox (kitetestnet): `0x0d5b681C5887617d68200B45F3947c99Cf402188`
- Hyperlane Mailbox (basesepolia): `0x68e89453029DC14351bF72104dC30248BB766b69`

## Notes

- Deploy order and artifact generation are handled by `scripts/deploy.ts`.
- Deployment outputs are persisted into `deployments/kite-testnet.latest.json` and `deployments/history/`.
- **SpendingRuleEnforcer** only allows `ClientAgentVault.execute` calls to **whitelisted** `target` addresses. Cross-chain intents use **`target = ORCAOApp`**; `deploy.ts` now whitelists the OApp automatically. For an older deployment that hits `EnforcerRejected` (selector `0x458bae4d`), run `pnpm enforcer:whitelist-oapp` from `contracts/` with the owner key in `contracts/.env` (`PRIVATE_KEY` / `DEPLOYER_PRIVATE_KEY`).
- **`vault.executor`** must equal the address derived from **`EXECUTOR_PRIVATE_KEY`** in `agents/.env`. Fresh deploys default `executor` to `INITIAL_OWNER` / `EXEXUTOR_VAULT`; if agents use another key, run `pnpm vault:sync-executor` (owner signs `setExecutor`). To set an explicit address without reading `agents/.env` (e.g. all agents use deployer `0x2514…`): `SYNC_VAULT_EXECUTOR_TO=0x2514... pnpm vault:sync-executor`. Use `pnpm enforcer:diagnose` to print on-chain `vault.executor`, whitelist, and rule.
- **Hyperlane `Mailbox.dispatch` is payable.** `ORCAOApp.executeCrossChainRebalance` quotes `mailbox.quoteDispatch(...)`, forwards that much native Kite on `dispatch{value: fee}`, and refunds any overpayment to the vault. **Older deployments that called `dispatch` with zero value revert inside the mailbox** (often surfaced as vault `ExecutionFailed` / `0xacfdb444` when vault bytecode does not bubble). Redeploy **`ORCAOApp`** and **`ClientAgentVault`** (payable `execute` + `msg.value == value` check) from current `main`, then re-wire (`pnpm oapp:wire-vault`, `enforcer.setVault` if the vault address changed, `pnpm vault:sync-executor` as needed). Agents: keep **`KITE_RPC_URL`** set so Scout can call **`quoteCrossChainRebalanceDispatchFee`** when building cross-chain intents; **`SCOUT_EXECUTION_TX_VALUE_WEI`** remains a floor if you want extra buffer.
- **ORCAOApp.executorVault** must be the **ClientAgentVault** contract address (the only caller of `executeCrossChainRebalance`). Older `deploy.ts` passed the executor EOA here; `deploy.ts` now calls `setExecutorVault(vault)` after vault deploy. For existing deployments run **`pnpm oapp:wire-vault`** once (owner key), or **`pnpm oapp:diagnose`** to confirm on-chain wiring. Do **not** remove the OApp `msg.sender == executorVault` check — it is what prevents arbitrary `mailbox.dispatch` calls. If miswired, you may see **`ExecutionFailed()`** (selector `0xacfdb444`) on older vault bytecode; newer **`ClientAgentVault`** deployments **bubble** the inner revert (e.g. `NotExecutorVault()`, `MissingTrustedRemote()`, enforcer errors) so RPC `eth_estimateGas` / agents show the real cause.

- **Cross-chain E2E (trust + optional warp + vault dispatch + poll Sepolia):** `pnpm e2e:orca-sepolia` (see `scripts/e2e-orca-bridge-and-wait.ts`). Uses `kite-testnet.latest.json`, `sepolia.spoke.json`, and `agents/config/orca-stub-protocols.json`. If the poll times out, check Hyperlane relay and Sepolia **beneficiary** collateral + **`approve(RemoteAdapter)`**.
- **Inspect a vault dispatch tx on Kite:** `VAULT_TX_HASH=0x… pnpm diagnose:orca-dispatch` — decodes `CrossChainRebalanceRequested` and prints **`dispatchId`** (message id) for Hyperlane tooling/explorers.
- **Sepolia delivery prerequisites (read-only):** `pnpm check:sepolia-prereqs` — prints vault Sepolia USDT **balance / allowance** to `RemoteAdapter`, **`trustedSender(2368)`**, and whether the message id is marked processed. Use after a dispatch to see if `handle` can succeed.
- **Fund spoke beneficiary (EOA) before cross-chain pull:** `pnpm prepare:sepolia-e2e` — warp **Kite faucet USDT** (`0x0fF539…` collateral, see `orca-integration.latest.json` `USDT/…` routes) to Sepolia synthetic USDT, then `approve(RemoteAdapter)`. **PIEUSD is payments-only** (marketplace / x402), not this path. The hub **vault** hex often has no contract on Sepolia; E2E defaults **`E2E_SPOKE_BENEFICIARY`** to hub `owner`.

Copy `.env.example` to `.env` and fill **secrets** (`DEPLOYER_PRIVATE_KEY`, optional `RELAYER_PRIVATE_KEY`).

Static settings (RPC URLs, operator addresses, Hyperlane domains/mailboxes/trust maps, deployment addresses, spending policy, relayer defaults) live in [`config/orca.contracts.json`](config/orca.contracts.json). At startup, Hardhat and the in-repo relayer load `.env` first, then fill any **unset** variables from that JSON (`ORCA_CONTRACTS_CONFIG` overrides the file path). Existing `.env` values always win. `HYP_TRUSTED_REMOTES` / `HYP_TRUSTED_SENDERS` are read from the Hyperlane integration snapshot when not set in `.env`.
