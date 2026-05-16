import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";
import { createConfig, http } from "wagmi";
import { injected, metaMask, walletConnect } from "wagmi/connectors";

export const kiteTestnet = defineChain({
  id: 2368,
  name: "Kite Testnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: ["https://rpc-testnet.gokite.ai"] } },
});

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const connectors = [injected(), metaMask()];
if (walletConnectProjectId) {
  connectors.push(walletConnect({ projectId: walletConnectProjectId }));
}

export const wagmiConfig = createConfig({
  chains: [kiteTestnet, baseSepolia],
  connectors,
  transports: {
    [kiteTestnet.id]: http(),
    [baseSepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
