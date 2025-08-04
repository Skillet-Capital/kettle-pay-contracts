import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { toUtf8Bytes, keccak256 } from "ethers";

const CCTPMintHookWrapper = buildModule("CCTPMintHookWrapper", (m) => {
  const usdc = m.getParameter("usdc");
  const messageTransmitter = m.getParameter("messageTransmitter");
  const recoveryWallet = m.getParameter("recoveryWallet");
  const privyRelayer = m.getParameter("privyRelayer");
  const privy7702Relayer = m.getParameter("privy7702Relayer");

  const cctpMintHookWrapper = m.contract("CCTPMintHookWrapper", [
    usdc, 
    messageTransmitter
  ]);

  const RELAYER_ROLE = keccak256(toUtf8Bytes("RELAYER_ROLE")); 

  // privy smart wallet as relayer
  m.call(cctpMintHookWrapper, "grantRole", [RELAYER_ROLE, privyRelayer], { id: "cctp_hook_wrapper_set_relayer" });

  m.call(cctpMintHookWrapper, "setRecoveryWallet", [recoveryWallet], { id: "cctp_hook_wrapper_set_recovery_wallet" });

  m.call(cctpMintHookWrapper, "grantRole", [RELAYER_ROLE, privy7702Relayer], { id: "cctp_hook_wrapper_set_relayer_7702" });

  return { cctpMintHookWrapper };
});

export default CCTPMintHookWrapper;
