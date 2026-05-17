import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ORCA stub yield vaults", function () {
  const apyBps = 1_000n; // 10% APR stub

  async function deployToken() {
    const Tok = await ethers.getContractFactory("TestERC20");
    const tok = await Tok.deploy("T", "T", 18);
    await tok.waitForDeployment();
    return tok;
  }

  it("base: deposit, accrue, fundRewards, withdraw", async function () {
    const [owner, alice] = await ethers.getSigners();
    const tok = await deployToken();
    const mint = ethers.parseEther("10000");
    await (await tok.mint(alice.address, mint)).wait();
    await (await tok.mint(owner.address, mint)).wait();

    const Base = await ethers.getContractFactory("OrcaStubYieldVaultBase");
    const vault = await Base.deploy(owner.address, await tok.getAddress(), apyBps);
    await vault.waitForDeployment();
    const v = vault.getAddress();

    await (await tok.connect(alice).approve(v, ethers.MaxUint256)).wait();
    await (await vault.connect(alice).deposit(ethers.parseEther("1000"))).wait();

    const p0 = await vault.principalOf(alice.address);
    expect(p0).to.equal(ethers.parseEther("1000"));

    await time.increase(365 * 24 * 60 * 60);
    const y = await vault.accruedYield(alice.address);
    expect(y).to.be.closeTo(ethers.parseEther("100"), ethers.parseEther("1"));

    await (await tok.connect(owner).approve(v, ethers.parseEther("200"))).wait();
    await (await vault.connect(owner).fundRewards(ethers.parseEther("200"))).wait();

    const before = await tok.balanceOf(alice.address);
    await (await vault.connect(alice).withdraw()).wait();
    const after = await tok.balanceOf(alice.address);
    expect(after - before).to.be.closeTo(ethers.parseEther("1100"), ethers.parseEther("2"));
  });

  it("Aave facade: supply + withdraw max", async function () {
    const [owner, u] = await ethers.getSigners();
    const tok = await deployToken();
    await (await tok.mint(u.address, ethers.parseEther("1000"))).wait();
    await (await tok.mint(owner.address, ethers.parseEther("100"))).wait();

    const V = await ethers.getContractFactory("OrcaAaveV3StubVault");
    const vault = await V.deploy(owner.address, await tok.getAddress(), apyBps);
    await vault.waitForDeployment();
    const v = await vault.getAddress();

    await (await tok.connect(u).approve(v, ethers.MaxUint256)).wait();
    await (await vault.connect(u).supply(await tok.getAddress(), ethers.parseEther("500"), u.address, 0)).wait();

    await time.increase(30 * 24 * 60 * 60);
    const y = await vault.accruedYield(u.address);

    await (await tok.connect(owner).approve(v, ethers.parseEther("1000"))).wait();
    await (await vault.connect(owner).fundRewards(y + ethers.parseEther("10"))).wait();

    await (
      await vault
        .connect(u)
        .withdraw(await tok.getAddress(), ethers.MaxUint256, u.address)
    ).wait();
    expect(await vault.principalOf(u.address)).to.equal(0n);
  });

  it("Morpho facade: supply credits onBehalf", async function () {
    const [owner, u, bob] = await ethers.getSigners();
    const tok = await deployToken();
    await (await tok.mint(u.address, ethers.parseEther("100"))).wait();

    const V = await ethers.getContractFactory("OrcaMorphoBlueStubVault");
    const vault = await V.deploy(owner.address, await tok.getAddress(), 0n);
    await vault.waitForDeployment();
    const v = await vault.getAddress();

    await (await tok.connect(u).approve(v, ethers.MaxUint256)).wait();
    const params = {
      loanToken: await tok.getAddress(),
      collateralToken: bob.address,
      oracle: bob.address,
      irm: bob.address,
      lltv: 0n,
    };
    await (await vault.connect(u).supply(params, ethers.parseEther("10"), 0n, bob.address, "0x")).wait();
    expect(await vault.principalOf(bob.address)).to.equal(ethers.parseEther("10"));
  });

  it("syncWarpedDepositFor credits beneficiary not vault address", async function () {
    const [owner, alice] = await ethers.getSigners();
    const tok = await deployToken();
    const mint = ethers.parseEther("100");
    await (await tok.mint(owner.address, mint)).wait();

    const Base = await ethers.getContractFactory("OrcaStubYieldVaultBase");
    const vault = await Base.deploy(owner.address, await tok.getAddress(), 0n);
    await vault.waitForDeployment();
    const v = await vault.getAddress();

    await (await tok.transfer(v, ethers.parseEther("25"))).wait();
    expect(await vault.unaccountedUnderlying()).to.equal(ethers.parseEther("25"));

    await (await vault.connect(owner).syncWarpedDepositFor(alice.address, ethers.parseEther("25"))).wait();
    expect(await vault.principalOf(alice.address)).to.equal(ethers.parseEther("25"));
    expect(await vault.principalOf(v)).to.equal(0n);
    expect(await vault.unaccountedUnderlying()).to.equal(0n);
  });

  it("depositFor pulls from caller (adapter pattern)", async function () {
    const [owner, alice, adapter] = await ethers.getSigners();
    const tok = await deployToken();
    await (await tok.mint(adapter.address, ethers.parseEther("100"))).wait();

    const Base = await ethers.getContractFactory("OrcaStubYieldVaultBase");
    const vault = await Base.deploy(owner.address, await tok.getAddress(), 0n);
    await vault.waitForDeployment();
    const v = await vault.getAddress();

    await (await tok.connect(adapter).approve(v, ethers.parseEther("50"))).wait();
    await (await vault.connect(adapter).depositFor(alice.address, ethers.parseEther("50"))).wait();
    expect(await vault.principalOf(alice.address)).to.equal(ethers.parseEther("50"));
  });
});
