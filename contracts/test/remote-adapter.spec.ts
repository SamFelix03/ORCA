import { expect } from "chai";
import { ethers } from "hardhat";

describe("RemoteAdapter handle", function () {
  const PAYLOAD_VERSION = 2;
  const ORIGIN = 2368;
  const apyBps = 500n;

  it("pulls collateral from beneficiary then depositFor on stub", async function () {
    const [owner, beneficiary, oappAddr] = await ethers.getSigners();
    const oappBytes32 = ethers.zeroPadValue(oappAddr.address, 32);

    const tok = await (await ethers.getContractFactory("TestERC20")).deploy("U", "U", 18);
    await tok.waitForDeployment();
    const token = await tok.getAddress();

    const mail = await (await ethers.getContractFactory("MockMailbox")).deploy();
    await mail.waitForDeployment();
    const mailbox = await mail.getAddress();

    const ra = await (
      await ethers.getContractFactory("RemoteAdapter")
    ).deploy(owner.address, mailbox, token);
    await ra.waitForDeployment();
    const adapter = await ra.getAddress();

    const stub = await (
      await ethers.getContractFactory("OrcaStubYieldVaultBase")
    ).deploy(owner.address, token, apyBps);
    await stub.waitForDeployment();
    const stubAddr = await stub.getAddress();

    const noop = await (await ethers.getContractFactory("NoopISM")).deploy();
    await noop.waitForDeployment();
    await (await ra.setIsm(await noop.getAddress())).wait();
    await (await ra.setTrustedSender(ORIGIN, oappBytes32)).wait();
    expect(await ra.interchainSecurityModule()).to.equal(await noop.getAddress());

    const amount = ethers.parseEther("100");
    await (await tok.mint(beneficiary.address, amount)).wait();
    await (await tok.connect(beneficiary).approve(adapter, amount)).wait();

    const messageId = ethers.keccak256(ethers.toUtf8Bytes("test-msg-1"));
    const body = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "bytes32", "uint32", "address", "address", "address", "uint256", "uint256"],
      [PAYLOAD_VERSION, messageId, ORIGIN, stubAddr, stubAddr, beneficiary.address, amount, 1n],
    );

    await (
      await mail.deliver(adapter, ORIGIN, oappBytes32, body)
    ).wait();

    expect(await stub.principalOf(beneficiary.address)).to.equal(amount);
    expect(await tok.balanceOf(beneficiary.address)).to.equal(0n);
  });

  it("reverts when beneficiary allowance is insufficient", async function () {
    const [owner, beneficiary, oappAddr] = await ethers.getSigners();
    const oappBytes32 = ethers.zeroPadValue(oappAddr.address, 32);

    const tok = await (await ethers.getContractFactory("TestERC20")).deploy("U", "U", 18);
    await tok.waitForDeployment();
    const token = await tok.getAddress();

    const mail = await (await ethers.getContractFactory("MockMailbox")).deploy();
    await mail.waitForDeployment();
    const mailbox = await mail.getAddress();

    const ra = await (await ethers.getContractFactory("RemoteAdapter")).deploy(owner.address, mailbox, token);
    await ra.waitForDeployment();
    const adapter = await ra.getAddress();

    const stub = await (
      await ethers.getContractFactory("OrcaStubYieldVaultBase")
    ).deploy(owner.address, token, apyBps);
    await stub.waitForDeployment();
    const stubAddr = await stub.getAddress();

    await (await ra.setTrustedSender(ORIGIN, oappBytes32)).wait();

    const amount = ethers.parseEther("50");
    await (await tok.mint(beneficiary.address, amount)).wait();
    await (await tok.connect(beneficiary).approve(adapter, ethers.parseEther("10"))).wait();

    const messageId = ethers.keccak256(ethers.toUtf8Bytes("test-msg-2"));
    const body = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "bytes32", "uint32", "address", "address", "address", "uint256", "uint256"],
      [PAYLOAD_VERSION, messageId, ORIGIN, stubAddr, stubAddr, beneficiary.address, amount, 1n],
    );

    await expect(mail.deliver(adapter, ORIGIN, oappBytes32, body)).to.be.reverted;
  });
});
