import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import CCTPMintHookWrapper from "../cctp/CCTPMintHookWrapper";
import { toUtf8Bytes, keccak256 } from "ethers";

const PaymentIntentHandler = buildModule("PaymentIntentHandler", (m) => {
  const usdc = m.getParameter("usdc");
  const { cctpMintHookWrapper } = m.useModule(CCTPMintHookWrapper);
  const cctpPaymentIntentReceiver = m.contract("PaymentIntentHandler", [
    usdc,
    cctpMintHookWrapper,
  ]);

  const RECOVER_ROLE = keccak256(toUtf8Bytes("RECOVER_ROLE")); 
  const OPERATOR_ROLE = keccak256(toUtf8Bytes("OPERATOR_ROLE"));

  m.call(cctpPaymentIntentReceiver, "grantRole", [RECOVER_ROLE, "0x6aE9B7217D4BC8fAECfb9DD18B655bd26f71427d"], { id: "payment_intent_receiver_set_recover_1" });
  m.call(cctpPaymentIntentReceiver, "grantRole", [OPERATOR_ROLE, "0x82fABC13D4D03599EE1cD0df11cEcFE9dC15C0b3"], { id: "payment_intent_receiver_set_operator_1" });


  return { cctpPaymentIntentReceiver };
});

export default PaymentIntentHandler;
