import assert from "node:assert/strict";
import test from "node:test";
import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import {
  SCOUT_REGISTRATION_TYPES,
  buildScoutRegistrationDomain,
  verifyScoutRegistrationSignature,
  type ScoutRegistrationMessage,
} from "./byoScoutRegistration.js";

test("verifyScoutRegistrationSignature accepts ethers signTypedData payload", async () => {
  const wallet = Wallet.createRandom();
  const did = "did:kite:orca/scout-1";
  const domain = buildScoutRegistrationDomain(2368, "ORCA_BYO_SCOUT");
  const message: ScoutRegistrationMessage = {
    did,
    didHash: keccak256(toUtf8Bytes(did)),
    vault: "0x1bcdcf2acc93d01F7F66010BE7B5a647A7cfC40f",
    bondAmountWei: 100_000_000n,
    nonce: "nonce-test-1",
    deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
  };
  const signature = await wallet.signTypedData(domain, SCOUT_REGISTRATION_TYPES, message);
  const recovered = verifyScoutRegistrationSignature({
    domain,
    message,
    signature,
    expectedOwner: wallet.address,
  });
  assert.equal(recovered.toLowerCase(), wallet.address.toLowerCase());
});
