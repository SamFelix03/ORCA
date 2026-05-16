---
name: Privy
description: Use when building authentication systems, creating embedded wallets for users, managing wallet controls and policies, signing transactions, or integrating wallet infrastructure into applications. Reach for Privy when you need to onboard users to crypto, provision self-custodial wallets, implement multi-chain wallet operations, or enforce transaction policies.
metadata:
    mintlify-proj: privy
    version: "1.0"
---

# Privy Skill Reference

## Product summary

Privy is an authentication and wallet infrastructure platform that enables developers to onboard users to crypto applications and manage wallet operations across 50+ blockchains. It provides three interconnected layers: **authentication** (email, SMS, OAuth, passkeys, wallet login), **wallets** (embedded wallets managed by Privy or external wallets users bring), and **controls** (owners, signers, and policies that define who can do what with wallets).

**Key files and commands:**
- Client SDKs: React (`@privy-io/react-auth`), React Native (`@privy-io/expo`), Swift, Android, Flutter, Unity
- Server SDKs: Node.js (`@privy-io/node`), Python, Java, Go, Rust
- REST API: `https://api.privy.io/v1/` with Basic Auth (app ID + app secret)
- Dashboard: Configure apps, login methods, policies, webhooks at `https://dashboard.privy.io`
- Primary docs: https://docs.privy.io

## When to use

**Authentication workflows:** When you need to authenticate users via email, SMS, social login (Google, Discord, Twitter, etc.), passkeys, or wallet-based login. Use Privy's built-in auth or integrate with your existing JWT-based system.

**Wallet creation and management:** When you need to create embedded wallets for users on login, manage wallets server-side via API, or let users connect external wallets (MetaMask, Phantom, etc.).

**Transaction signing and execution:** When you need users to sign transactions, send funds, interact with smart contracts, or perform wallet actions (swaps, transfers, earn deposits).

**Policy enforcement:** When you need to restrict what wallets can do—limit transaction amounts, restrict recipient addresses, control smart contract interactions, or enforce time-based rules.

**Multi-chain operations:** When you need to support Ethereum, Solana, Bitcoin, Tron, Sui, Cosmos, and 40+ other chains from a single wallet interface.

**Server-side wallet control:** When your backend needs to manage wallets, sign transactions, or execute actions without user interaction (trading bots, treasury management, agent wallets).

## Quick reference

### SDK initialization

| Platform | Code |
|----------|------|
| **React** | `<PrivyProvider appId="..." clientId="..." config={{...}}>` |
| **React Native** | `<PrivyProvider appId="..." clientId="..." config={{...}}>` |
| **Node.js** | `new PrivyClient({appId: '...', appSecret: '...'})` |
| **Python** | `PrivyClient(app_id='...', app_secret='...')` |
| **Java** | `PrivyClient.builder().appId("...").appSecret("...").build()` |
| **Go** | `privy.NewClient(appId, appSecret)` |

### API authentication

All REST API calls require:
- **Authorization header:** `Basic {base64(appId:appSecret)}`
- **privy-app-id header:** Your app ID as a string

### Common wallet operations

| Task | Method |
|------|--------|
| Create embedded wallet | `createWallet()` (client) or `wallets().create()` (server) |
| Get wallet | `getWallet()` or `wallets().get()` |
| Send transaction | `sendTransaction()` (EVM) or `sendTransaction()` (Solana) |
| Sign message | `signMessage()` |
| Sign typed data | `signTypedData()` |
| Export private key | `exportPrivateKey()` |
| Get balance | `wallets().getBalance()` |

### Wallet ownership models

| Model | Owner | Use case |
|-------|-------|----------|
| **User-owned** | User ID | Self-custodial consumer wallets |
| **User + server** | User ID + authorization key | Automated trading, limit orders |
| **Application-owned** | Authorization key | Treasury, bots, agents |
| **Custodial** | Licensed custodian | FBO banking-like accounts |

### Login methods

Email, SMS, WhatsApp, Google, Apple, Discord, Twitter, GitHub, LinkedIn, Spotify, Instagram, TikTok, Telegram, Farcaster, passkeys, external wallets (SIWE, SIWS).

## Decision guidance

### When to use embedded wallets vs external wallets

| Scenario | Embedded | External |
|----------|----------|----------|
| New users with no crypto experience | ✓ | ✗ |
| Users already have MetaMask/Phantom | ✗ | ✓ |
| Need seamless onboarding UX | ✓ | ✗ |
| Users want to bring existing assets | ✗ | ✓ |
| Cross-chain support needed | ✓ | Partial |
| User controls keys directly | ✗ | ✓ |

### When to use client-side vs server-side SDKs

| Scenario | Client | Server |
|----------|--------|--------|
| User-initiated transactions | ✓ | ✗ |
| Backend-controlled wallets | ✗ | ✓ |
| Automated trading/bots | ✗ | ✓ |
| User authentication | ✓ | ✗ |
| Wallet creation at scale | ✗ | ✓ |
| Policy enforcement | ✓ | ✓ |

### When to use Privy auth vs JWT-based auth

