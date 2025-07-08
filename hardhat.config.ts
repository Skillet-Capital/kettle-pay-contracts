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
    ]
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
    }
  },
  etherscan: {
    apiKey: {
      base: "228ZGK626T79PAIYKYFI631RIW2NMY52BT",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
};

export default config;
