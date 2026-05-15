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
  jwtSecret: process.env.JWT_SECRET ?? "",
  strictMode: (process.env.STRICT_MODE ?? "true").toLowerCase() === "true",
  scoutStakeDecimals: Number(process.env.SCOUT_STAKE_DECIMALS ?? "6"),
  scoutEip712DomainName: process.env.SCOUT_EIP712_DOMAIN_NAME ?? "ORCA_BYO_SCOUT",
  /** ERC20 scouts must approve before registerPermissionlessScout (same token as registry immutable scoutStakeToken). */
  scoutStakeTokenAddress: process.env.SCOUT_STAKE_TOKEN_ADDRESS ?? "",
};
