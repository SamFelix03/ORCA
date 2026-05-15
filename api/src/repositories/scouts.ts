import type { ScoutMarketplaceRecord } from "@orca/shared";
import { Prisma } from "@prisma/client";
import { getAddress, JsonRpcProvider } from "ethers";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import {
  computeDidHashHex,
  encodeRegisterPermissionlessScoutCalldata,
  parsePermissionlessScoutRegisteredFromReceipt,
  verifyScoutRegistrationSignature,
  buildScoutRegistrationDomain,
  SCOUT_REGISTRATION_TYPES,
  type ScoutRegistrationMessage,
} from "../lib/byoScoutRegistration.js";
import { toScoutMarketplaceRecord } from "./serializers.js";

const NONCE_TTL_SECONDS = 900;

export async function createScoutRegisterChallenge(did?: string): Promise<{
  nonce: string;
  deadlineUnix: number;
  didHashHex?: string;
}> {
  const nonce = crypto.randomUUID();
  const deadlineUnix = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;
  await prisma.scoutRegisterNonce.create({
    data: {
      nonce,
      deadlineUnix,
      expiresAt: new Date(deadlineUnix * 1000),
    },
  });
  const didHashHex = did?.trim() ? computeDidHashHex(did.trim()) : undefined;
  return { nonce, deadlineUnix, didHashHex };
}

async function finalizePendingMarketplaceRow(payload: {
  domainName: string;
  chainId: number;
  registryAddress: string;
  stakeDecimals: number;
  did: string;
  vault: string;
  bondAmountWei: bigint;
  ownerAddress: string;
  nonce: string;
  deadline: bigint;
  signature: string;
  messageDidHash: string;
}): Promise<ScoutMarketplaceRecord> {
  if (!config.orcaRegistryAddress) {
    throw new Error("ORCA_REGISTRY_ADDRESS is required for BYO scout registration.");
  }
  if (payload.registryAddress.toLowerCase() !== config.orcaRegistryAddress.toLowerCase()) {
    throw new Error("Registration typed-data registryAddress mismatch.");
  }

  const didTrim = payload.did.trim();
  let vaultNorm: string;
  try {
    vaultNorm = getAddress(payload.vault.trim());
  } catch {
    throw new Error("Invalid vault address");
  }

  const expectedDidHash = computeDidHashHex(didTrim);
  if (payload.messageDidHash.toLowerCase() !== expectedDidHash.toLowerCase()) {
    throw new Error("didHash does not match did string.");
  }

  let ownerNorm: string;
  try {
    ownerNorm = getAddress(payload.ownerAddress.trim());
  } catch {
    throw new Error("Invalid ownerAddress");
  }

  const domain = buildScoutRegistrationDomain(payload.chainId, payload.domainName);
  const message: ScoutRegistrationMessage = {
    did: didTrim,
    didHash: expectedDidHash,
    vault: vaultNorm,
    bondAmountWei: payload.bondAmountWei,
    nonce: payload.nonce,
    deadline: payload.deadline,
  };

  verifyScoutRegistrationSignature({
    domain,
    message,
    signature: payload.signature,
    expectedOwner: ownerNorm,
  });

  const nonceRow = await prisma.scoutRegisterNonce.findUnique({ where: { nonce: payload.nonce } });
  if (!nonceRow || nonceRow.used) throw new Error("Invalid registration nonce");
  if (nonceRow.expiresAt.getTime() < Date.now()) throw new Error("Registration nonce expired");
  if (nonceRow.deadlineUnix !== Number(payload.deadline)) throw new Error("Deadline mismatch for nonce");

  const stakeUsdc = new Prisma.Decimal(payload.bondAmountWei.toString()).div(new Prisma.Decimal(10 ** payload.stakeDecimals));

  const row = await prisma.$transaction(async (tx) => {
    await tx.scoutRegisterNonce.update({
      where: { nonce: payload.nonce },
      data: { used: true },
    });

    return tx.scoutMarketplace.upsert({
      where: { did: didTrim },
      create: {
        did: didTrim,
        didHashHex: expectedDidHash,
        ownerAddress: ownerNorm.toLowerCase(),
        vaultAddress: vaultNorm,
        bondAmountWei: payload.bondAmountWei.toString(),
        chainId: payload.chainId,
        status: "pending",
        stakeUsdc,
        reputationScore: 0,
      },
      update: {
        didHashHex: expectedDidHash,
        ownerAddress: ownerNorm.toLowerCase(),
        vaultAddress: vaultNorm,
        bondAmountWei: payload.bondAmountWei.toString(),
        chainId: payload.chainId,
        status: "pending",
        registrationTxHash: null,
        stakeUsdc,
      },
    });
  });

  return toScoutMarketplaceRecord(row);
}

