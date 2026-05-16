import path from "node:path";
import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenv.config({ path: path.join(__dirname, ".env") });

const PRIVATE_KEYS =
  process.env.PRIVATE_KEY
    ? [process.env.PRIVATE_KEY]
    : process.env.DEPLOYER_PRIVATE_KEY
      ? [process.env.DEPLOYER_PRIVATE_KEY]
      : [];

const KITE_MAINNET_RPC = process.env.KITE_MAINNET_RPC ?? "https://rpc.gokite.ai";
const KITE_TESTNET_RPC = process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai";
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const ARB_SEPOLIA_RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const OP_SEPOLIA_RPC = process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io";
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    kiteMainnet: {
      url: KITE_MAINNET_RPC,
      chainId: 2366,
      accounts: PRIVATE_KEYS,
    },
    kiteTestnet: {
      url: KITE_TESTNET_RPC,
      chainId: 2368,
      accounts: PRIVATE_KEYS,
    },
    sepolia: {
      url: SEPOLIA_RPC,
      chainId: 11155111,
      accounts: PRIVATE_KEYS,
    },
    arbitrumSepolia: {
      url: ARB_SEPOLIA_RPC,
      chainId: 421614,
      accounts: PRIVATE_KEYS,
    },
    optimismSepolia: {
      url: OP_SEPOLIA_RPC,
      chainId: 11155420,
      accounts: PRIVATE_KEYS,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC,
      chainId: 84532,
      accounts: PRIVATE_KEYS,
    },
  },
};

export default config;
