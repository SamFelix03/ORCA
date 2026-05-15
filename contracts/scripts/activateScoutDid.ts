import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

type RegistryAgent = {
  vault: string;
  agentType: bigint;
  active: boolean;
  registeredAt: bigint;
  updatedAt: bigint;
};

const REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function treasuryController() view returns (address)",
  "function agents(bytes32) view returns (address vault, uint8 agentType, bool active, uint256 registeredAt, uint256 updatedAt)",
  "function isActiveAgent(bytes32 did) view returns (bool)",
  "function registerAgent(bytes32 did, address vault, uint8 agentType)",
  "function setAgentStatus(bytes32 did, bool active)",
];

function loadLatestRegistryAddress(): string {
  const latestPath = path.join(__dirname, "..", "deployments", "kite-testnet.latest.json");
  const raw = fs.readFileSync(latestPath, "utf8");
  const parsed = JSON.parse(raw) as { contracts?: { ORCARegistry?: string } };
  const address = parsed.contracts?.ORCARegistry;
  if (!address) {
    throw new Error("Missing ORCARegistry in deployments/kite-testnet.latest.json");
  }
  return address;
}

async function main(): Promise<void> {
  const [signer] = await ethers.getSigners();
  const did = process.env.SCOUT_DID ?? "did:kite:orca/scout-1";
  const didHash = ethers.keccak256(ethers.toUtf8Bytes(did));
  const registryAddress = process.env.ORCA_REGISTRY_ADDRESS ?? loadLatestRegistryAddress();
  const requestedVault = process.env.SCOUT_VAULT_ADDRESS ?? signer.address;
  const scoutVault = ethers.getAddress(requestedVault);

  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);
  const owner = await registry.owner();
  const treasury = await registry.treasuryController();

  console.log("network:", await signer.provider.getNetwork());
  console.log("signer:", signer.address);
  console.log("registry:", registryAddress);
  console.log("owner:", owner);
  console.log("treasuryController:", treasury);
  console.log("did:", did);
  console.log("didHash:", didHash);
  console.log("targetVault:", scoutVault);

  const agent = (await registry.agents(didHash)) as RegistryAgent;
  const isRegistered = agent.registeredAt > 0n;
  const isActive = isRegistered ? agent.active : false;

  if (!isRegistered) {
    console.log("state: not registered. Registering as SCOUT (AgentType=0)...");
    const tx = await registry.registerAgent(didHash, scoutVault, 0);
    console.log("register tx:", tx.hash);
    await tx.wait();
  } else if (!isActive) {
    console.log("state: registered but inactive. Activating...");
    const tx = await registry.setAgentStatus(didHash, true);
    console.log("activate tx:", tx.hash);
    await tx.wait();
  } else {
    console.log("state: already active. No write needed.");
  }

  const activeNow = await registry.isActiveAgent(didHash);
  const after = (await registry.agents(didHash)) as RegistryAgent;
  console.log("activeNow:", activeNow);
  console.log("vaultNow:", after.vault);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

