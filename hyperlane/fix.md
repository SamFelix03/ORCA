> **Resolved in-repo:** use `contracts/relayer` (`pnpm relayer:start` / `relayer:once`) and spoke `NoopISM` on `RemoteAdapter`. See `contracts/AGENTIC_FLOW.md`.

relay.js:
/**
 * Deep ISM Inspector
 * Figures out exactly why ISM verification is failing
 */

import { ethers } from "ethers";

const SEPOLIA_RPC     = "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_MAILBOX = "0xCDF3D9c1E132e4b37A362CF0f11f384b673Aa908";
const STUB_RECIPIENT  = "0x7F9D7362ad621B3EDC9b77370855a6f4AcA9cDd2";
const ISM_ADDR        = "0x19070b013b86DeE94D8bF854E9810717ed9095BB";
const KITE_DOMAIN     = 2368;

// The actual message bytes from your Dispatch event — paste full bytes here
// Get it by running: node get-message.js  (see below)
const MESSAGE_BYTES = null; // ← we'll fetch it dynamically below

const KITE_RPC        = "https://rpc-testnet.gokite.ai";
const KITE_MAILBOX    = "0x0d5b681C5887617d68200B45F3947c99Cf402188";

// ─── ABIs ────────────────────────────────────────────────────────────────────

const MAILBOX_ABI = [
  "event Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)",
  "function delivered(bytes32 messageId) external view returns (bool)",
  "function recipientIsm(address recipient) external view returns (address)",
  "function defaultIsm() external view returns (address)",
  "function process(bytes calldata metadata, bytes calldata message) external payable",
];

// Try every possible ISM interface
const ISM_ABI_FULL = [
  "function moduleType() external view returns (uint8)",
  "function verify(bytes calldata metadata, bytes calldata message) external returns (bool)",
  // MultisigISM
  "function validators(uint32 domain) external view returns (address[])",
  "function threshold(uint32 domain) external view returns (uint8)",
  "function validatorsAndThreshold(bytes calldata message) external view returns (address[], uint8)",
  // RoutingISM
  "function route(bytes calldata message) external view returns (address)",
  // AggregationISM
  "function modulesAndThreshold(bytes calldata message) external view returns (address[], uint8)",
  // AbstractMultisigISM
  "function getValidatorSet(uint32 domain) external view returns (address[], uint8)",
];

const MODULE_TYPES = {
  0: "UNUSED",
  1: "ROUTING",
  2: "AGGREGATION",
  3: "LEGACY_MULTISIG",
  4: "MERKLE_ROOT_MULTISIG",
  5: "MESSAGE_ID_MULTISIG",
  6: "NULL / NO-OP",
  7: "CCIP_READ",
};

function section(t) {
  console.log(`\n${"━".repeat(60)}\n  ${t}\n${"━".repeat(60)}`);
}

