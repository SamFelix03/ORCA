import fs from "node:fs";
import path from "node:path";

export type OrcaContractsFile = {
  schemaVersion: number;
  network?: string;
  defaultDeployNetwork?: string;
  rpc: {
    kiteMainnet: string;
    kiteTestnet: string;
    sepolia: string;
    arbitrumSepolia: string;
    optimismSepolia: string;
    baseSepolia: string;
  };
  operators: {
    initialOwner: string;
    executorVault: string;
    treasuryMultisig: string;
    multisigSigners: string;
    multisigThreshold: number;
  };
  tokens: {
    settlement: string;
    underlying: string;
    scoutStakeToken: string;
  };
  deployments?: {
    orcaRegistry?: string;
    poai?: string;
    orcaOApp?: string;
    clientAgentVault?: string;
    spendingRuleEnforcer?: string;
    lzBridgeGuard?: string;
  };
  paths: {
    hyperlaneIntegrationSnapshot: string;
    collateralManifest?: string;
  };
  hyperlane: {
    warpAsset: string;
    domains: {
      kite: number;
      sepolia: number;
      arbitrumSepolia: number;
      optimismSepolia: number;
      baseSepolia: number;
    };
    mailboxes: {
      kite: string;
      sepolia: string;
      arbitrumSepolia: string;
      optimismSepolia: string;
      baseSepolia: string;
    };
    trustedSenderKite: string;
    trustedDomainBaseSepolia: number;
    trustedRemoteBaseSepolia: string;
    trustedRemotes?: string;
    trustedSenders?: string;
    defaultIsmKite?: string;
    defaultIsmBaseSepolia?: string;
    igpKite?: string;
    igpBaseSepolia?: string;
  };
  policy: {
    bridgeGuardThresholdUsdc: string;
    defaultSpendingWindowSeconds: string;
    defaultSpendingBudgetUsdc: string;
    defaultMaxPerTxUsdc: string;
  };
  relayer?: {
    pollMs?: number;
    logSkips?: string;
    extraRecipients?: string[];
  };
};

/** Resolve `contracts/` package root (Hardhat/relayer/tests run with cwd at or under `contracts/`). */
export function contractsDir(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "config", "orca.contracts.json"))) {
    return cwd;
  }
  const nested = path.join(cwd, "contracts");
  if (fs.existsSync(path.join(nested, "config", "orca.contracts.json"))) {
    return nested;
  }
  throw new Error(
    "Could not locate contracts/ (missing config/orca.contracts.json). Run commands from the contracts package directory.",
  );
}

export function defaultContractsConfigPath(baseDir?: string): string {
  const root = baseDir ?? contractsDir();
  return path.join(root, "config", "orca.contracts.json");
}

function envSet(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function setEnvIfMissing(key: string, value: string | undefined): void {
  if (value?.trim() && !envSet(key)) {
    process.env[key] = value.trim();
  }
}

function resolveConfigPath(relOrAbs: string, contractsRoot: string): string {
  const raw = relOrAbs.trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(contractsRoot, raw);
}

export function getHyperlaneSnapshotEnvField(snapshotPath: string, name: string): string {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    return "";
  }
  try {
    const payload = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as {
      env?: Record<string, string>;
    };
    return String(payload.env?.[name] ?? "").trim();
  } catch {
    return "";
  }
}

export function trustedRemotesFromCollateralManifest(
  collateralPath: string,
  hubChainId = 2368,
): string {
  if (!collateralPath || !fs.existsSync(collateralPath)) {
    return "";
  }
  try {
    const payload = JSON.parse(fs.readFileSync(collateralPath, "utf8")) as {
      remoteAdapterByChainId?: Record<string, string>;
    };
    const adapters = payload.remoteAdapterByChainId;
    if (!adapters || typeof adapters !== "object") {
      return "";
    }
    const parts: string[] = [];
    for (const [chainKey, addr] of Object.entries(adapters).sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    )) {
      const chainId = Number(chainKey);
      if (chainId === hubChainId) continue;
      const address = String(addr).trim();
      if (address) parts.push(`${chainId}:${address}`);
    }
    return parts.join(",");
  } catch {
    return "";
  }
}

export function loadContractsConfig(
  configPath?: string,
  baseDir?: string,
): OrcaContractsFile | null {
  const root = baseDir ?? contractsDir();
  const resolved =
    configPath?.trim() ||
    process.env.ORCA_CONTRACTS_CONFIG?.trim() ||
    defaultContractsConfigPath(root);
  const filePath = path.isAbsolute(resolved) ? resolved : path.resolve(root, resolved);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as OrcaContractsFile;
}

