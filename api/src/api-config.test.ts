import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyApiConfigDefaults,
  defaultApiConfigPath,
  loadApiConfig,
  toEnvDefaults,
} from "./api-config.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("load committed example config", () => {
  const cfg = loadApiConfig(path.join(apiRoot, "config", "orca.api.example.json"), apiRoot);
  assert.ok(cfg);
  assert.equal(cfg.kiteChainId, 2368);
  assert.equal(cfg.deployments.pieUsd, "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A");
});

test("toEnvDefaults maps deployments and chain RPC", () => {
  const cfg = loadApiConfig(path.join(apiRoot, "config", "orca.api.json"), apiRoot);
  assert.ok(cfg);
  const defaults = toEnvDefaults(cfg);
  assert.equal(defaults.ORCA_REGISTRY_ADDRESS, cfg.deployments.orcaRegistry);
  assert.equal(defaults.PIEUSD_TOKEN_ADDRESS, cfg.deployments.pieUsd);
  assert.ok(defaults.SEPOLIA_RPC_URL?.includes("sepolia"));
  const vaultMap = JSON.parse(defaults.VAULT_HOLDINGS_RPC_MAP ?? "{}") as Record<string, string>;
  assert.equal(vaultMap["421614"], cfg.chainRpcByChainId["421614"]);
});

test("apply respects existing env override", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orca-api-cfg-"));
  const snapCfg = {
    schemaVersion: 1,
    kiteChainId: 2368,
    server: { port: 4000, host: "0.0.0.0", corsOrigin: "http://localhost:3000" },
    deployments: {
      poai: "0x" + "11".repeat(20),
      orcaRegistry: "0x" + "22".repeat(20),
      spendingRuleEnforcer: "0x" + "33".repeat(20),
      scoutStakeToken: "0x" + "44".repeat(20),
      pieUsd: "0x" + "55".repeat(20),
      usdt: "0x" + "66".repeat(20),
    },
    marketplace: {
      scoutStakeDecimals: 6,
      scoutEip712DomainName: "ORCA_BYO_SCOUT",
      pieUsdPurchasePriceWei: "1000000",
    },
    paths: { stubProtocolManifest: "stub.json" },
    chainRpcByChainId: {},
  };
  const cfgPath = path.join(tmp, "orca.api.json");
  fs.writeFileSync(cfgPath, JSON.stringify(snapCfg));

  const prev = process.env.ORCA_REGISTRY_ADDRESS;
  delete process.env.ORCA_REGISTRY_ADDRESS;
  process.env.ORCA_API_CONFIG = cfgPath;
  applyApiConfigDefaults(tmp);
  assert.equal(process.env.ORCA_REGISTRY_ADDRESS, snapCfg.deployments.orcaRegistry);

  process.env.ORCA_REGISTRY_ADDRESS = "0xoverride";
  applyApiConfigDefaults(tmp);
  assert.equal(process.env.ORCA_REGISTRY_ADDRESS, "0xoverride");

  if (prev === undefined) delete process.env.ORCA_REGISTRY_ADDRESS;
  else process.env.ORCA_REGISTRY_ADDRESS = prev;
  delete process.env.ORCA_API_CONFIG;
});

test("missing config file is noop", () => {
  const prev = process.env.PORT;
  delete process.env.PORT;
  process.env.ORCA_API_CONFIG = path.join(os.tmpdir(), "missing-orca-api.json");
  applyApiConfigDefaults(apiRoot);
  assert.equal(process.env.PORT, undefined);
  if (prev === undefined) delete process.env.PORT;
  else process.env.PORT = prev;
  delete process.env.ORCA_API_CONFIG;
});

test("defaultApiConfigPath", () => {
  assert.equal(path.basename(defaultApiConfigPath(apiRoot)), "orca.api.json");
});
