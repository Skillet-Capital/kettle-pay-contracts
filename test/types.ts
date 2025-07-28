export enum SignerType {
  MERCHANT,
  OPERATOR,
}

export enum QuantityType {
  FIXED,
  UNLIMITED,
}

export type PaymentIntentStruct = {
  amount: bigint;
  feeBps: bigint;
  feeRecipient: `0x${string}`;
  merchant: `0x${string}`;
  salt: bigint;
  signerType: SignerType;
  signer: `0x${string}`;
  quantityType: QuantityType;
  quantity: bigint;
  nonce: bigint;
};
