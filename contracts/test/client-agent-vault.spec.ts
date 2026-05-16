import { expect } from "chai";
import { ethers } from "hardhat";

describe("ClientAgentVault execute", function () {
  it("bubbles string reverts from the target call", async function () {
    const [owner, exec] = await ethers.getSigners();
    const Enforcer = await ethers.getContractFactory("SpendingRuleEnforcer");
    const enforcer = await Enforcer.deploy(owner.address);
    await enforcer.waitForDeployment();

    const Vault = await ethers.getContractFactory("ClientAgentVault");
    const vault = await Vault.deploy(owner.address, exec.address, await enforcer.getAddress());
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    await (await enforcer.setVault(vaultAddr)).wait();
    await (await enforcer.configureRule(86_400, 10_000_000, 2_000_000, Math.floor(Date.now() / 1000))).wait();

    const Mock = await ethers.getContractFactory("MockBubbleTarget");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    const mockAddr = await mock.getAddress();

    await (await enforcer.setProviderWhitelist(mockAddr, true)).wait();

    await expect(
      vault.connect(exec).execute(mockAddr, 0, mock.interface.encodeFunctionData("revertString"), 0)
    ).to.be.revertedWith("inner reason");
  });

  it("bubbles custom errors from the target call", async function () {
    const [owner, exec] = await ethers.getSigners();
    const Enforcer = await ethers.getContractFactory("SpendingRuleEnforcer");
    const enforcer = await Enforcer.deploy(owner.address);
    await enforcer.waitForDeployment();

    const Vault = await ethers.getContractFactory("ClientAgentVault");
    const vault = await Vault.deploy(owner.address, exec.address, await enforcer.getAddress());
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    await (await enforcer.setVault(vaultAddr)).wait();
    await (await enforcer.configureRule(86_400, 10_000_000, 2_000_000, Math.floor(Date.now() / 1000))).wait();

    const Mock = await ethers.getContractFactory("MockBubbleTarget");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    const mockAddr = await mock.getAddress();

    await (await enforcer.setProviderWhitelist(mockAddr, true)).wait();

    await expect(
      vault.connect(exec).execute(mockAddr, 0, mock.interface.encodeFunctionData("revertCustom"), 0)
    ).to.be.revertedWithCustomError(mock, "SomeCustom");
  });
});
