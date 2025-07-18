import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { toUtf8Bytes, keccak256 } from "ethers";

const CCTPMintHookWrapper = buildModule("CCTPMintHookWrapper", (m) => {
  const messageTransmitter = m.getParameter("messageTransmitter");
  const cctpMintHookWrapper = m.contract("CCTPMintHookWrapper", [messageTransmitter]);

  const RELAYER_ROLE = keccak256(toUtf8Bytes("RELAYER_ROLE")); 

  m.call(cctpMintHookWrapper, "grantRole", [RELAYER_ROLE, "0xE3a7e4aD7bD8F34AE7E478814B51d0bA4A8Cbc3C"], { id: "cctp_hook_wrapper_set_relayer_1" });

  return { cctpMintHookWrapper };
});

export default CCTPMintHookWrapper;
