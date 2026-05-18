# Kite Passport Feedback (ORCA Integration)

## Context
While integrating ORCA with Kite Passport (dev/testnet flow), we ran into a few recurring issues that slowed testing.  
This note summarizes what happened, our temporary workaround, and suggested product/docs improvements.

---

## 1) Faucet auth-state issue (PIEUSD / KITE funding path)

### Issue observed
- `kpass` faucet flow intermittently failed to recognize active login/auth state (bearer/JWT), even after successful Passport login.
- In practice, this blocked reliable token top-ups through the CLI during dev testing.

### Temporary workaround we used
- We funded wallets via a direct Passport faucet API script that reads JWT from local Passport config and posts to `/v1/faucet/drop`.
- Script used: [`agents/scripts/fund_passport_token.py`](/Users/sam/ORCA/agents/scripts/fund_passport_token.py)
- PIEUSD wrapper used by us: [`agents/scripts/fund_pieusd.py`](/Users/sam/ORCA/agents/scripts/fund_pieusd.py)

### Suggested fix (product side)
- Ensure `kpass` and backend auth/session state are always synchronized after login (especially around token refresh/session persistence).
- Improve faucet command error messaging to explicitly distinguish:
  - expired/missing auth token
  - unsupported token for environment
  - backend auth mismatch
- Consider adding a built-in `kpass auth doctor` (or similar) command that validates current auth/session/JWT state before faucet or execute calls.

---

## 2) `kpass execute` domain allowlisting friction on testnet/dev

### Issue observed
- `kpass agent:session execute` required domain allowlisting even for our own local/test services in testnet workflows.
- This made rapid agent-payment iteration slower and more manual than needed.

### Temporary workaround
- We used an internal path that bypassed discovery/allowlisting for controlled dev testing of micropayment plumbing.

### Suggested fix (product side)
- Add a **dev/testnet mode** option to reduce allowlisting friction for trusted testing scenarios, for example:
  - explicit `--dev-allow-unlisted` style flag, or
  - environment-scoped relaxed policy for localhost/private test domains.
- Keep strong defaults on production/mainnet; only relax behavior when environment is clearly dev/staging.

---

## 3) Documentation gap: dev vs staging Passport behavior

### What we verified from docs (via Kite docs MCP)
- Available docs include:
  - CLI reference: https://docs.gokite.ai/kite-agent-passport/cli-reference
  - chain setup/network pages and faucet links
- CLI examples focus on generic usage and USDC examples.
- We could not find a clear, dedicated guide describing:
  - Passport **dev vs staging** base URLs and expected behavior differences
  - which faucet tokens are supported per environment (e.g., PIEUSD on dev/testnet)
  - auth/session caveats for CLI in dev/staging
  - allowlisting expectations by environment

### Base URLs that should be documented clearly
From practical usage during ORCA integration, the environment-specific endpoints should be clearly and centrally documented (with examples and expected behavior):

- **Passport dev**: `https://passport.dev.gokite.ai`
- **Passport staging**: `https://passport.staging.gokite.ai`
- **Chain RPC testnet**: `https://rpc-testnet.gokite.ai`
- **Chain RPC mainnet**: `https://rpc.gokite.ai`

If any of the above are aliases, temporary, or subject to change, that should be explicitly stated in docs with a “source of truth” page.

### Request
Please add a focused documentation page (or section) for **Passport dev/staging environments**, including:
- environment matrix (dev/staging/mainnet):
  - auth endpoints
  - faucet behavior
  - supported tokens
  - execute/discovery/allowlist policy differences
- recommended commands for developer testing with testnet assets (including PIEUSD)
- common failure cases + troubleshooting checklist.
- explicit examples for setting `KITE_PASSPORT_BASE_URL` and validating active auth/session state before faucet/execute commands.

This would make onboarding and debugging much easier for teams building agent-payment flows.

---

## Closing
Overall, building ORCA on Kite has been a very pleasant experience. The Passport model, agent-session design, and agentic payment primitives are strong foundations and are genuinely useful for real multi-agent workflows.

We are sharing this feedback to help improve an already strong developer platform. We appreciate the Kite team’s work and responsiveness, and we absolutely plan to continue building with Kite.
