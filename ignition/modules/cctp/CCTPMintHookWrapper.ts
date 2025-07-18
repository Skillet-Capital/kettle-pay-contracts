import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { toUtf8Bytes, keccak256 } from "ethers";

const CCTPMintHookWrapper = buildModule("CCTPMintHookWrapper", (m) => {
  const messageTransmitter = m.getParameter("messageTransmitter");
  const cctpMintHookWrapper = m.contract("CCTPMintHookWrapper", [messageTransmitter]);

  const RELAYER_ROLE = keccak256(toUtf8Bytes("RELAYER_ROLE")); 

  // privy smart wallet
  m.call(cctpMintHookWrapper, "grantRole", [RELAYER_ROLE, "0x6aE9B7217D4BC8fAECfb9DD18B655bd26f71427d"], { id: "cctp_hook_wrapper_set_relayer_1" });

  return { cctpMintHookWrapper };
});

export default CCTPMintHookWrapper;
