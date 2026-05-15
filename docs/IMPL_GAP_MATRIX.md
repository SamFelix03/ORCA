# ORCA implementation vs orcaDocs — gap matrix

This matrix compares [`docs/orcaDocs.md`](orcaDocs.md) (product/architecture narrative) with what this repository implements today. It is meant for operators and contributors reconciling docs with code paths.

| Topic | orcaDocs intent | Repo status | Notes |
| --- | --- | --- | --- |
| Permissionless scout onboarding | DID-bound scouts register with stake pulled on-chain | **Implemented** | `ORCARegistry.registerPermissionlessScout` pulls ERC20 stake; API challenge → EIP-712 attest → calldata → receipt confirm. |
| Scout stake token | Configurable ERC20 + minimum bond | **Implemented** | Immutable token + `minScoutBond` / `stakeRecipient` on registry; deploy script + env wiring. |
| API marketplace persistence | Track pending/active scouts | **Implemented** | Prisma `ScoutMarketplace` + nonce table; serializers expose bond/vault/chain/tx hash. |
| Risk gating | Optional on-chain allowlist for scout DIDs | **Implemented (opt-in)** | Set `ORCA_REGISTRY_ADDRESS` + `KITE_RPC_URL` on Risk; requires `isActiveAgent(keccak256(utf8(DID)))`. |
| Scout self-gate | Scout skips broadcast if not registered | **Implemented (opt-in)** | `SCOUT_REQUIRE_REGISTRY=true` + `ORCA_REGISTRY_ADDRESS` on Scout. |
| Marketplace UI | Wallet-driven registration | **Implemented** | Marketplace page: typed data sign, approve, register tx, confirm. |
| Executor / Audit agents | Full PoAI + settlement flows | **Partial / skeleton** | Agents exist; depth varies vs narrative—verify env contracts and streams per deployment. |
| Production deployments | Single source of truth addresses | **Manual** | Run Hardhat deploy, refresh `deployments/*.json` and service `.env`; not automated in CI here. |
| x402 / Passport | Paid micropayment rails | **Integrated in agents** | Depends on live Passport CLI + x402 endpoints; not exercised without credentials. |

When updating **orcaDocs**, prefer linking to this file or `docs/services.md` for environment variables and route names so the narrative stays aligned with the API and agents.
