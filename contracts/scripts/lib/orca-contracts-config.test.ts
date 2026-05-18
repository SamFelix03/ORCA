import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyContractsConfigDefaults,
  contractsDir,
  defaultContractsConfigPath,
  getHyperlaneSnapshotEnvField,
  loadContractsConfig,
  toEnvDefaults,
  trustedRemotesFromCollateralManifest,
} from "./orca-contracts-config.js";

const contractsRoot = contractsDir();

test("load committed example config", () => {
  const cfg = loadContractsConfig(
    path.join(contractsRoot, "config", "orca.contracts.example.json"),
    contractsRoot,
  );
  assert.ok(cfg);
  assert.equal(cfg.hyperlane.domains.kite, 2368);
  assert.equal(cfg.tokens.underlying, "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63");
});

test("snapshot env field for trusted remotes", () => {
  const snap = path.resolve(
    contractsRoot,
    "../hyperlane/outputs/snapshots/orca-integration.latest.json",
  );
  const remotes = getHyperlaneSnapshotEnvField(snap, "HYP_TRUSTED_REMOTES");
  assert.ok(remotes.includes("421614:"));
});

test("toEnvDefaults includes snapshot trust maps", () => {
  const cfg = loadContractsConfig(
    path.join(contractsRoot, "config", "orca.contracts.json"),
    contractsRoot,
  );
  assert.ok(cfg);
  const defaults = toEnvDefaults(cfg, contractsRoot);
  assert.equal(defaults.HYP_MAILBOX_KITE, cfg.hyperlane.mailboxes.kite);
  assert.ok(defaults.HYP_TRUSTED_REMOTES?.includes("421614:"));
  assert.ok(defaults.HYP_TRUSTED_SENDERS?.includes("2368:"));
});

test("collateral manifest builds trusted remotes fallback", () => {
  const coll = path.join(contractsRoot, "config", "orca-collateral.manifest.json");
  const built = trustedRemotesFromCollateralManifest(coll, 2368);
  assert.ok(built.includes("84532:"));
});

test("apply respects env override", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orca-contracts-cfg-"));
  const cfg = {
    schemaVersion: 1,
    rpc: {
      kiteMainnet: "https://kite-mainnet.example",
      kiteTestnet: "https://kite-testnet.example",
      sepolia: "https://sepolia.example",
      arbitrumSepolia: "https://arb.example",
      optimismSepolia: "https://op.example",
      baseSepolia: "https://base.example",
    },
    operators: {
      initialOwner: "0x" + "11".repeat(20),
      executorVault: "0x" + "22".repeat(20),
      treasuryMultisig: "0x" + "33".repeat(20),
      multisigSigners: "0x" + "44".repeat(20),
      multisigThreshold: 1,
    },
    tokens: {
      settlement: "0x" + "55".repeat(20),
      underlying: "0x" + "66".repeat(20),
      scoutStakeToken: "0x" + "77".repeat(20),
    },
    paths: { hyperlaneIntegrationSnapshot: "missing-snap.json" },
    hyperlane: {
      warpAsset: "USDT",
      domains: { kite: 2368, sepolia: 1, arbitrumSepolia: 2, optimismSepolia: 3, baseSepolia: 4 },
      mailboxes: {
        kite: "0x" + "aa".repeat(20),
        sepolia: "0x" + "bb".repeat(20),
        arbitrumSepolia: "0x" + "cc".repeat(20),
        optimismSepolia: "0x" + "dd".repeat(20),
        baseSepolia: "0x" + "ee".repeat(20),
      },
      trustedSenderKite: "0x" + "ff".repeat(20),
      trustedDomainBaseSepolia: 84532,
      trustedRemoteBaseSepolia: "0x" + "ab".repeat(20),
      trustedRemotes: "421614:0xabc",
      trustedSenders: "2368:0xdef",
    },
    policy: {
      bridgeGuardThresholdUsdc: "1",
      defaultSpendingWindowSeconds: "2",
      defaultSpendingBudgetUsdc: "3",
      defaultMaxPerTxUsdc: "4",
    },
  };
  const cfgPath = path.join(tmp, "orca.contracts.json");
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));

  delete process.env.INITIAL_OWNER;
  process.env.ORCA_CONTRACTS_CONFIG = cfgPath;
  applyContractsConfigDefaults(tmp);
  assert.equal(process.env.INITIAL_OWNER, cfg.operators.initialOwner);

  process.env.INITIAL_OWNER = "0xoverride";
  applyContractsConfigDefaults(tmp);
  assert.equal(process.env.INITIAL_OWNER, "0xoverride");

  delete process.env.ORCA_CONTRACTS_CONFIG;
});

test("defaultContractsConfigPath", () => {
  assert.equal(path.basename(defaultContractsConfigPath(contractsRoot)), "orca.contracts.json");
});
