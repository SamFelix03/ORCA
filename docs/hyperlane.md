KITE -> Base Sepolia

Now adding warp route at filesystem registry at /home/msi/.hyperlane
Done adding warp route at filesystem registry
    tokens:
      - chainName: kitetestnet
        standard: EvmHypCollateral
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0xb0f59799fF2e5a2957185C84fD960a76E0A3c2Cc"
        collateralAddressOrDenom: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"
        connections:
          - token: ethereum|basesepolia|0x2eD22aA87C87E4B0139552d50CB5B049E369C295
      - chainName: basesepolia
        standard: EvmHypSynthetic
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0x2eD22aA87C87E4B0139552d50CB5B049E369C295"
        connections:
          - token: ethereum|kitetestnet|0xb0f59799fF2e5a2957185C84fD960a76E0A3c2Cc

Skipping adding warp route deploy config at github registry (not supported)
Now adding warp route deploy config at filesystem registry at /home/msi/.hyperlane
Done adding warp route deploy config at filesystem registry
⛽️ Gas Usage Statistics
        - Gas required for warp deploy on basesepolia: 0.000040037628035246 ETH
        - Gas required for warp deploy on kitetestnet: 0.1558777 KITE

KITE -> Ethereum Sepolia

✅ Warp contract deployments complete
Start enrolling cross chain routers
Writing deployment artifacts...
Now adding warp route at filesystem registry at /home/msi/.hyperlane
Done adding warp route at filesystem registry
    tokens:
      - chainName: kitetestnet
        standard: EvmHypCollateral
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0x6d67f572a72A1E4CDdDE3F4696E1e7550Ff6d5F1"
        collateralAddressOrDenom: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"
        connections:
          - token: ethereum|sepolia|0x9EC2e54cE40cb44D8986cbDDDB7B728272255C1A
      - chainName: sepolia
        standard: EvmHypSynthetic
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0x9EC2e54cE40cb44D8986cbDDDB7B728272255C1A"
        connections:
          - token: ethereum|kitetestnet|0x6d67f572a72A1E4CDdDE3F4696E1e7550Ff6d5F1

Now adding warp route deploy config at filesystem registry at /home/msi/.hyperlane
Done adding warp route deploy config at filesystem registry
⛽️ Gas Usage Statistics
        - Gas required for warp deploy on kitetestnet: 0.11607894 KITE
        - Gas required for warp deploy on sepolia: 0.000004682918279297 ETH


KITE -> Arbitrum Sepolia

Pending https://testnet.kitescan.ai/tx/0x4c50455b8d2a67840ac478f323e9dffa1abad8331a32a27ac36a10960423e05c (waiting 1 blocks for confirmation)
Pending https://sepolia.arbiscan.io/tx/0xa585bc60658e5e311df28d99ba085cdb0a7123859e20c16b4f844e9cdb9d1a31 (waiting 1 blocks for confirmation)
✅ Warp contract deployments complete
Start enrolling cross chain routers
Writing deployment artifacts...
Now adding warp route at filesystem registry at /home/msi/.hyperlane
Done adding warp route at filesystem registry
    tokens:
      - chainName: kitetestnet
        standard: EvmHypCollateral
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0x2AA2a1264a5a19f7d14Bf8a806f1fdaa12F3E226"
        collateralAddressOrDenom: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"
        connections:
          - token: ethereum|arbitrumsepolia|0xE3CcD4ec6E62b84Aeb4Db49FC50a2Ce9C11D2153
      - chainName: arbitrumsepolia
        standard: EvmHypSynthetic
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0xE3CcD4ec6E62b84Aeb4Db49FC50a2Ce9C11D2153"
        connections:
          - token: ethereum|kitetestnet|0x2AA2a1264a5a19f7d14Bf8a806f1fdaa12F3E226

Now adding warp route deploy config at filesystem registry at /home/msi/.hyperlane
Done adding warp route deploy config at filesystem registry

KITE -> Optimism

✅ Warp contract deployments complete
Start enrolling cross chain routers
Writing deployment artifacts...
Now adding warp route at filesystem registry at /home/msi/.hyperlane
Done adding warp route at filesystem registry
    tokens:
      - chainName: kitetestnet
        standard: EvmHypCollateral
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0x755f38E41c4896239b1f43858d302ea3a265bd5c"
        collateralAddressOrDenom: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"
        connections:
          - token: ethereum|optimismsepolia|0xdD416C32ebA6066c273d5083b1ACa227046Bb5c9
      - chainName: optimismsepolia
        standard: EvmHypSynthetic
        decimals: 18
        symbol: USDT
        name: Test USD
        addressOrDenom: "0xdD416C32ebA6066c273d5083b1ACa227046Bb5c9"
        connections:
          - token: ethereum|kitetestnet|0x755f38E41c4896239b1f43858d302ea3a265bd5c

Now adding warp route deploy config at filesystem registry at /home/msi/.hyperlane
Done adding warp route deploy config at filesystem registry
⛽️ Gas Usage Statistics
        - Gas required for warp deploy on kitetestnet: 0.11607894 KITE
        - Gas required for warp deploy on optimismsepolia: 0.000004683951750542 ETH

## Agent / Hardhat warp (`transfer-hub-to-dest.ts`)

- **`HYPERLANE_INTEGRATION_SNAPSHOT`** — absolute or relative path to an ORCA integration snapshot JSON (`schemaVersion`, `hubChain`, `routes`). Routes must include keys for the asset you bridge, e.g. `USDT/kitetestnet-sepolia`. Older exports may only define `PIEUSD/...`; pointing the env at such a file while setting **`HYP_WARP_ASSET=USDT`** will fail at `getRoute` until you export or hand-edit a snapshot that includes the USDT routes.
- **`HYP_WARP_ASSET`** — route key prefix passed into `getRoute` from the script (defaults to `PIEUSD` if unset). The ORCA executor sets this from its own `HYP_WARP_ASSET` when spawning Hardhat; keep it aligned with the keys in your snapshot.
- **`HYP_DEST`** — snapshot destination slug (e.g. `sepolia`, `arbitrumsepolia`, `optimismsepolia`, `basesepolia`).
- **`AMOUNT`** — amount in **token base units** (uint256 string), same units as `SCOUT_DEFAULT_SUGGESTED_AMOUNT` / stub `deposit` when you use the same integer end-to-end.
