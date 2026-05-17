import type { ConnectedWallet, LinkedAccountWithMetadata, User } from "@privy-io/react-auth";

function accountAddress(account: LinkedAccountWithMetadata): string | null {
  if ("address" in account && typeof account.address === "string" && account.address) {
    return account.address;
  }
  return null;
}

export function primaryPrivyWalletAddress(user: User | null | undefined, wallets: ConnectedWallet[] = []): string | null {
  const primary = user?.wallet?.address;
  if (primary) {
    const match = wallets.find((w) => w.address?.toLowerCase() === primary.toLowerCase());
    return match?.address ?? primary;
  }
  if (wallets.length > 0 && wallets[0]?.address) {
    return wallets[0].address;
  }
  for (const account of user?.linkedAccounts ?? []) {
    const address = accountAddress(account);
    if (address) {
      return address;
    }
  }
  return null;
}
