# ORCA Contracts (Initial Scaffold)

This package contains the first-pass ORCA contract layer scaffold aligned to the requirements.

## Contracts

- `ORCARegistry.sol`
- `SpendingRuleEnforcer.sol`
- `PoAIAttribution.sol`
- `ORCAOApp.sol` (LayerZero integration stub)

## Kite Network Defaults

- Mainnet chain id: `2366`
- Testnet chain id: `2368`
- Mainnet RPC: `https://rpc.gokite.ai`
- Testnet RPC: `https://rpc-testnet.gokite.ai`
- LayerZero EndpointV2 (mainnet): `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B`

## Notes

- This is intentionally conservative and interface-first.
- Final production contracts will still need audit hardening, auth refinements, and complete LayerZero receive-path logic.
