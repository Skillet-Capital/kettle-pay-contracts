import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SwapRouter02Wrapper = buildModule("SwapRouter02Wrapper", (m) => {
  const swapRouter = m.getParameter("swapRouter");
  const burnHook = m.getParameter("burnHook");
  const paymentHandler = m.getParameter("paymentHandler");
  const swapRouter02Wrapper = m.contract("SwapRouter02Wrapper", [swapRouter, burnHook, paymentHandler]);

  return { swapRouter02Wrapper };
});

export default SwapRouter02Wrapper;
