# ORCA x402 provider

HTTP **402** + **`POST /execute`** so ORCA agents can set:

- `X402_SERVICE_URL` — origin only (e.g. `http://127.0.0.1:8099`)
- `X402_EXECUTE_PATH` — default `/execute`

That matches `kpass agent:session execute --url …`.

## Your URL

| Agents `.env` | Full paid resource URL |
|---------------|-------------------------|
| `X402_SERVICE_URL=http://127.0.0.1:8099` | `http://127.0.0.1:8099/execute` |
| `X402_EXECUTE_PATH=/execute` | |

Set **`PUBLIC_RESOURCE_URL`** to that **same** full URL (critical for Passport resource matching). If `kpass` cannot use plain HTTP or localhost, use [ngrok](https://ngrok.com/) and point both `PUBLIC_RESOURCE_URL` and `X402_SERVICE_URL` at the HTTPS tunnel origin.

## Run

From repo root:

```bash
pnpm install
pnpm dev:x402-provider
# or
pnpm --filter @orca/x402-provider dev
```

Copy `.env.example` to `.env` in this folder and edit.

## Environment (summary)

| Variable | Purpose |
|----------|---------|
| `PUBLIC_RESOURCE_URL` | Exact URL `kpass` POSTs to (must match `X402_SERVICE_URL` + path). |
| `X402_PAY_TO` | Merchant payout address (required when `X402_PROVIDER_STUB=false`). |
| `X402_ASSET_ADDRESS` | Kite testnet token (`0x0fF5…063` default). |
| `X402_MAX_AMOUNT_REQUIRED_WEI` | Max amount in token atomic units (`amount` in facilitator terms). |
| `X402_CAIP_NETWORK` | CAIP-2 id for Pieverse `exact` (default **`eip155:2368`** if unset). |
| `KITE_CHAIN_ID` | If set (e.g. `2368`), builds `eip155:<id>` when `X402_CAIP_NETWORK` unset. |
| `FACILITATOR_URL` | Default `https://facilitator.pieverse.io`. |
| `X402_PROVIDER_STUB` | `true` (default): synthetic `txHash` after `X-Payment`. `false`: Pieverse verify/settle. |
| `X402_SKIP_VERIFY` | `true` to skip `POST /v2/verify` (only if verify misbehaves). |
| `X402_DEBUG_PAYMENT_SHAPE` | `true`: log decoded `X-Payment` top-level keys + hash (no raw secrets). |
| `X402_MAX_TIMEOUT_SECONDS` | Payment timeout window (default `300`). |
| `X402_PAYMENT_EXTRA_JSON` | Optional JSON merged into facilitator `paymentRequirements.extra`. |

## Live settlement (Pieverse)

When **`X402_PROVIDER_STUB=false`**:

1. Unpaid `POST /execute` returns **402** with `accepts[]` using **`scheme: exact`** and **`network: eip155:2368`** (Pieverse [`/v2/supported`](https://facilitator.pieverse.io/v2/supported)).
2. Paid request must include **`X-Payment`** (base64 JSON): **x402 v2** shape (`x402Version`, `accepted`, `payload` with `authorization` + `signature`, `resource`) or legacy top-level `{ authorization, signature }`.
3. The server posts to **`POST /v2/verify`** then **`POST /v2/settle`** with body:

```json
{
  "x402Version": 2,
  "paymentPayload": { ... },
  "paymentRequirements": { ... }
}
```

This differs from the short Kite doc `curl` that only shows `{ authorization, signature, network }`; see [docs/x402.md](../../docs/x402.md) (ORCA + Pieverse section).

## Stub mode (default)

`X402_PROVIDER_STUB=true`: first POST → **402**; POST with **`X-Payment`** → **200** `{ "txHash": "0x..." }` (synthetic, no chain). Use with agents **`X402_DRY_RUN=false`** to exercise `kpass` without settlement.

## Manual verification checklist

1. Start Redis and any deps your agents need; set **`agents/.env`** (`X402_SERVICE_URL`, `X402_EXECUTE_PATH`, **`X402_DRY_RUN=false`** when testing real `kpass`).
2. Copy `.env.example` → `.env` here; set **`PUBLIC_RESOURCE_URL`**, **`X402_PAY_TO`**, **`X402_PROVIDER_STUB=false`**.
3. Run **`pnpm dev:x402-provider`** from repo root (or filter `@orca/x402-provider`).
4. `curl -i -X POST http://127.0.0.1:8099/execute -H "Content-Type: application/json" -d "{}"` — expect **402** and `accepts[0].scheme` **`exact`**, `network` **`eip155:2368`** (or your override).
5. Run a Scout scan or `kpass agent:session execute --url <full /execute URL> …` with a funded Passport session.
6. If verify/settle fails: set **`X402_DEBUG_PAYMENT_SHAPE=true`**, retry one paid call, read provider logs for decoded header keys; align `PUBLIC_RESOURCE_URL` and amounts with `agents/.env`.

## Health

`GET /health` → `{ "ok": true }`.
