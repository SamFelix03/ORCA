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
