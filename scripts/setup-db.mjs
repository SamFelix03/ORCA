import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const composeFile = path.join(root, "infra", "docker-compose.yml");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0 && !options.allowFail) {
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

console.log("[setup-db] Starting Postgres + Redis (Docker)…");
const dockerOk = run("docker", ["compose", "-f", composeFile, "up", "-d", "postgres", "redis"], {
  allowFail: true,
});
if (!dockerOk) {
  console.warn("[setup-db] Docker not available — ensure Postgres is running on DATABASE_URL from api/.env");
}

console.log("[setup-db] Applying Prisma migrations (full schema from schema.prisma)…");
const migrateOk = run("pnpm", ["--dir", "api", "prisma:migrate"], { allowFail: true });
if (!migrateOk) {
  console.error("[setup-db] migrate deploy failed. Start Postgres then run: pnpm db:migrate");
  console.error("[setup-db] Fresh DB only needs the init migration in api/prisma/migrations/20260101000000_init/");
  process.exit(1);
}

run("pnpm", ["--dir", "api", "prisma:generate"], { allowFail: true });

console.log("[setup-db] Done. New databases get the complete ORCA schema in one step.");
