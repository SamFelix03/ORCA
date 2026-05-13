import { ethers } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const owner = deployer.address;

  console.log("Deploying contracts with:", owner);

  const registry = await ethers.deployContract("ORCARegistry", [owner]);
  await registry.waitForDeployment();

  const enforcer = await ethers.deployContract("SpendingRuleEnforcer", [owner]);
  await enforcer.waitForDeployment();

  const poai = await ethers.deployContract("PoAIAttribution", [owner]);
  await poai.waitForDeployment();

  console.log("ORCARegistry:", await registry.getAddress());
  console.log("SpendingRuleEnforcer:", await enforcer.getAddress());
  console.log("PoAIAttribution:", await poai.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