export async function attestPendingMarketplace(payload: {
  domainName: string;
  chainId: number;
  registryAddress: string;
  stakeDecimals: number;
  did: string;
  vault: string;
  bondAmountWei: string;
  ownerAddress: string;
  nonce: string;
  deadline: string;
  signature: string;
  messageDidHash: string;
}): Promise<ScoutMarketplaceRecord> {
  let bondWei: bigint;
  try {
    bondWei = BigInt(payload.bondAmountWei);
  } catch {
    throw new Error("bondAmountWei must be a base-10 integer string");
  }
  if (bondWei <= 0n) throw new Error("bondAmountWei must be positive");

  const deadline = BigInt(payload.deadline);
  return finalizePendingMarketplaceRow({
    domainName: payload.domainName,
    chainId: payload.chainId,
    registryAddress: payload.registryAddress,
    stakeDecimals: payload.stakeDecimals,
    did: payload.did,
    vault: payload.vault,
    bondAmountWei: bondWei,
    ownerAddress: payload.ownerAddress,
    nonce: payload.nonce,
    deadline,
    signature: payload.signature,
    messageDidHash: payload.messageDidHash,
  });
}

export async function getRegisterPermissionlessCalldata(marketplaceId: string): Promise<{ to: string; data: string }> {
  if (!config.orcaRegistryAddress) throw new Error("ORCA_REGISTRY_ADDRESS not configured");
  const row = await prisma.scoutMarketplace.findUnique({ where: { id: marketplaceId } });
  if (!row) throw new Error("Marketplace record not found");
  if (row.status !== "pending") throw new Error("Marketplace record is not pending on-chain confirmation");
  if (!row.vaultAddress || row.vaultAddress === "") throw new Error("Missing vault address");
  if (!row.didHashHex || row.didHashHex.trim() === "") throw new Error("Missing DID hash on marketplace row");

  const bondWei = BigInt(row.bondAmountWei);
  const data = encodeRegisterPermissionlessScoutCalldata(row.didHashHex, row.vaultAddress, bondWei);
  return { to: config.orcaRegistryAddress, data };
}

export async function confirmMarketplaceRegistration(marketplaceId: string, txHash: string): Promise<ScoutMarketplaceRecord> {
  if (!config.orcaRegistryAddress) throw new Error("ORCA_REGISTRY_ADDRESS not configured");

  const row = await prisma.scoutMarketplace.findUnique({ where: { id: marketplaceId } });
  if (!row) throw new Error("Marketplace record not found");
  if (row.status !== "pending") throw new Error("Registration already finalized");
  if (row.chainId !== config.kiteChainId) {
    throw new Error("Marketplace record chainId does not match API KITE_CHAIN_ID");
  }

  const provider = new JsonRpcProvider(config.kiteRpcUrl, config.kiteChainId);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) throw new Error("Transaction receipt not found");

  if (receipt.status !== undefined && receipt.status !== null) {
    const code = typeof receipt.status === "bigint" ? Number(receipt.status) : Number(receipt.status);
    if (code !== 1) throw new Error("Transaction failed on-chain");
  }

  const parsed = parsePermissionlessScoutRegisteredFromReceipt(receipt.logs, config.orcaRegistryAddress);
  if (!parsed) throw new Error("PermissionlessScoutRegistered event not found in receipt");

  const bondWei = BigInt(row.bondAmountWei);
  if (parsed.bondAmount !== bondWei) throw new Error("On-chain bond amount mismatch");
  if (parsed.vault.toLowerCase() !== row.vaultAddress.toLowerCase()) throw new Error("On-chain vault mismatch");
  if (parsed.owner.toLowerCase() !== row.ownerAddress.toLowerCase()) throw new Error("On-chain registrant mismatch");
  if (parsed.didHash.toLowerCase() !== row.didHashHex.toLowerCase()) throw new Error("On-chain didHash mismatch");

  const updated = await prisma.scoutMarketplace.update({
    where: { id: marketplaceId },
    data: {
      status: "active",
      registrationTxHash: txHash,
    },
  });

  return toScoutMarketplaceRecord(updated);
}

export function scoutRegistrationTypesForChallenge(): Record<string, Array<{ name: string; type: string }>> {
  return SCOUT_REGISTRATION_TYPES;
}
