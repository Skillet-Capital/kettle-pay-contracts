import { Address, PublicClient, WalletClient } from "viem";
import { PaymentIntentStruct } from "./types";

export async function signPaymentIntent(
  intent: PaymentIntentStruct,
  signer: WalletClient,
  publicClient: PublicClient,
  paymentIntentHandler: Address,
) {
  return signer.signTypedData({
    domain: {
      name: "PaymentIntentHandler",
      version: "1",
      chainId: await publicClient.getChainId(),
      verifyingContract: paymentIntentHandler,
    },
    types: {
      PaymentIntent: [
        { name: "amount", type: "uint256" },
        { name: "feeBps", type: "uint256" },
        { name: "feeRecipient", type: "address" },
        { name: "merchant", type: "address" },
        { name: "salt", type: "uint256" },
        { name: "quantityType", type: "uint8" },
        { name: "quantity", type: "uint256" },
        { name: "signerType", type: "uint8" },
        { name: "signer", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "PaymentIntent",
    message: intent,
    account: signer.account?.address as `0x${string}`,
  });
}
