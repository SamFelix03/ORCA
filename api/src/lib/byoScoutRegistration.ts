import { Interface, keccak256, toUtf8Bytes, verifyTypedData } from "ethers";

/** Matches Solidity/agent convention: keccak256(abi.encodePacked(utf8(did))). Agents use Web3.keccak(text=did). */
export function computeDidHashHex(did: string): string {
  return keccak256(toUtf8Bytes(did));
}

export const SCOUT_REGISTRATION_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  ScoutRegistration: [
    { name: "did", type: "string" },
    { name: "didHash", type: "bytes32" },
    { name: "vault", type: "address" },
    { name: "bondAmountWei", type: "uint256" },
    { name: "nonce", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};

export interface ScoutRegistrationMessage {
  did: string;
  didHash: string;
  vault: string;
  bondAmountWei: bigint;
  nonce: string;
  deadline: bigint;
}

export function buildScoutRegistrationDomain(chainId: number, domainName: string) {
  return {
    name: domainName,
    version: "1",
    chainId,
  };
}

function recoverScoutRegistrationSigner(
  domain: ReturnType<typeof buildScoutRegistrationDomain>,
  message: ScoutRegistrationMessage,
  signature: string,
): string {
  const attempts: Array<Record<string, unknown>> = [
    { ...message },
    {
      ...message,
      bondAmountWei: message.bondAmountWei.toString(),
      deadline: message.deadline.toString(),
    },
  ];
  let lastError: unknown;
  for (const candidate of attempts) {
    try {
      return verifyTypedData(domain, SCOUT_REGISTRATION_TYPES, candidate, signature);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to recover scout registration signature");
}

export function verifyScoutRegistrationSignature(params: {
  domain: ReturnType<typeof buildScoutRegistrationDomain>;
  message: ScoutRegistrationMessage;
  signature: string;
  expectedOwner: string;
}): string {
  const recovered = recoverScoutRegistrationSigner(params.domain, params.message, params.signature);
  if (recovered.toLowerCase() !== params.expectedOwner.toLowerCase()) {
    throw new Error(
      `Signature does not match ownerAddress: recovered signer is ${recovered}, but ownerAddress is ${params.expectedOwner}. ` +
        "The EIP-712 payload may not match what the wallet signed; retry after refreshing the page.",
    );
  }
  return recovered;
}

const REGISTRY_IFACE = new Interface([
  "function registerPermissionlessScout(bytes32 didHash,address vault,uint256 bondAmount)",
  "event PermissionlessScoutRegistered(bytes32 indexed didHash,address indexed owner,address indexed vault,uint256 bondAmount)",
]);

export function encodeRegisterPermissionlessScoutCalldata(didHash: string, vault: string, bondAmountWei: bigint): string {
  return REGISTRY_IFACE.encodeFunctionData("registerPermissionlessScout", [didHash, vault, bondAmountWei]);
}

export function parsePermissionlessScoutRegisteredFromReceipt(
  logs: ReadonlyArray<{ address: string; topics: ReadonlyArray<string>; data: string }>,
  registryAddress: string,
): { didHash: string; owner: string; vault: string; bondAmount: bigint } | null {
  const want = registryAddress.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== want) continue;
    try {
      const parsed = REGISTRY_IFACE.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed?.name !== "PermissionlessScoutRegistered") continue;
      const didHash = parsed.args.didHash as string;
      const owner = parsed.args.owner as string;
      const vault = parsed.args.vault as string;
      const bondAmount = parsed.args.bondAmount as bigint;
      return { didHash, owner, vault, bondAmount };
    } catch {
      continue;
    }
  }
  return null;
}
