# ORCA Monorepo Skeleton

This repository is scaffolded as a pnpm workspace for the ORCA project.

## Workspace Layout

- `frontend/` - Next.js app (generated with `create-next-app`)
- `api/` - Backend API service (placeholder)
- `agents/` - Agent runtime services (placeholder)
- `contracts/` - Smart contracts and deployment tooling (placeholder)
- `indexer/` - Goldsky/subgraph integration (placeholder)
- `infra/` - Infrastructure and deployment config (placeholder)
- `packages/` - Shared libraries (placeholder)
- `tests/` - Cross-service integration/e2e tests (placeholder)
- `docs/` - Requirements and architecture docs

## Security Policy for Dependencies

`pnpm-workspace.yaml` enforces:

- `minimumReleaseAge: 20160`
- `minimumReleaseAgeStrict: true`

This ensures new packages must be at least 7 days old before install resolution.

## Frontend Scaffold

The frontend was created using:

`npx create-next-app@latest frontend --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --yes`

## Integration Blueprint

See `docs/ORCA_Kite_Integration_Blueprint.md` for the deep-dive Kite integration architecture and validated implementation boundaries.

## LLM agents + database

All four pipeline agents require `GROQ_API_KEY` in [`agents/.env`](agents/.env) (see [`agents/.env.example`](agents/.env.example)).

| Variable | Where | Purpose |
|----------|--------|---------|
| `GROQ_API_KEY` | `agents/.env` | Mandatory LLM for Scout, Risk, Executor, Audit |
| `ORCA_API_BASE_URL` | `agents/.env` | Risk context + deliberation HTTP (`http://127.0.0.1:4000`) |
| `ORCA_INTERNAL_API_KEY` | `agents/.env` + `api/.env` | Must match on both sides for `/internal/*` routes |

```bash
# First-time (or fresh) database: starts Docker Postgres/Redis and applies the full schema
pnpm db:setup

# Same as db:setup migrate step, if Postgres is already running:
pnpm db:up && pnpm db:migrate

# Run unit tests
pnpm test:agents
pnpm test:api
```

**New clone / new teammate:** run `pnpm db:setup` once. You do **not** need a separate “LLM migration” step — `api/prisma/schema.prisma` is the full model, and `prisma/migrations/20260101000000_init` creates every table (including LLM / chain-of-thought columns) on an empty database.

**Already have a local DB** from an older checkout that applied `20260517120000_add_llm_deliberation`: either reset (`pnpm --dir api exec prisma migrate reset`) or mark the new baseline applied: `pnpm --dir api exec prisma migrate resolve --applied 20260101000000_init` (only if your schema already matches `schema.prisma`).
