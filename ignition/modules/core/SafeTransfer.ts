import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SafeTransfer = buildModule("SafeTransfer", (m) => {
  const safeTransfer = m.contract("SafeTransfer");

  return { safeTransfer };
});

export default SafeTransfer;
