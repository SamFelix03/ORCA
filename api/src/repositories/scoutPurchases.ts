import { createHash, randomBytes } from "crypto";
import { getAddress } from "ethers";
import { config } from "../config.js";
import { prisma } from "../db/prisma.js";
import { verifyPieUsdPurchase } from "../lib/verifyPieUsdPurchase.js";

const DEFAULT_SCOUT_SIGNAL_STREAM_KEY = "orca:signals:scout";

function hashBindingSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function getPurchaseQuote(marketplaceId: string): Promise<{
  token: string;
  recipient: string;
  amountWei: string;
  chainId: number;
}> {
  const listing = await prisma.scoutMarketplace.findUnique({ where: { id: marketplaceId } });
  if (!listing) {
    throw new Error(`Scout marketplace listing not found: ${marketplaceId}`);
  }
  return {
    token: getAddress(config.pieUsdAddress),
    recipient: getAddress(listing.ownerAddress),
    amountWei: config.pieUsdPurchasePriceWei,
    chainId: listing.chainId,
  };
}

export async function confirmPurchase(marketplaceId: string, buyerWalletRaw: string, txHash: string) {
  const listing = await prisma.scoutMarketplace.findUnique({ where: { id: marketplaceId } });
  if (!listing) {
    throw new Error(`Scout marketplace listing not found: ${marketplaceId}`);
  }

  const buyerWallet = getAddress(buyerWalletRaw);
  const owner = getAddress(listing.ownerAddress);
  const amountWei = BigInt(config.pieUsdPurchasePriceWei);

  await verifyPieUsdPurchase({
    txHash,
    expectedBuyer: buyerWallet,
    expectedRecipient: owner,
    expectedAmountWei: amountWei,
  });

  const existing = await prisma.scoutPurchase.findUnique({
    where: { scoutMarketplaceId_buyerWallet: { scoutMarketplaceId: marketplaceId, buyerWallet } },
  });
  if (existing) {
    throw new Error("A purchase already exists for this buyer and listing.");
  }

  const bindingSecret = randomBytes(32).toString("hex");
  const bindingSecretHash = hashBindingSecret(bindingSecret);
  const bindingSecretLast4 = bindingSecret.slice(-4);

  const row = await prisma.scoutPurchase.create({
    data: {
      scoutMarketplaceId: marketplaceId,
      buyerWallet,
      amountWei: amountWei.toString(),
      paymentTxHash: txHash,
      chainId: listing.chainId,
      bindingSecretHash,
      bindingSecretLast4,
    },
  });

  return { purchaseId: row.id, bindingSecret };
}

export async function setPurchaseBinding(
  purchaseId: string,
  buyerWalletRaw: string,
  bindingSecret: string,
  redisUrl: string,
  scoutSignalStreamKey?: string,
): Promise<void> {
  const purchase = await prisma.scoutPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    throw new Error(`Purchase not found: ${purchaseId}`);
  }
  const buyerWallet = getAddress(buyerWalletRaw);
  if (purchase.buyerWallet !== buyerWallet) {
    throw new Error("buyerWallet does not match this purchase.");
  }
  if (hashBindingSecret(bindingSecret) !== purchase.bindingSecretHash) {
    throw new Error("Invalid binding secret.");
  }
  const key = (scoutSignalStreamKey?.trim() || DEFAULT_SCOUT_SIGNAL_STREAM_KEY).trim();
  await prisma.scoutPurchase.update({
    where: { id: purchaseId },
    data: {
      redisUrl: redisUrl.trim(),
      scoutSignalStreamKey: key,
    },
  });
}

export async function getBindingForCreator(
  purchaseId: string,
  bindingSecret: string,
): Promise<{ redisUrl: string; scoutSignalStreamKey: string } | null> {
  const purchase = await prisma.scoutPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    return null;
  }
  if (hashBindingSecret(bindingSecret) !== purchase.bindingSecretHash) {
    throw new Error("Invalid binding secret.");
  }
  if (!purchase.redisUrl?.trim()) {
    return null;
  }
  return {
    redisUrl: purchase.redisUrl.trim(),
    scoutSignalStreamKey: purchase.scoutSignalStreamKey?.trim() || DEFAULT_SCOUT_SIGNAL_STREAM_KEY,
  };
}