export function toEnvDefaults(cfg: OrcaContractsFile, baseDir?: string): Record<string, string> {
  const root = baseDir ?? contractsDir();
  const rpc = cfg.rpc;
  const op = cfg.operators;
  const hyp = cfg.hyperlane;
  const dom = hyp.domains;
  const mb = hyp.mailboxes;
  const d = cfg.deployments ?? {};

  const out: Record<string, string> = {
    KITE_MAINNET_RPC: rpc.kiteMainnet,
    KITE_TESTNET_RPC: rpc.kiteTestnet,
    SEPOLIA_RPC_URL: rpc.sepolia,
    ARBITRUM_SEPOLIA_RPC_URL: rpc.arbitrumSepolia,
    OPTIMISM_SEPOLIA_RPC_URL: rpc.optimismSepolia,
    BASE_SEPOLIA_RPC_URL: rpc.baseSepolia,
    DEPLOY_NETWORK: cfg.defaultDeployNetwork ?? "kiteTestnet",
    INITIAL_OWNER: op.initialOwner,
    EXECUTOR_VAULT: op.executorVault,
    TREASURY_MULTISIG: op.treasuryMultisig,
    MULTISIG_SIGNERS: op.multisigSigners,
    MULTISIG_THRESHOLD: String(op.multisigThreshold),
    SETTLEMENT_TOKEN: cfg.tokens.settlement,
    ORCA_UNDERLYING_TOKEN: cfg.tokens.underlying,
    SCOUT_STAKE_TOKEN_ADDRESS: cfg.tokens.scoutStakeToken,
    HYP_DOMAIN_KITE: String(dom.kite),
    HYP_DOMAIN_SEPOLIA: String(dom.sepolia),
    HYP_DOMAIN_ARBITRUM_SEPOLIA: String(dom.arbitrumSepolia),
    HYP_DOMAIN_OPTIMISM_SEPOLIA: String(dom.optimismSepolia),
    HYP_DOMAIN_BASE_SEPOLIA: String(dom.baseSepolia),
    HYP_MAILBOX_KITE: mb.kite,
    HYP_MAILBOX_SEPOLIA: mb.sepolia,
    HYP_MAILBOX_ARBITRUM_SEPOLIA: mb.arbitrumSepolia,
    HYP_MAILBOX_OPTIMISM_SEPOLIA: mb.optimismSepolia,
    HYP_MAILBOX_BASE_SEPOLIA: mb.baseSepolia,
    HYP_TRUSTED_SENDER_KITE: hyp.trustedSenderKite,
    HYP_TRUSTED_DOMAIN_BASE_SEPOLIA: String(hyp.trustedDomainBaseSepolia),
    HYP_TRUSTED_REMOTE_BASE_SEPOLIA: hyp.trustedRemoteBaseSepolia,
    HYPERLANE_INTEGRATION_SNAPSHOT: cfg.paths.hyperlaneIntegrationSnapshot,
    HYP_WARP_ASSET: hyp.warpAsset,
    BRIDGE_GUARD_THRESHOLD_USDC: cfg.policy.bridgeGuardThresholdUsdc,
    DEFAULT_SPENDING_WINDOW_SECONDS: cfg.policy.defaultSpendingWindowSeconds,
    DEFAULT_SPENDING_BUDGET_USDC: cfg.policy.defaultSpendingBudgetUsdc,
    DEFAULT_MAX_PER_TX_USDC: cfg.policy.defaultMaxPerTxUsdc,
  };

  if (d.orcaRegistry) out.ORCA_REGISTRY_ADDRESS = d.orcaRegistry;
  if (d.poai) out.POAI_CONTRACT_ADDRESS = d.poai;
  if (d.orcaOApp) out.ORCA_OAPP_ADDRESS = d.orcaOApp;
  if (d.clientAgentVault) out.CLIENT_AGENT_VAULT_ADDRESS = d.clientAgentVault;
  if (d.spendingRuleEnforcer) out.SPENDING_RULE_ENFORCER_ADDRESS = d.spendingRuleEnforcer;
  if (d.lzBridgeGuard) out.LZ_BRIDGE_GUARD_ADDRESS = d.lzBridgeGuard;

  const snapPath = resolveConfigPath(cfg.paths.hyperlaneIntegrationSnapshot, root);
  const collPath = cfg.paths.collateralManifest
    ? resolveConfigPath(cfg.paths.collateralManifest, root)
    : "";

  const remotes =
    getHyperlaneSnapshotEnvField(snapPath, "HYP_TRUSTED_REMOTES") ||
    hyp.trustedRemotes?.trim() ||
    trustedRemotesFromCollateralManifest(collPath, dom.kite);
  if (remotes) {
    out.HYP_TRUSTED_REMOTES = remotes;
  }

  const senders =
    getHyperlaneSnapshotEnvField(snapPath, "HYP_TRUSTED_SENDERS") ||
    hyp.trustedSenders?.trim() ||
    `${dom.kite}:${hyp.trustedSenderKite}`;
  if (senders) {
    out.HYP_TRUSTED_SENDERS = senders;
  }

  if (hyp.defaultIsmKite?.trim()) out.HYP_DEFAULT_ISM_KITE = hyp.defaultIsmKite.trim();
  if (hyp.defaultIsmBaseSepolia?.trim()) out.HYP_DEFAULT_ISM_BASE_SEPOLIA = hyp.defaultIsmBaseSepolia.trim();
  if (hyp.igpKite?.trim()) out.HYP_IGP_KITE = hyp.igpKite.trim();
  if (hyp.igpBaseSepolia?.trim()) out.HYP_IGP_BASE_SEPOLIA = hyp.igpBaseSepolia.trim();

  const relayer = cfg.relayer;
  if (relayer?.pollMs !== undefined) out.RELAYER_POLL_MS = String(relayer.pollMs);
  if (relayer?.logSkips !== undefined) out.RELAYER_LOG_SKIPS = relayer.logSkips;
  if (relayer?.extraRecipients?.length) {
    out.RELAYER_EXTRA_RECIPIENTS = relayer.extraRecipients.join(",");
  }

  return out;
}

/** Fill unset `process.env` keys from `config/orca.contracts.json`; existing env always wins. */
export function applyContractsConfigDefaults(baseDir?: string): void {
  const cfg = loadContractsConfig(undefined, baseDir);
  if (!cfg) return;
  for (const [key, value] of Object.entries(toEnvDefaults(cfg, baseDir))) {
    setEnvIfMissing(key, value);
  }
}
