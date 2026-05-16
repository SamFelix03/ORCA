import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

function normalizeBytes32(value: string): string {
  if (ethers.isAddress(value)) {
    return ethers.zeroPadValue(value, 32);
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return value;
  }
  throw new Error(`Invalid trusted endpoint value: ${value}. Use EVM address or bytes32 hex.`);
}

function parseDomainMap(value: string | undefined): Array<{ domain: number; remote: string }> {
  if (!value || !value.trim()) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [domainRaw, remoteRaw] = entry.split(":");
      const domain = Number(domainRaw);
      if (!Number.isInteger(domain) || domain <= 0 || !remoteRaw) {
        throw new Error(`Invalid domain map entry: ${entry}. Expected format domain:0x...`);
      }
      return { domain, remote: normalizeBytes32(remoteRaw.trim()) };
    });
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const owner = process.env.INITIAL_OWNER ?? "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";
  const executorVault = process.env.EXECUTOR_VAULT ?? "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844";
  const treasuryMultisig = process.env.TREASURY_MULTISIG ?? owner;
  const mailboxAddress = process.env.HYP_MAILBOX_KITE;
  const localDomain = Number(process.env.HYP_DOMAIN_KITE ?? "2368");
  const trustedDomain = Number(process.env.HYP_TRUSTED_DOMAIN_BASE_SEPOLIA ?? "84532");
  const trustedRemote = process.env.HYP_TRUSTED_REMOTE_BASE_SEPOLIA;
  const trustedSender = process.env.HYP_TRUSTED_SENDER_KITE;
  const trustedRemotes = parseDomainMap(process.env.HYP_TRUSTED_REMOTES);
  const trustedSenders = parseDomainMap(process.env.HYP_TRUSTED_SENDERS);
  const requiredDestinationDomains = [
    Number(process.env.HYP_DOMAIN_SEPOLIA ?? "11155111"),
    Number(process.env.HYP_DOMAIN_ARBITRUM_SEPOLIA ?? "421614"),
    Number(process.env.HYP_DOMAIN_OPTIMISM_SEPOLIA ?? "11155420"),
    Number(process.env.HYP_DOMAIN_BASE_SEPOLIA ?? "84532"),
  ];
  const bridgeGuardThresholdUsdc = BigInt(process.env.BRIDGE_GUARD_THRESHOLD_USDC ?? "50000000000");
  const spendingWindow = BigInt(process.env.DEFAULT_SPENDING_WINDOW_SECONDS ?? "86400");
  const spendingBudget = BigInt(process.env.DEFAULT_SPENDING_BUDGET_USDC ?? "5000000000");
  const spendingMaxPerTx = BigInt(process.env.DEFAULT_MAX_PER_TX_USDC ?? "500000000");
  const signerListRaw = process.env.MULTISIG_SIGNERS ?? "";
  const multisigSigners = signerListRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const multisigThreshold = Number(process.env.MULTISIG_THRESHOLD ?? (multisigSigners.length > 0 ? "1" : "0"));

  if (!mailboxAddress) {
    throw new Error("Missing required env var HYP_MAILBOX_KITE");
  }
  if (trustedRemotes.length === 0) {
    if (!trustedRemote) {
      throw new Error("Missing required env var HYP_TRUSTED_REMOTE_BASE_SEPOLIA");
    }
    trustedRemotes.push({ domain: trustedDomain, remote: normalizeBytes32(trustedRemote) });
  }
  if (trustedSenders.length === 0) {
    if (!trustedSender) {
      throw new Error("Missing required env var HYP_TRUSTED_SENDER_KITE");
    }
    trustedSenders.push({ domain: localDomain, remote: normalizeBytes32(trustedSender) });
  }
  const remoteDomainSet = new Set(trustedRemotes.map((item) => item.domain));
  const senderDomainSet = new Set(trustedSenders.map((item) => item.domain));
  const missingRemoteDomains = requiredDestinationDomains.filter((domain) => !remoteDomainSet.has(domain));
  const missingSenderDomains = requiredDestinationDomains.filter((domain) => !senderDomainSet.has(domain));
  if (missingRemoteDomains.length > 0) {
    throw new Error(`HYP_TRUSTED_REMOTES missing required domains: ${missingRemoteDomains.join(",")}`);
  }
  if (missingSenderDomains.length > 0) {
    throw new Error(`HYP_TRUSTED_SENDERS missing required domains: ${missingSenderDomains.join(",")}`);
  }

  const scoutStakeToken = process.env.SCOUT_STAKE_TOKEN_ADDRESS?.trim();
  const scoutStakeRecipient =
    process.env.SCOUT_STAKE_RECIPIENT?.trim() || treasuryMultisig;
  if (!scoutStakeToken) {
    throw new Error("Missing required env var SCOUT_STAKE_TOKEN_ADDRESS (ERC20 for BYO scout stake, e.g. testnet USDC)");
  }
  const remoteAdapterCollateral = process.env.REMOTE_ADAPTER_COLLATERAL_TOKEN?.trim() || scoutStakeToken;

  console.log("Deploying contracts with:", owner);

  const registry = await ethers.deployContract("ORCARegistry", [owner, scoutStakeToken, scoutStakeRecipient]);
  await registry.waitForDeployment();

  const enforcer = await ethers.deployContract("SpendingRuleEnforcer", [owner]);
  await enforcer.waitForDeployment();

  const poai = await ethers.deployContract("PoAIAttribution", [owner]);
  await poai.waitForDeployment();

  const bridgeGuard = await ethers.deployContract("LZBridgeGuard", [owner, bridgeGuardThresholdUsdc]);
  await bridgeGuard.waitForDeployment();

  const oapp = await ethers.deployContract("ORCAOApp", [
    owner,
    mailboxAddress,
    executorVault,
    await bridgeGuard.getAddress(),
    localDomain,
  ]);
  await oapp.waitForDeployment();

  const remoteAdapter = await ethers.deployContract("RemoteAdapter", [owner, mailboxAddress, remoteAdapterCollateral]);
  await remoteAdapter.waitForDeployment();

  const x402Manager = await ethers.deployContract("x402ChannelManager", [owner]);
  await x402Manager.waitForDeployment();

  const vault = await ethers.deployContract("ClientAgentVault", [owner, executorVault, await enforcer.getAddress()]);
  await vault.waitForDeployment();

  const treasury = await ethers.deployContract("ORCAMultisigTreasury", [
    owner,
    multisigSigners.length > 0 ? multisigSigners : [treasuryMultisig],
    multisigThreshold > 0 ? multisigThreshold : 1,
  ]);
  await treasury.waitForDeployment();

  await (await enforcer.setVault(await vault.getAddress())).wait();
  await (await enforcer.configureRule(spendingWindow, spendingBudget, spendingMaxPerTx, Math.floor(Date.now() / 1000))).wait();

  await (await bridgeGuard.setAuthorizedCaller(await oapp.getAddress(), true)).wait();
  for (const item of trustedRemotes) {
    await (await oapp.setTrustedRemote(item.domain, item.remote)).wait();
  }
  for (const item of trustedSenders) {
    await (await remoteAdapter.setTrustedSender(item.domain, item.remote)).wait();
  }
  await (await registry.setTreasuryController(treasuryMultisig)).wait();
  await (await poai.setRewardDistributor(treasuryMultisig)).wait();
  await (await treasury.setRegistry(await registry.getAddress())).wait();
  await (await treasury.setPoAI(await poai.getAddress())).wait();

  const artifact = {
    schemaVersion: 1,
    deployedAt: new Date().toISOString(),
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    owner,
    treasuryMultisig,
    executorVault,
    configs: {
      mailboxAddress,
      localDomain: String(localDomain),
      trustedDomain: String(trustedDomain),
      trustedRemote,
      trustedSender,
      trustedRemotes,
      trustedSenders,
      bridgeGuardThresholdUsdc: bridgeGuardThresholdUsdc.toString(),
      spendingWindow: spendingWindow.toString(),
      spendingBudget: spendingBudget.toString(),
      spendingMaxPerTx: spendingMaxPerTx.toString(),
      multisigSigners,
      multisigThreshold,
      scoutStakeToken,
      scoutStakeRecipient,
      remoteAdapterCollateral,
    },
    contracts: {
      ORCARegistry: await registry.getAddress(),
      SpendingRuleEnforcer: await enforcer.getAddress(),
      PoAIAttribution: await poai.getAddress(),
      LZBridgeGuard: await bridgeGuard.getAddress(),
      ORCAOApp: await oapp.getAddress(),
      RemoteAdapter: await remoteAdapter.getAddress(),
      x402ChannelManager: await x402Manager.getAddress(),
      ClientAgentVault: await vault.getAddress(),
      ORCAMultisigTreasury: await treasury.getAddress(),
    },
  };

  const root = path.resolve(__dirname, "..");
  const deploymentsDir = path.join(root, "deployments");
  const historyDir = path.join(deploymentsDir, "history");
  fs.mkdirSync(historyDir, { recursive: true });

  const latestPath = path.join(deploymentsDir, "kite-testnet.latest.json");
  const stamp = artifact.deployedAt.replace(/[:.]/g, "-");
  const historyPath = path.join(historyDir, `${stamp}-kite-testnet.json`);
  fs.writeFileSync(latestPath, JSON.stringify(artifact, null, 2));
  fs.writeFileSync(historyPath, JSON.stringify(artifact, null, 2));

  console.log("ORCARegistry:", artifact.contracts.ORCARegistry);
  console.log("SpendingRuleEnforcer:", artifact.contracts.SpendingRuleEnforcer);
  console.log("PoAIAttribution:", artifact.contracts.PoAIAttribution);
  console.log("LZBridgeGuard:", artifact.contracts.LZBridgeGuard);
  console.log("ORCAOApp:", artifact.contracts.ORCAOApp);
  console.log("RemoteAdapter:", artifact.contracts.RemoteAdapter);
  console.log("x402ChannelManager:", artifact.contracts.x402ChannelManager);
  console.log("ClientAgentVault:", artifact.contracts.ClientAgentVault);
  console.log("ORCAMultisigTreasury:", artifact.contracts.ORCAMultisigTreasury);
  console.log("Deployment artifact written:", latestPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
