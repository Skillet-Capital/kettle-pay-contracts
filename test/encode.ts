import { encodeAbiParameters, encodePacked } from "viem";
import { PaymentIntentStruct } from "./types";

export function encodeHookData(
  orderId: `0x${string}`,
  intent: PaymentIntentStruct,
  signature: `0x${string}`
) {
  return encodeAbiParameters(
    [
      {
        name: "hookData",
        type: "tuple",
        components: [
          { name: "orderId", type: "bytes32" },
          {
            name: "intent",
            type: "tuple",
            components: [
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
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    [
      {
        orderId: orderId as `0x${string}`,
        intent: {
          amount: BigInt(intent.amount),
          feeBps: BigInt(intent.feeBps),
          feeRecipient: intent.feeRecipient as `0x${string}`,
          merchant: intent.merchant as `0x${string}`,
          salt: BigInt(intent.salt),
          quantityType: intent.quantityType,
          quantity: BigInt(intent.quantity),
          signerType: intent.signerType,
          signer: intent.signer as `0x${string}`,
          nonce: BigInt(intent.nonce),
        },
        signature: signature as `0x${string}`,
      },
    ]
  );
}

export function encodeOrderData(
  target: `0x${string}`,
  orderId: `0x${string}`,
  intentHash: `0x${string}`,
) {
  return encodePacked(
    [
      "address",
      "bytes32",
      "bytes32",
    ],
    [
      target as `0x${string}`,
      orderId as `0x${string}`,
      intentHash as `0x${string}`,
    ]
  );
}
