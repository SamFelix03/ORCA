# Database schema

**Source of truth:** `schema.prisma` (all models, including LLM deliberation / workflow chain-of-thought).

**First-time setup (empty Postgres):**

```bash
# from repo root
pnpm db:setup
```

That runs `prisma migrate deploy`, which applies `migrations/20260101000000_init/` and creates the **entire** database in one go. New teammates do not run a separate migration for LLM features.

**After pulling schema changes:** run `pnpm db:migrate` if a new folder appears under `migrations/`. If you only changed `schema.prisma` locally during development, use `pnpm --dir api prisma:migrate:dev` to add a new migration before pushing.

**Regenerating the baseline** (maintainers only, when squashing history):

```bash
cd api
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script -o prisma/migrations/20260101000000_init/migration.sql
```

Do not do this on production databases that already applied older migration names without a coordinated reset.