| Scenario | Privy auth | JWT-based |
|----------|-----------|-----------|
| Need multiple login methods | ✓ | ✗ |
| Already have auth system | ✗ | ✓ |
| Want built-in MFA | ✓ | Manual |
| Integrating wallets only | ✗ | ✓ |
| Social login needed | ✓ | Manual |

## Workflow

### 1. Set up your Privy app

- Create organization at https://dashboard.privy.io
- Create new app and obtain **app ID** and **app secret**
- Configure login methods (email, social, wallet, etc.)
- Set up app clients for different environments if needed
- Configure webhook endpoint for event notifications

### 2. Initialize Privy in your client

- Install SDK: `npm install @privy-io/react-auth` (or your platform)
- Wrap app with `PrivyProvider` with your app ID and config
- Wait for `ready` flag before consuming Privy state
- Configure embedded wallet creation: `createOnLogin: 'users-without-wallets'`

### 3. Authenticate users

- Use `useLogin()` hook or `useLoginWithEmail()`, `useLoginWithOAuth()`, etc.
- Handle login callbacks and check `user` object
- Access user's linked accounts and wallets
- Verify authentication with access tokens if needed

### 4. Create or access wallets

- **Client-side:** Call `createWallet()` from `useCreateWallet()` hook
- **Server-side:** Call `privy.wallets().create({chain_type: 'ethereum', owner: {user_id: '...'}})` 
- Specify owner (user ID or authorization key)
- Optionally attach policies and signers at creation

### 5. Define policies (if needed)

- Create policy via Dashboard or API with rules for each RPC method
- Define conditions: transaction limits, recipient addresses, contract interactions, time windows
- Attach policy to wallet at creation or update
- Test policy evaluation in development

### 6. Execute transactions

- Call `sendTransaction()`, `signMessage()`, or other signing methods
- Policies are evaluated in secure enclave before signing
- Handle errors and check transaction status
- Subscribe to webhooks for transaction lifecycle events

### 7. Monitor and verify

- Set up webhook endpoint to receive user, wallet, and transaction events
- Verify webhook signatures using Privy's signing key
- Log transaction hashes and user actions
- Monitor rate limits and implement exponential backoff

## Common gotchas

**Wallet creation timing:** Automatic wallet creation only works with the Privy login modal, not custom login flows. Use `createWallet()` manually for custom auth.

**Policy defaults:** If a wallet has a policy, it must explicitly allow each RPC method. Missing rules default to DENY. Use wildcard rules carefully: `{"method": "*", "conditions": [], "action": "ALLOW"}` for forward compatibility.

**Rate limits:** REST API calls are rate-limited. Implement exponential backoff on HTTP 429 responses. Batch operations when possible.

**Webhook verification:** Always verify webhook signatures before processing. Privy provides a signing key in the dashboard—use it to validate `X-Privy-Signature` headers.

**Key export security:** Exporting private keys is a sensitive operation. Require MFA or additional user confirmation. Log all exports for audit trails.

**Authorization keys:** Authorization keys are P-256 public keys used to control wallets server-side. Keep app secrets secure—never expose them in client code.

**Idempotency:** Use idempotency keys for wallet creation and other mutations to prevent duplicate operations if requests retry.

**Chain type mismatch:** Policies are chain-specific. An Ethereum policy won't apply to Solana wallets. Create separate policies per chain.

**User vs server ownership:** User-owned wallets require user signatures for actions. Server-owned wallets can act autonomously but lose user control. Choose based on your security model.

**External wallet limitations:** External wallets don't support Privy policies or server-side signing. They're read-only from the server perspective.

## Verification checklist

Before deploying to production:

- [ ] App ID and app secret are stored securely (environment variables, not hardcoded)
- [ ] PrivyProvider wraps your entire app and `ready` flag is checked before using hooks
- [ ] Login methods are configured in dashboard and match your app's UX
- [ ] Embedded wallet creation is configured (automatic or manual)
- [ ] Policies are defined for all wallets that need restrictions
- [ ] Webhook endpoint is registered and signature verification is implemented
- [ ] Error handling is in place for failed transactions and rate limits
- [ ] MFA is enabled for sensitive operations (key export, high-value transactions)
- [ ] Rate limit handling uses exponential backoff
- [ ] All API calls use correct authentication headers (Authorization + privy-app-id)
- [ ] Idempotency keys are used for wallet creation and mutations
- [ ] Wallet ownership model matches your security requirements
- [ ] External wallet connectors are configured if supporting MetaMask/Phantom
- [ ] Test accounts are used in development before production deployment

## Resources

**Comprehensive navigation:** https://docs.privy.io/llms.txt — Full page-by-page listing of all documentation.

**Critical pages:**
- [Key concepts](https://docs.privy.io/basics/key-concepts) — Understand authentication, wallets, and controls
- [API reference](https://docs.privy.io/api-reference/introduction) — REST API endpoints and authentication
- [Controls and policies](https://docs.privy.io/controls/overview) — Design wallet ownership and policy rules

---

> For additional documentation and navigation, see: https://docs.privy.io/llms.txt