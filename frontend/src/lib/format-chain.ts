import { formatUnits } from "ethers";

export const PIEUSD_PAYMENT_DECIMALS = 6;

const EXPLORER_BY_CHAIN_ID: Record<number, string> = {
  2368: "https://testnet.kitescan.ai",
  84532: "https://sepolia.basescan.org",
  421614: "https://sepolia.arbiscan.io",
  11155111: "https://sepolia.etherscan.io",
  11155420: "https://sepolia-optimism.etherscan.io",
};

function normalizeTxHash(txHash: string) {
  return txHash.startsWith("0x") ? txHash : `0x${txHash}`;
}

export function explorerTxUrl(chainId: number | null | undefined, txHash: string): string {
  const base = chainId ? EXPLORER_BY_CHAIN_ID[chainId] : undefined;
  return `${base ?? "https://testnet.kitescan.ai"}/tx/${normalizeTxHash(txHash)}`;
}

export function explorerAddressUrl(chainId: number | null | undefined, address: string): string {
  const base = chainId ? EXPLORER_BY_CHAIN_ID[chainId] : undefined;
  return `${base ?? "https://testnet.kitescan.ai"}/address/${address}`;
}

export function shortTxHash(txHash: string): string {
  const normalized = normalizeTxHash(txHash);
  return `${normalized.slice(0, 10)}...${normalized.slice(-8)}`;
}

export function formatTokenAmountRaw(
  value: bigint | string | number | null | undefined,
  decimals = 18,
  maximumFractionDigits = decimals,
): string {
  if (value === null || value === undefined || value === "") return "--";
  const raw = typeof value === "bigint" ? value : BigInt(typeof value === "number" ? Math.trunc(value).toString() : value);
  if (raw === BigInt(0)) return "0";
  const formatted = formatUnits(raw, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmed = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function formatFixedTokenAmountRaw(
  value: bigint | string | number | null | undefined,
  decimals: number,
  fractionDigits: number,
): string {
  if (value === null || value === undefined || value === "") return "--";
  const raw = typeof value === "bigint" ? value : BigInt(typeof value === "number" ? Math.trunc(value).toString() : value);
  const base = BigInt(10) ** BigInt(decimals);
  const displayBase = BigInt(10) ** BigInt(fractionDigits);
  const rounded = (raw * displayBase + base / BigInt(2)) / base;
  const whole = rounded / displayBase;
  const fraction = (rounded % displayBase).toString().padStart(fractionDigits, "0");
  return fractionDigits > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function formatTokenBalanceAmountRaw(value: bigint | string | number | null | undefined, decimals = 18): string {
  return formatFixedTokenAmountRaw(value, decimals, 3);
}

export function formatPieUsdPaymentAmountRaw(value: bigint | string | number | null | undefined): string {
  return formatTokenAmountRaw(value, PIEUSD_PAYMENT_DECIMALS, PIEUSD_PAYMENT_DECIMALS);
}

export function formatTokenNumber(value: number | null | undefined, maximumFractionDigits = 6): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (value === 0) return "0";
  return value.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumSignificantDigits: value > 0 && value < 0.000001 ? 2 : undefined,
    maximumSignificantDigits: value > 0 && value < 0.000001 ? 6 : undefined,
  });
}

export function tokenAmountRawToNumber(value: string, decimals = 18): number {
  return Number(formatUnits(BigInt(value || "0"), decimals));
}
