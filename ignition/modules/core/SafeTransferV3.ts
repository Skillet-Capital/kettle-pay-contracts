import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SafeTransferV3 = buildModule("SafeTransferV3", (m) => {
  const usdc = m.getParameter("usdc");
  const safeTransfer = m.contract("SafeTransferV3", [usdc]);

  return { safeTransfer };
});

export default SafeTransferV3;
