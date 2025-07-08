import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import CCTPHookWrapper from "../CCTPHookWrapper";
import { toUtf8Bytes, keccak256 } from "ethers";

const PaymentIntentHandlerV1 = buildModule("PaymentIntentHandlerV1", (m) => {
  const { cctpHookWrapper } = m.useModule(CCTPHookWrapper);
  const cctpPaymentIntentReceiver = m.contract("PaymentIntentHandlerV1", [
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    cctpHookWrapper,
  ]);

  const RECOVER_ROLE = keccak256(toUtf8Bytes("RECOVER_ROLE")); 

  m.call(cctpPaymentIntentReceiver, "grantRole", [RECOVER_ROLE, "0xE3a7e4aD7bD8F34AE7E478814B51d0bA4A8Cbc3C"], { id: "payment_intent_receiver_set_recover_1" });


  return { cctpPaymentIntentReceiver };
});

export default PaymentIntentHandlerV1;