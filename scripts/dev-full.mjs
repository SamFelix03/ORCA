import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const agentsDir = path.join(root, "agents");
const venvDir = path.join(agentsDir, ".venv");
const venvPython = path.join(venvDir, "bin", "python");
const bootstrapPython = process.env.PYTHON_BIN ?? "python3";

function runStep(name, command, args, options = {}) {
  console.log(`[setup] ${name}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasAgentDependencies(python) {
  const result = spawnSync(
    python,
    ["-c", "import pydantic, redis, web3, httpx, dotenv"],
    { cwd: agentsDir, stdio: "ignore" },
  );
  return result.status === 0;
}

function ensureAgentsVenv() {
  if (!fs.existsSync(venvPython)) {
    runStep("creating agents/.venv", bootstrapPython, ["-m", "venv", venvDir]);
  }

  if (!hasAgentDependencies(venvPython)) {
    runStep("installing agent dependencies", venvPython, ["-m", "pip", "install", "-e", agentsDir]);
  }

  return venvPython;
}

const python = ensureAgentsVenv();

const tasks = [
  { name: "api", command: "pnpm", args: ["--dir", "api", "dev"] },
  { name: "frontend", command: "pnpm", args: ["--dir", "frontend", "dev"] },
  { name: "x402", command: "pnpm", args: ["--filter", "@orca/x402-provider", "dev"] },
  {
    name: "relayer",
    command: "pnpm",
    args: ["--dir", "contracts", "relayer:start"],
    env: { ORCA_API_BASE_URL: process.env.ORCA_API_BASE_URL ?? "http://localhost:4000" },
  },
  { name: "scout", command: python, args: ["-m", "orca_scout.main"], cwd: "agents", env: { PYTHONPATH: "src" } },
  { name: "risk", command: python, args: ["-m", "orca_risk.main"], cwd: "agents", env: { PYTHONPATH: "src" } },
  { name: "executor", command: python, args: ["-m", "orca_executor.main"], cwd: "agents", env: { PYTHONPATH: "src" } },
  { name: "audit", command: python, args: ["-m", "orca_audit.main"], cwd: "agents", env: { PYTHONPATH: "src" } },
];

const children = new Map();

function prefix(name, data, output) {
  const lines = data.toString().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    output.write(`[${name}] ${line}\n`);
  }
}

for (const task of tasks) {
  const child = spawn(task.command, task.args, {
    cwd: task.cwd ?? process.cwd(),
    env: { ...process.env, ...(task.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(task.name, child);
  child.stdout.on("data", (data) => prefix(task.name, data, process.stdout));
  child.stderr.on("data", (data) => prefix(task.name, data, process.stderr));
  child.on("error", (error) => {
    prefix(task.name, `failed to start: ${error.message}`, process.stderr);
  });
  child.on("exit", (code, signal) => {
    prefix(task.name, `exited code=${code ?? ""} signal=${signal ?? ""}`, process.stderr);
  });
}

function shutdown() {
  for (const child of children.values()) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
