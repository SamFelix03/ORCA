export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  kiteRpcUrl: process.env.KITE_RPC_URL ?? "https://rpc-testnet.gokite.ai",
  kiteChainId: Number(process.env.KITE_CHAIN_ID ?? 2368),
  orcaRegistryAddress: process.env.ORCA_REGISTRY_ADDRESS ?? "",
  spendingRuleEnforcerAddress: process.env.SPENDING_RULE_ENFORCER_ADDRESS ?? "",
  poaiAttributionAddress: process.env.POAI_ATTRIBUTION_ADDRESS ?? "",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
};
