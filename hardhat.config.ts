import { HardhatUserConfig } from "hardhat/config";
import "hardhat-dependency-compiler";
import "@nomicfoundation/hardhat-toolbox-viem";
import "hardhat-tracer";

import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.7.6" },
      { version: "0.8.28" }
    ],
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
    },
  },
  dependencyCompiler: {
    paths: [
      "lib/evm-cctp-contracts/src/MessageTransmitter.sol",
      "lib/evm-cctp-contracts/src/TokenMessenger.sol",
      "lib/evm-cctp-contracts/src/TokenMinter.sol",
      "lib/evm-cctp-contracts/lib/memview-sol/contracts/TypedMemView.sol"
    ]
  },
  networks: {
    base: {
      url: process.env.BASE_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!],
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!],
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!],
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!],
    },
    optimism: {
      url: process.env.OPTIMISM_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!], 
    },
    avalanche: {
      url: process.env.AVALANCHE_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
  etherscan: {
    apiKey: {
      base: "NFWCVGXACK2N9RCYMFE3ZSDE3Q3VW9V25J",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
};

export default config;
