import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function apiDir(): string {
  return path.resolve(__dirname, "..");
}

export function defaultApiConfigPath(baseDir?: string): string {
  const root = baseDir ?? apiDir();
  return path.join(root, "config", "orca.api.json");
}

const OrcaApiFileSchema = z.object({
  schemaVersion: z.number(),
  network: z.string().optional(),
  kiteChainId: z.number(),
  server: z.object({
    port: z.number(),
    host: z.string(),
    corsOrigin: z.string(),
  }),
  deployments: z.object({
    poai: z.string(),
    orcaRegistry: z.string(),
    spendingRuleEnforcer: z.string(),
    lzBridgeGuard: z.string().optional(),
    scoutStakeToken: z.string(),
    pieUsd: z.string(),
    usdt: z.string(),
  }),
  marketplace: z.object({
    scoutStakeDecimals: z.number(),
    scoutEip712DomainName: z.string(),
    pieUsdPurchasePriceWei: z.string(),
  }),
  paths: z.object({
    stubProtocolManifest: z.string(),
  }),
  chainRpcByChainId: z.record(z.string()).default({}),
  agents: z
    .object({
      scoutDid: z.string().optional(),
      riskDid: z.string().optional(),
      executorDid: z.string().optional(),
      auditDid: z.string().optional(),
    })
    .optional(),
  redisStreams: z
    .object({
      scoutSignal: z.string().optional(),
      riskInstruction: z.string().optional(),
      execution: z.string().optional(),
      audit: z.string().optional(),
    })
    .optional(),
});

export type OrcaApiFile = z.infer<typeof OrcaApiFileSchema>;

const CHAIN_RPC_ENV_BY_CHAIN_ID: Record<string, string> = {
  "2368": "KITE_RPC_URL",
  "84532": "BASE_SEPOLIA_RPC_URL",
  "421614": "ARBITRUM_SEPOLIA_RPC_URL",
  "11155111": "SEPOLIA_RPC_URL",
  "11155420": "OPTIMISM_SEPOLIA_RPC_URL",
};

function envSet(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function setEnvIfMissing(key: string, value: string): void {
  if (value && !envSet(key)) {
    process.env[key] = value;
  }
}

export function loadApiConfig(configPath?: string, baseDir?: string): OrcaApiFile | null {
  const root = baseDir ?? apiDir();
  const resolved =
    configPath?.trim() ||
    process.env.ORCA_API_CONFIG?.trim() ||
    defaultApiConfigPath(root);
  const filePath = path.isAbsolute(resolved) ? resolved : path.resolve(root, resolved);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  return OrcaApiFileSchema.parse(raw);
}

export function toEnvDefaults(cfg: OrcaApiFile): Record<string, string> {
  const d = cfg.deployments;
  const out: Record<string, string> = {
    PORT: String(cfg.server.port),
    HOST: cfg.server.host,
    CORS_ORIGIN: cfg.server.corsOrigin,
    KITE_CHAIN_ID: String(cfg.kiteChainId),
    POAI_ATTRIBUTION_ADDRESS: d.poai,
    ORCA_REGISTRY_ADDRESS: d.orcaRegistry,
    SPENDING_RULE_ENFORCER_ADDRESS: d.spendingRuleEnforcer,
    SCOUT_STAKE_TOKEN_ADDRESS: d.scoutStakeToken,
    PIEUSD_TOKEN_ADDRESS: d.pieUsd,
    X402_ASSET_ADDRESS: d.pieUsd,
    USDT_TOKEN_ADDRESS: d.usdt,
    ORCA_USDT_ADDRESS: d.usdt,
    SCOUT_STAKE_DECIMALS: String(cfg.marketplace.scoutStakeDecimals),
    SCOUT_EIP712_DOMAIN_NAME: cfg.marketplace.scoutEip712DomainName,
    PIEUSD_PURCHASE_PRICE_WEI: cfg.marketplace.pieUsdPurchasePriceWei,
    ORCA_STUB_PROTOCOL_MANIFEST_PATH: cfg.paths.stubProtocolManifest,
  };

  if (d.lzBridgeGuard) {
    out.LZ_BRIDGE_GUARD_ADDRESS = d.lzBridgeGuard;
  }

  const agents = cfg.agents;
  if (agents?.scoutDid) out.SCOUT_DID = agents.scoutDid;
  if (agents?.riskDid) out.RISK_AGENT_DID = agents.riskDid;
  if (agents?.executorDid) out.EXECUTOR_AGENT_DID = agents.executorDid;
  if (agents?.auditDid) out.AUDIT_AGENT_DID = agents.auditDid;

  const streams = cfg.redisStreams;
  if (streams?.scoutSignal) out.SCOUT_REDIS_STREAM_KEY = streams.scoutSignal;
  if (streams?.riskInstruction) out.RISK_INSTRUCTION_STREAM_KEY = streams.riskInstruction;
  if (streams?.execution) out.EXECUTION_STREAM_KEY = streams.execution;
  if (streams?.audit) out.AUDIT_STREAM_KEY = streams.audit;

  const rpcEntries = Object.entries(cfg.chainRpcByChainId);
  if (rpcEntries.length > 0) {
    const vaultMap: Record<string, string> = {};
    for (const [chainId, url] of rpcEntries) {
      vaultMap[chainId] = url;
      const envKey = CHAIN_RPC_ENV_BY_CHAIN_ID[chainId];
      if (envKey) {
        out[envKey] = url;
      }
    }
    out.VAULT_HOLDINGS_RPC_MAP = JSON.stringify(vaultMap);
  }

  return out;
}

/** Fill unset `process.env` keys from `config/orca.api.json`; existing env always wins. */
export function applyApiConfigDefaults(baseDir?: string): void {
  const cfg = loadApiConfig(undefined, baseDir);
  if (!cfg) return;
  for (const [key, value] of Object.entries(toEnvDefaults(cfg))) {
    setEnvIfMissing(key, value);
  }
}
