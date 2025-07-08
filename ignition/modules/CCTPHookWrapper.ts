import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { toUtf8Bytes, keccak256 } from "ethers";

const CCTPHookWrapper = buildModule("CCTPHookWrapper", (m) => {
  const cctpHookWrapper = m.contract(
    "CCTPHookWrapper",
    [
      "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64", // message transmitter
    ],
  );

  const RELAYER_ROLE = keccak256(toUtf8Bytes("RELAYER_ROLE")); 

  m.call(cctpHookWrapper, "grantRole", [RELAYER_ROLE, "0xE3a7e4aD7bD8F34AE7E478814B51d0bA4A8Cbc3C"], { id: "cctp_hook_wrapper_set_relayer_1" });

  return { cctpHookWrapper };
});

export default CCTPHookWrapper;
