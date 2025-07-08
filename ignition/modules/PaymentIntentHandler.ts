import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PeerPayment = buildModule("PeerPayment", (m) => {
  const cctpHookWrapper = m.contract("CCTPHookWrapper", ["0x81D40F21F12A8F0E3252Bccb954D722d4c464B64"]);
  const cctpPaymentIntentReceiver = m.contract("PaymentIntentHandler", ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0xE3a7e4aD7bD8F34AE7E478814B51d0bA4A8Cbc3C"]);

  return { cctpHookWrapper,cctpPaymentIntentReceiver };
});

export default PeerPayment;
