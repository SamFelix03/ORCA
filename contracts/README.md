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

## Environment

Copy `.env.example` to `.env` and fill:

- RPC + deploy key (`KITE_*`, `DEPLOYER_PRIVATE_KEY`)
- deployment owner/operator addresses (`INITIAL_OWNER`, `EXECUTOR_VAULT`, `TREASURY_MULTISIG`)
- Hyperlane mailbox/domain/trusted-remote config and bridge threshold controls
- default spending limits for enforcer bootstrapping