async function tryCall(label, fn) {
  try {
    const r = await fn();
    console.log(`  ✅ ${label}: ${JSON.stringify(r)}`);
    return r;
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.reason || e.message.slice(0, 100)}`);
    return null;
  }
}

async function fetchFirstMessageToStub(kiteProvider) {
  console.log("\n📡 Fetching Dispatch events from Kite mailbox...");
  const mailbox = new ethers.Contract(KITE_MAILBOX, MAILBOX_ABI, kiteProvider);
  const latest  = await kiteProvider.getBlockNumber();
  const from    = latest - 5000;

  const events = await mailbox.queryFilter(mailbox.filters.Dispatch(), from, latest);
  console.log(`  Found ${events.length} total Dispatch events`);

  const stubBytes32 = STUB_RECIPIENT.toLowerCase().replace("0x", "").padStart(64, "0");
  const stubEvents  = events.filter(e =>
    e.args.recipient.toLowerCase().slice(2) === stubBytes32 ||
    e.args.recipient.toLowerCase().includes(STUB_RECIPIENT.slice(2).toLowerCase())
  );

  console.log(`  Found ${stubEvents.length} message(s) to your stub contract`);
  return stubEvents.map(e => ({
    msgBytes: e.args.message,
    msgId:    ethers.keccak256(e.args.message),
    block:    e.blockNumber,
  }));
}

function decodeMessage(msgBytes) {
  const d = ethers.getBytes(msgBytes);
  return {
    version:     d[0],
    nonce:       (d[1]<<24)|(d[2]<<16)|(d[3]<<8)|d[4],
    origin:      (d[5]<<24)|(d[6]<<16)|(d[7]<<8)|d[8],
    sender:      ethers.hexlify(d.slice(9,41)),
    destination: (d[41]<<24)|(d[42]<<16)|(d[43]<<8)|d[44],
    recipient:   ethers.hexlify(d.slice(45,77)),
    body:        ethers.hexlify(d.slice(77)),
  };
}

async function inspectIsm(sepoliaProvider, sepoliaMailbox, msgBytes) {
  section("1. ISM Identity & Type");

  const ism = new ethers.Contract(ISM_ADDR, ISM_ABI_FULL, sepoliaProvider);

  const moduleType = await tryCall("moduleType()", () => ism.moduleType());
  if (moduleType !== null) {
    console.log(`  📋 Declared type: ${MODULE_TYPES[Number(moduleType)] || "UNKNOWN"} (${moduleType})`);
  }

  // Check bytecode size
  const code = await sepoliaProvider.getCode(ISM_ADDR);
  console.log(`  📦 Bytecode size: ${(code.length - 2) / 2} bytes`);
  if (code === "0x") {
    console.log("  ❌ NO CODE AT THIS ADDRESS — ISM is not deployed!");
    return;
  }

  section("2. ISM verify() with different metadata");

  // Try empty metadata
  await tryCall("verify(0x, message)", () => ism.verify("0x", msgBytes));

  // Try with a fake 32-byte metadata
  await tryCall("verify(0x00..32bytes, message)", () =>
    ism.verify(ethers.ZeroPadBytes("0x00", 32), msgBytes));

  section("3. MultisigISM checks (if applicable)");
  await tryCall(`validators(${KITE_DOMAIN})`, () => ism.validators(KITE_DOMAIN));
  await tryCall(`threshold(${KITE_DOMAIN})`,  () => ism.threshold(KITE_DOMAIN));
  await tryCall("validatorsAndThreshold(msg)", () => ism.validatorsAndThreshold(msgBytes));
  await tryCall("getValidatorSet(kite)",       () => ism.getValidatorSet(KITE_DOMAIN));

  section("4. RoutingISM / AggregationISM checks");
  await tryCall("route(message)",              () => ism.route(msgBytes));
  await tryCall("modulesAndThreshold(msg)",    () => ism.modulesAndThreshold(msgBytes));

  section("5. Mailbox defaultIsm vs recipientIsm");
  const defaultIsm    = await tryCall("mailbox.defaultIsm()",            () => sepoliaMailbox.defaultIsm());
  const recipientIsm  = await tryCall("mailbox.recipientIsm(stub)",      () => sepoliaMailbox.recipientIsm(STUB_RECIPIENT));

  if (defaultIsm && recipientIsm) {
    if (defaultIsm.toLowerCase() === recipientIsm.toLowerCase()) {
      console.log("  ℹ️  Stub uses mailbox defaultIsm (no custom ISM set on stub contract)");
    } else {
      console.log("  ℹ️  Stub has a CUSTOM ISM overriding the mailbox default");
    }
  }

  section("6. Simulate process() and decode revert");
  try {
    await sepoliaProvider.call({
      to:   SEPOLIA_MAILBOX,
      data: sepoliaMailbox.interface.encodeFunctionData("process", ["0x", msgBytes]),
    });
    console.log("  ✅ Simulation PASSED — safe to send!");
  } catch (err) {
    console.log(`  ❌ Simulation reverted`);

    // Decode revert data
    const data = err.data || err.error?.data;
    if (data && data !== "0x") {
      console.log(`  Raw revert data: ${data}`);
      // Try Error(string)
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["string"], "0x" + data.slice(10)
        );
        console.log(`  Revert reason (string): "${decoded[0]}"`);
      } catch {}
      // Try known selectors
      const selector = data.slice(0, 10);
      console.log(`  Revert selector: ${selector}`);
    } else {
      console.log(`  No revert data returned (bare revert or require(false))`);
      console.log(`  Full error: ${err.message?.slice(0, 200)}`);
    }
  }
}

async function inspectStubContract(sepoliaProvider) {
  section("7. Stub Contract Inspection");
  console.log(`  Address: ${STUB_RECIPIENT}`);

  const code = await sepoliaProvider.getCode(STUB_RECIPIENT);
  console.log(`  Bytecode size: ${(code.length - 2) / 2} bytes`);

  if (code === "0x") {
    console.log("  ❌ NO CONTRACT at this address on Sepolia!");
    return;
  }

  // Try to call handle() directly to see if it reverts
  const HANDLE_ABI = [
    "function handle(uint32 origin, bytes32 sender, bytes calldata message) external payable",
    "function interchainSecurityModule() external view returns (address)",
  ];
  const stub = new ethers.Contract(STUB_RECIPIENT, HANDLE_ABI, sepoliaProvider);
  await tryCall("interchainSecurityModule()", () => stub.interchainSecurityModule());

  // Simulate handle() directly
  try {
    await sepoliaProvider.call({
      to:   STUB_RECIPIENT,
      data: stub.interface.encodeFunctionData("handle", [
        KITE_DOMAIN,
        ethers.zeroPadValue("0x1234", 32),
        "0x",
      ]),
    });
    console.log("  ✅ handle() simulation passed");
  } catch (e) {
    console.log(`  ❌ handle() reverts: ${e.reason || e.message?.slice(0, 100)}`);
  }
}

async function main() {
  console.log("🔬 Deep ISM + Stub Inspector");

  const kiteProvider    = new ethers.JsonRpcProvider(KITE_RPC);
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const sepoliaMailbox  = new ethers.Contract(SEPOLIA_MAILBOX, MAILBOX_ABI, sepoliaProvider);

  // Fetch the actual message bytes from Kite
  const messages = await fetchFirstMessageToStub(kiteProvider);
  if (messages.length === 0) {
    console.log("❌ No messages found to stub contract. Has transfer.js been run?");
    return;
  }

  const { msgBytes, msgId, block } = messages[messages.length - 1]; // use most recent
  console.log(`\n  Using message: ${msgId.slice(0, 20)}... (block ${block})`);

  const decoded = decodeMessage(msgBytes);
  console.log(`  Decoded — origin: ${decoded.origin}, dest: ${decoded.destination}`);
  console.log(`  Body: ${decoded.body.slice(0, 66)}...`);

  const delivered = await sepoliaMailbox.delivered(msgId);
  console.log(`  Delivered: ${delivered}`);

  await inspectIsm(sepoliaProvider, sepoliaMailbox, msgBytes);
  await inspectStubContract(sepoliaProvider);

  section("8. SUMMARY");
  console.log("  Check the results above for:");
  console.log("  • Section 2: which metadata format makes verify() return true");
  console.log("  • Section 6: exact revert reason from process()");
  console.log("  • Section 7: whether handle() itself is the problem");
}

main().catch(e => {
  console.error("❌ Inspector failed:", e.message);
  process.exit(1);
});

node relay.js
🔬 Deep ISM + Stub Inspector

📡 Fetching Dispatch events from Kite mailbox...
  Found 17 total Dispatch events
  Found 9 message(s) to your stub contract

  Using message: 0xcdf965df29d3725bd2... (block 21443649)
  Decoded — origin: 2368, dest: 11155111
  Body: 0x0000000000000000000000000000000000000000000000000000000000000002...
  Delivered: false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. ISM Identity & Type
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ moduleType(): Do not know how to serialize a BigInt
  📦 Bytecode size: 1075 bytes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  2. ISM verify() with different metadata
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ verify(0x, message): contract runner does not support sending transactions (operation="sendTransaction", code=UNSUPPORTED
  ❌ verify(0x00..32bytes, message): ethers.ZeroPadBytes is not a function

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3. MultisigISM checks (if applicable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ validators(2368): require(false)
  ❌ threshold(2368): require(false)
  ❌ validatorsAndThreshold(msg): require(false)
  ❌ getValidatorSet(kite): require(false)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4. RoutingISM / AggregationISM checks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ route(message): require(false)
  ❌ modulesAndThreshold(msg): require(false)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  5. Mailbox defaultIsm vs recipientIsm
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ mailbox.defaultIsm(): "0x19070b013b86DeE94D8bF854E9810717ed9095BB"
  ✅ mailbox.recipientIsm(stub): "0x19070b013b86DeE94D8bF854E9810717ed9095BB"
  ℹ️  Stub uses mailbox defaultIsm (no custom ISM set on stub contract)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  6. Simulate process() and decode revert
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ❌ Simulation reverted
  Raw revert data: 0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000204d61696c626f783a2049534d20766572696669636174696f6e206661696c6564
  Revert reason (string): "Mailbox: ISM verification failed"
  Revert selector: 0x08c379a0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  7. Stub Contract Inspection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Address: 0x7F9D7362ad621B3EDC9b77370855a6f4AcA9cDd2
  Bytecode size: 3392 bytes
  ❌ interchainSecurityModule(): require(false)
  ❌ handle() reverts: RemoteAdapter: mailbox only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  8. SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Check the results above for:
  • Section 2: which metadata format makes verify() return true
  • Section 6: exact revert reason from process()
  • Section 7: whether handle() itself is the problem
PS C:\Users\MSI\Desktop\hyperlaneTest\relayer> ^C

I got this output for that script which basically is a relay of our own trying to send the message. 

Looking at your output and contract, I can see two distinct problems:
Problem 1: ISM Verification Failing ("Mailbox: ISM verification failed")
The ISM at 0x19070b013b86DeE94D8bF854E9810717ed9095BB is the Sepolia mailbox's default ISM, and it's rejecting your message with empty metadata. This is almost certainly a Multisig ISM that requires validator signatures as metadata — you can't just call process("0x", message).
The moduleType() call failed with a BigInt serialization error (a bug in the inspector script, not the ISM). The multisig calls all returned require(false), which means the ISM doesn't recognize Kite's domain (2368) — no validators are enrolled for that domain.
Root cause: The Sepolia default ISM has no validator set configured for Kite chain (domain 2368), so it can never verify messages from it.
Fix options:

Deploy your own ISM (e.g. a NoopISM / TrustedRelayerISM) and point your RemoteAdapter to it
Or use a StaticTrustedRelayerISM which just checks msg.sender == trustedRelayer

The simplest fix for testing — deploy a NoopISM and have RemoteAdapter return it via interchainSecurityModule():
solidity// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NoopISM {
    function moduleType() external pure returns (uint8) { return 6; } // NULL type
    function verify(bytes calldata, bytes calldata) external pure returns (bool) { return true; }
}
Then add to RemoteAdapter:
solidityaddress public ism;

function setIsm(address ism_) external onlyOwner { ism = ism_; }

function interchainSecurityModule() external view returns (address) { return ism; }
Deploy NoopISM, then call remoteAdapter.setIsm(noopIsmAddress). The mailbox will now call recipientIsm(remoteAdapter) → get your NoopISM → verify() returns true → proceeds to handle().

Problem 2: handle() reverts with "RemoteAdapter: mailbox only"
❌ handle() reverts: RemoteAdapter: mailbox only
This is expected in the inspector (it was calling handle() directly, not from the mailbox), so this specific error is not a bug — your guard require(msg.sender == address(mailbox)) is working correctly.
However, once ISM is fixed and the real mailbox calls handle(), you'll hit a third problem:
solidityrequire(
    IERC20(collateralToken).transferFrom(beneficiary, address(this), amountUsdc),
    "RemoteAdapter: pull beneficiary"
);
This tries to pull tokens from the beneficiary at delivery time. The beneficiary must have pre-approved your RemoteAdapter on Sepolia before the message is delivered — that's an unusual and fragile flow. Make sure that approval exists, otherwise handle() will revert after ISM is fixed.

Summary of fixes in order
#IssueFix1Default ISM has no validators for Kite domain 2368Deploy NoopISM, add interchainSecurityModule() to RemoteAdapter pointing to it2handle() direct call revertsNot a bug — correct access control3transferFrom(beneficiary) at delivery timeEnsure beneficiary has pre-approved RemoteAdapter for collateralToken on Sepolia
Fix #1 first — everything else is blocked until ISM verification passes.