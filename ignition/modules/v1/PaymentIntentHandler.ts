import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import CCTPMintHookWrapper from "../cctp/CCTPMintHookWrapper";
import { toUtf8Bytes, keccak256 } from "ethers";

const PaymentIntentHandlerV1 = buildModule("PaymentIntentHandlerV1", (m) => {
  const usdc = m.getParameter("usdc");
  const { cctpMintHookWrapper } = m.useModule(CCTPMintHookWrapper);
  const cctpPaymentIntentReceiver = m.contract("PaymentIntentHandlerV1", [
    usdc,
    cctpMintHookWrapper,
  ]);

  const RECOVER_ROLE = keccak256(toUtf8Bytes("RECOVER_ROLE")); 

  m.call(cctpPaymentIntentReceiver, "grantRole", [RECOVER_ROLE, "0x6aE9B7217D4BC8fAECfb9DD18B655bd26f71427d"], { id: "payment_intent_receiver_set_recover_1" });


  return { cctpPaymentIntentReceiver };
});

export default PaymentIntentHandlerV1;
