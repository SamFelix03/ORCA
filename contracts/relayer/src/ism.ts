import { Contract, Provider } from "ethers";

const MAILBOX_ABI = [
  "function defaultIsm() external view returns (address)",
  "function recipientIsm(address recipient) external view returns (address)",
];

const ISM_ABI = [
  "function moduleType() external view returns (uint8)",
  "function verify(bytes calldata metadata, bytes calldata message) external returns (bool)",
];

export async function resolveIsm(
  mailbox: string,
  recipient: string,
  provider: Provider,
): Promise<string> {
  const mb = new Contract(mailbox, MAILBOX_ABI, provider);
  const recipientIsm: string = await mb.recipientIsm(recipient);
  if (recipientIsm && recipientIsm !== "0x0000000000000000000000000000000000000000") {
    return recipientIsm;
  }
  return mb.defaultIsm();
}

/** Pick metadata that passes ISM verify (empty for NoopISM / NULL type 6). */
export async function metadataForMessage(
  ismAddress: string,
  messageBytes: string,
  provider: Provider,
): Promise<string> {
  const ism = new Contract(ismAddress, ISM_ABI, provider);
  let moduleType = 0;
  try {
    moduleType = Number(await ism.moduleType());
  } catch {
    moduleType = 0;
  }
  if (moduleType === 6) {
    return "0x";
  }
  try {
    const okEmpty = await ism.verify.staticCall("0x", messageBytes);
    if (okEmpty) return "0x";
  } catch {
    /* try padded */
  }
  try {
    const padded = "0x" + "00".repeat(32);
    const okPad = await ism.verify.staticCall(padded, messageBytes);
    if (okPad) return padded;
  } catch {
    /* fall through */
  }
  throw new Error(`ISM ${ismAddress} rejected empty metadata (moduleType=${moduleType})`);
}
