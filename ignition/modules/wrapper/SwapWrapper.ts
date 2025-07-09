import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SwapWrapper = buildModule("SwapWrapper", (m) => {
  const weth = m.getParameter("weth");
  const swapWrapper = m.contract("SwapWrapper", [weth]);

  return { swapWrapper };
});

export default SwapWrapper;
