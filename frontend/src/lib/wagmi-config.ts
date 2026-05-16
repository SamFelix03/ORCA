import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";
import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";

export const kiteTestnet = defineChain({
  id: 2368,
  name: "Kite Testnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: ["https://rpc-testnet.gokite.ai"] } },
});

const connectors = [injected(), metaMask()];

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
