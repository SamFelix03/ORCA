import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  const spokePath = path.join(__dirname, "..", "deployments", `${network.name}.spoke.json`);
  const spoke = JSON.parse(fs.readFileSync(spokePath, "utf8")) as {
    contracts: { OrcaMorphoBlueStubVault: string };
    underlying: { address: string };
  };
  const stub = spoke.contracts.OrcaMorphoBlueStubVault;
  const abi = [
    "function syncWarpedDeposit()",
    "function principalOf(address) view returns (uint256)",
    "function accountedUnderlying() view returns (uint256)",
    "function underlying() view returns (address)",
  ];
  const c = await ethers.getContractAt(abi, stub);
  const u = await c.underlying();
  const erc20 = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], u);
  console.log(
    JSON.stringify(
      {
        network: network.name,
        stub,
        underlying: u,
        balance: (await erc20.balanceOf(stub)).toString(),
        accounted: (await c.accountedUnderlying()).toString(),
        principal: (await c.principalOf(stub)).toString(),
      },
      null,
      2,
    ),
  );
}

main();
