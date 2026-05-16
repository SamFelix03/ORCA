import { ethers } from "hardhat";

/** Read hub RemoteAdapter collateral (immutable) — kite-testnet.latest.json RemoteAdapter */
async function main(): Promise<void> {
  const net = await ethers.provider.getNetwork();
  // eslint-disable-next-line no-console -- CLI
  console.log("chainId", net.chainId);
  const addr = "0xC97B6d4Fc8ab30c95C73D0528bCd48155345322F";
  const code = await ethers.provider.getCode(addr);
  // eslint-disable-next-line no-console -- CLI
  console.log("RemoteAdapter bytecode length (chars)", code.length);

  const ra = await ethers.getContractAt("RemoteAdapter", addr);
  // eslint-disable-next-line no-console -- CLI
  console.log("mailbox", await ra.mailbox());
  // eslint-disable-next-line no-console -- CLI
  console.log("owner", await ra.owner());
  const ts = await ra.trustedSenders(11155111);
  // eslint-disable-next-line no-console -- CLI
  console.log("trustedSenders(11155111)", ts);

  let token: string;
  try {
    token = await ra.collateralToken();
  } catch {
    /** Deploy-time default per deploy.ts: REMOTE_ADAPTER_COLLATERAL_TOKEN || SCOUT_STAKE_TOKEN */
    token = "0x0309764915AFC7a2a7CDd1E64c58a57c1F1705E3";
    // eslint-disable-next-line no-console -- CLI
    console.warn(
      "collateralToken() reverted (RPC/ABI drift); using kite-testnet.deploy default scoutStakeToken:",
      token,
    );
  }
  // eslint-disable-next-line no-console -- CLI
  console.log("Kite RemoteAdapter collateralToken:", token);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
