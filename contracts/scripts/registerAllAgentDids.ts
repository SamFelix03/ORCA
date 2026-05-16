import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "hardhat";

type DeploymentShape = {
  contracts?: {
    ORCARegistry?: string;
    PoAIAttribution?: string;
  };
};

type AgentSpec = {
  label: "SCOUT" | "RISK" | "EXECUTOR" | "AUDIT";
  did: string;
  privateKey: string;
  agentType: number;
};

type RegistryAgent = {
  vault: string;
  agentType: bigint;
  active: boolean;
  registeredAt: bigint;
  updatedAt: bigint;
};

const ORCA_REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function treasuryController() view returns (address)",
  "function agents(bytes32) view returns (address vault, uint8 agentType, bool active, uint256 registeredAt, uint256 updatedAt)",
  "function registerAgent(bytes32 did, address vault, uint8 agentType)",
  "function setAgentStatus(bytes32 did, bool active)",
  "function setAgentVault(bytes32 did, address newVault)",
  "function isActiveAgent(bytes32 did) view returns (bool)",
];

const POAI_ABI = [
  "function owner() view returns (address)",
  "function registeredAgents(bytes32) view returns (bool)",
  "function setRegisteredAgent(bytes32 agentDID, bool registered)",
];

function must(value: string | undefined, name: string): string {
  const v = (value ?? "").trim();
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function loadDeploymentAddresses(): { registry?: string; poai?: string } {
  const latestPath = path.join(__dirname, "..", "deployments", "kite-testnet.latest.json");
  if (!fs.existsSync(latestPath)) return {};
  const parsed = JSON.parse(fs.readFileSync(latestPath, "utf8")) as DeploymentShape;
  return {
    registry: parsed.contracts?.ORCARegistry,
    poai: parsed.contracts?.PoAIAttribution,
  };
}

async function main(): Promise<void> {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
  dotenv.config({ path: path.join(__dirname, "..", "..", "agents", ".env"), override: true });

  const deployment = loadDeploymentAddresses();
  const registryAddress = ethers.getAddress(
    (process.env.ORCA_REGISTRY_ADDRESS || deployment.registry || "").trim(),
  );
  const poaiAddress = ethers.getAddress(
    (process.env.POAI_CONTRACT_ADDRESS || deployment.poai || "").trim(),
  );

  const specs: AgentSpec[] = [
    {
      label: "SCOUT",
      did: must(process.env.SCOUT_DID, "SCOUT_DID"),
      privateKey: must(process.env.SCOUT_PRIVATE_KEY, "SCOUT_PRIVATE_KEY"),
      agentType: 0,
    },
    {
      label: "RISK",
      did: must(process.env.RISK_AGENT_DID, "RISK_AGENT_DID"),
      privateKey: must(process.env.RISK_PRIVATE_KEY, "RISK_PRIVATE_KEY"),
      agentType: 1,
    },
    {
      label: "EXECUTOR",
      did: must(process.env.EXECUTOR_AGENT_DID, "EXECUTOR_AGENT_DID"),
      privateKey: must(process.env.EXECUTOR_PRIVATE_KEY, "EXECUTOR_PRIVATE_KEY"),
      agentType: 2,
    },
    {
      label: "AUDIT",
      did: must(process.env.AUDIT_AGENT_DID, "AUDIT_AGENT_DID"),
      privateKey: must(process.env.AUDIT_PRIVATE_KEY, "AUDIT_PRIVATE_KEY"),
      agentType: 3,
    },
  ];

  const [signer] = await ethers.getSigners();
  const network = await signer.provider.getNetwork();
  const signerAddr = await signer.getAddress();

  const registry = new ethers.Contract(registryAddress, ORCA_REGISTRY_ABI, signer);
  const poai = new ethers.Contract(poaiAddress, POAI_ABI, signer);

  const registryOwner = ethers.getAddress(await registry.owner());
  const registryTreasury = ethers.getAddress(await registry.treasuryController());
  const poaiOwner = ethers.getAddress(await poai.owner());

  console.log(`network: ${network.name} (${network.chainId})`);
  console.log(`signer: ${signerAddr}`);
  console.log(`ORCARegistry: ${registryAddress}`);
  console.log(`PoAIAttribution: ${poaiAddress}`);
  console.log(`registryOwner: ${registryOwner}`);
  console.log(`registryTreasuryController: ${registryTreasury}`);
  console.log(`poaiOwner: ${poaiOwner}`);

  if (
    ethers.getAddress(signerAddr) !== registryOwner &&
    ethers.getAddress(signerAddr) !== registryTreasury
  ) {
    throw new Error("Signer is not authorized for ORCARegistry (owner/treasuryController required).");
  }
  if (ethers.getAddress(signerAddr) !== poaiOwner) {
    throw new Error("Signer is not owner of PoAIAttribution.");
  }

  for (const spec of specs) {
    const did = spec.did.trim();
    const didHash = ethers.keccak256(ethers.toUtf8Bytes(did));
    const desiredVault = ethers.computeAddress(spec.privateKey);
    console.log(`\n[${spec.label}] did=${did}`);
    console.log(`[${spec.label}] didHash=${didHash}`);
    console.log(`[${spec.label}] desiredVault=${desiredVault}`);

    // PoAI registration
    const poaiRegistered = await poai.registeredAgents(didHash);
    if (!poaiRegistered) {
      console.log(`[${spec.label}] PoAI: registering didHash...`);
      const tx = await poai.setRegisteredAgent(didHash, true);
      console.log(`[${spec.label}] PoAI tx: ${tx.hash}`);
      await tx.wait();
    } else {
      console.log(`[${spec.label}] PoAI: already registered`);
    }

    // ORCARegistry registration/activation
    const current = (await registry.agents(didHash)) as RegistryAgent;
    const isRegistered = current.registeredAt > 0n;
    if (!isRegistered) {
      console.log(`[${spec.label}] Registry: not registered; registering agentType=${spec.agentType}...`);
      const tx = await registry.registerAgent(didHash, desiredVault, spec.agentType);
      console.log(`[${spec.label}] Registry register tx: ${tx.hash}`);
      await tx.wait();
    } else {
      if (!current.active) {
        console.log(`[${spec.label}] Registry: registered but inactive; activating...`);
        const tx = await registry.setAgentStatus(didHash, true);
        console.log(`[${spec.label}] Registry activate tx: ${tx.hash}`);
        await tx.wait();
      } else {
        console.log(`[${spec.label}] Registry: already active`);
      }

      if (ethers.getAddress(current.vault) !== ethers.getAddress(desiredVault)) {
        console.log(
          `[${spec.label}] Registry: vault mismatch (on-chain=${current.vault}); updating to ${desiredVault}...`,
        );
        const tx = await registry.setAgentVault(didHash, desiredVault);
        console.log(`[${spec.label}] Registry setVault tx: ${tx.hash}`);
        await tx.wait();
      } else {
        console.log(`[${spec.label}] Registry: vault already matches`);
      }

      if (Number(current.agentType) !== spec.agentType) {
        console.warn(
          `[${spec.label}] Registry WARNING: on-chain agentType=${current.agentType} differs from desired=${spec.agentType}.`,
        );
      }
    }

    const finalActive = await registry.isActiveAgent(didHash);
    const finalPoai = await poai.registeredAgents(didHash);
    const finalAgent = (await registry.agents(didHash)) as RegistryAgent;
    console.log(
      `[${spec.label}] Final => registryActive=${finalActive} poaiRegistered=${finalPoai} vault=${finalAgent.vault} type=${finalAgent.agentType}`,
    );
  }

  console.log("\nAll DID registrations/activations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

