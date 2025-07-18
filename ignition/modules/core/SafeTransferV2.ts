import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SafeTransferV2 = buildModule("SafeTransferV2", (m) => {
  const usdc = m.getParameter("usdc");
  const safeTransfer = m.contract("SafeTransferV2", [usdc]);

  return { safeTransfer };
});

export default SafeTransferV2;
