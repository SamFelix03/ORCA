import { expect } from "chai";
import { ethers } from "hardhat";

describe("ORCA core contracts", function () {
  it("enforces spending rule caps and vault authority", async function () {
    const [owner, vault, provider] = await ethers.getSigners();
    const Enforcer = await ethers.getContractFactory("SpendingRuleEnforcer");
    const enforcer = await Enforcer.deploy(owner.address);
    await enforcer.waitForDeployment();

    await (await enforcer.setVault(vault.address)).wait();
    await (await enforcer.configureRule(86_400, 10_000_000, 2_000_000, Math.floor(Date.now() / 1000))).wait();
    await (await enforcer.setProviderWhitelist(provider.address, true)).wait();

    expect(await enforcer.enforceRules(provider.address, 1_500_000)).to.equal(true);
    expect(await enforcer.enforceRules(provider.address, 2_500_000)).to.equal(false);

    await expect((enforcer.connect(owner) as any).updateSpendingWindow(provider.address, 1_500_000)).to.be.revertedWith(
      "SpendingRuleEnforcer: only vault"
    );
    await expect((enforcer.connect(vault) as any).updateSpendingWindow(provider.address, 1_500_000)).to.not.be.reverted;
  });

  it("gates large bridge actions through bridge guard", async function () {
    const [owner, executor] = await ethers.getSigners();
    const Mailbox = await ethers.getContractFactory("MockMailbox");
    const mailbox = await Mailbox.deploy();
    await mailbox.waitForDeployment();

    const Guard = await ethers.getContractFactory("LZBridgeGuard");
    const guard = await Guard.deploy(owner.address, 50_000_000_000n);
    await guard.waitForDeployment();

    const OApp = await ethers.getContractFactory("ORCAOApp");
    const oapp = await OApp.deploy(
      owner.address,
      await mailbox.getAddress(),
      executor.address,
      await guard.getAddress(),
      2368
    );
    await oapp.waitForDeployment();

    await (await guard.setAuthorizedCaller(await oapp.getAddress(), true)).wait();
    await (await oapp.setTrustedRemote(84532, ethers.zeroPadValue(owner.address, 32))).wait();

    await expect(
      (oapp.connect(executor) as any).executeCrossChainRebalance(
          84532,
          ethers.zeroPadValue(owner.address, 32),
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
          50_000_000_001n,
          "0x"
        )
    ).to.be.revertedWith("LZBridgeGuard: transfer not approved");
  });
});
