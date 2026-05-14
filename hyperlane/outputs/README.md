# Hyperlane Outputs Registry

This directory stores reusable, non-secret Hyperlane deployment outputs.

## Files

- `core/`: chain-level core deployment snapshots (mailbox, ism factories, hooks, etc.).
- `warp-routes/`: per-route deployment snapshots and route-level metadata.
- `snapshots/`: aggregated exports generated from local `~/.hyperlane` state.

## Safety Rules

- Never store private keys, mnemonics, or raw signed payloads.
- Store only public addresses, domain IDs, route IDs, and tx hashes.
- Timestamp snapshots so they are auditable and safely reusable.
