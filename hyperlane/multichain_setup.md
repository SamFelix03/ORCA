# Hyperlane Multi-Chain Testnet Setup (Kite Hub)

This runbook extends your existing Kite <-> Base Sepolia setup to:

- Kite <-> Ethereum Sepolia
- Kite <-> Arbitrum Sepolia
- Kite <-> Optimism Sepolia
- Kite <-> Avalanche Fuji

It also stores reusable deployment outputs safely inside `hyperlane/outputs/`.

## 1) Pre-check

From WSL:

```bash
node -v
npm -v
hyperlane --version
docker --version
```

## 2) Ensure chain metadata exists

Reference file in repo:

- `hyperlane/chains.testnet.json`

If a chain is missing in `~/.hyperlane/chains/<chainName>/metadata.yaml`, add it via:

```bash
hyperlane registry init
```

Use these names:

- `kitetestnet`
- `sepolia`
- `arbitrumsepolia`
- `optimismsepolia`
- `fuji`

## 3) Deploy Hyperlane core contracts on each destination chain

Run once per chain:

```bash
hyperlane core init
hyperlane core deploy
```

Select chain in interactive prompt:

- `sepolia`
- `arbitrumsepolia`
- `optimismsepolia`
- `fuji`

Kite is already deployed in your setup.

## 4) Generate/refresh agent config

```bash
hyperlane registry agent-config --chains kitetestnet sepolia arbitrumsepolia optimismsepolia fuji --overrides ~/.hyperlane --out ./configs/agent-config.multichain.json
```

## 5) Deploy warp routes (Kite as hub)

Deploy one route per destination:

- `PIEUSD/kitetestnet-sepolia` (already done)
- `PIEUSD/kitetestnet-arbitrumsepolia`
- `PIEUSD/kitetestnet-optimismsepolia`
- `PIEUSD/kitetestnet-fuji`

For each route:

1. Build config with `hyperlane warp init` or file-based config.
2. Deploy:

```bash
hyperlane warp deploy --warp-route-id <ROUTE_ID> --registry ~/.hyperlane --overrides ~/.hyperlane --yes
```

## 6) Verify message paths

For each destination:

```bash
hyperlane send message --origin kitetestnet --destination <DEST_CHAIN> --relay --registry ~/.hyperlane --overrides ~/.hyperlane
```

## 7) Export safe reusable outputs

From repo root:

```bash
python hyperlane/export_hyperlane_outputs.py
```

This writes timestamped snapshots to:

- `hyperlane/outputs/snapshots/`

Only public deployment data is exported (no private keys).

## 8) Apply to ORCA env/contracts

After each chain/route deployment, update:

- `contracts/.env`:
  - `HYP_TRUSTED_REMOTES` — for **ORCAOApp**, use each chain’s **`RemoteAdapter`** address (32-byte form OK), **not** warp `destinationRouter` from export JSON.
  - `HYP_TRUSTED_SENDERS` — for **RemoteAdapter**, trusted senders are the **hub `ORCAOApp`** addresses (per domain).
- Smoke tests for token bridging: `contracts/scripts/hyperlane/README.md` and `npm run test:hyperlane:smoke` / `hyperlane:*` scripts.

Format:

```txt
HYP_TRUSTED_REMOTES=84532:0x...,11155111:0x...,421614:0x...,11155420:0x...,43113:0x...
HYP_TRUSTED_SENDERS=2368:0x...
```

Values can be EVM addresses or bytes32.
