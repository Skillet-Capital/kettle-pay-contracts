import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import PaymentIntentHandler from "../handler/PaymentIntentHandler";

const SwapRouter02WrapperBase = buildModule("SwapRouter02WrapperBase", (m) => {
  const { cctpPaymentIntentReceiver } = m.useModule(PaymentIntentHandler);
  const swapRouter = m.getParameter("swapRouter");
  const burnHook = m.getParameter("burnHook");

  const swapRouter02Wrapper = m.contract("SwapRouter02Wrapper", [swapRouter, burnHook, cctpPaymentIntentReceiver]);

  return { swapRouter02Wrapper };
});

export default SwapRouter02WrapperBase;
