import "@nomicfoundation/hardhat-toolbox-viem";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: '../.env' });

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    ...(process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_PRIVATE_KEY ? {
      sepolia: {
        type: "http",
        chainType: "l1",
        url: process.env.SEPOLIA_RPC_URL,
        accounts: [process.env.SEPOLIA_PRIVATE_KEY],
      },
    } : {}),
  },
};

export default config;