import type { ConnectedWallet, LinkedAccountWithMetadata, User } from "@privy-io/react-auth";

function accountAddress(account: LinkedAccountWithMetadata): string | null {
  if ("address" in account && typeof account.address === "string" && account.address) {
    return account.address;
  }
  return null;
}

export function primaryPrivyWalletAddress(user: User | null | undefined, wallets: ConnectedWallet[] = []): string | null {
  if (wallets.length > 0 && wallets[0]?.address) {
    return wallets[0].address;
  }
  if (user?.wallet?.address) {
    return user.wallet.address;
  }
  for (const account of user?.linkedAccounts ?? []) {
    const address = accountAddress(account);
    if (address) {
      return address;
    }
  }
  return null;
}
