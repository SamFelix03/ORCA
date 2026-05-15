import path from "node:path";
import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenv.config({ path: path.join(__dirname, ".env") });

const KITE_MAINNET_RPC = process.env.KITE_MAINNET_RPC ?? "https://rpc.gokite.ai";
const KITE_TESTNET_RPC = process.env.KITE_TESTNET_RPC ?? "https://rpc-testnet.gokite.ai";

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
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    kiteTestnet: {
      url: KITE_TESTNET_RPC,
      chainId: 2368,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;
