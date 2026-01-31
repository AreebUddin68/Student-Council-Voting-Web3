import "@nomicfoundation/hardhat-ethers";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { 
        enabled: true, 
        runs: 200  // Optimized for deployment cost vs runtime cost balance
      },
      viaIR: true,
      evmVersion: "cancun", // Latest EVM version for Sepolia
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
      mining: {
        auto: true,
        interval: 0,
      },
      allowBlocksWithSameTimestamp: true,
      gasPrice: 8000000000, // 8 gwei
      blockGasLimit: 30000000, // 30 million gas limit per block
    },
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      gasPrice: 8000000000, // 8 gwei
    },
    sepolia: {
      type: "http",
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: "auto", // Auto gas price for Sepolia
      gas: 6000000, // Gas limit
    },
  },
};

export default config;
