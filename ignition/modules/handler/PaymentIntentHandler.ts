import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import CCTPMintHookWrapper from "../cctp/CCTPMintHookWrapper";
import { toUtf8Bytes, keccak256 } from "ethers";

const PaymentIntentHandler = buildModule("PaymentIntentHandler", (m) => {
  const usdc = m.getParameter("usdc");
  const privyOperator = m.getParameter("privyOperator");

  const { cctpMintHookWrapper } = m.useModule(CCTPMintHookWrapper);
  const cctpPaymentIntentReceiver = m.contract("PaymentIntentHandler", [
    usdc,
    cctpMintHookWrapper,
  ]);

  const OPERATOR_ROLE = keccak256(toUtf8Bytes("OPERATOR_ROLE"));

  m.call(cctpPaymentIntentReceiver, "grantRole", [OPERATOR_ROLE, privyOperator], { id: "payment_intent_operator" });

  return { cctpPaymentIntentReceiver };
});

export default PaymentIntentHandler;
