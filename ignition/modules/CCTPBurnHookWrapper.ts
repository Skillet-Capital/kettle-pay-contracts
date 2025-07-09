import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CCTPBurnHookWrapper = buildModule("CCTPBurnHookWrapper", (m) => {
  const tokenMessenger = m.getParameter("tokenMessenger");
  const cctpBurnHookWrapper = m.contract("CCTPBurnHookWrapper", [tokenMessenger]);

  return { cctpBurnHookWrapper };
});

export default CCTPBurnHookWrapper;
