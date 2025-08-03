import { encodePacked, keccak256, encodeAbiParameters } from 'viem';

export enum QuantityType {
  FIXED = 0,
  UNLIMITED = 1
}

export enum SignerType {
  MERCHANT = 0,
  OPERATOR = 1
}

export interface PaymentIntent {
  amount: bigint;
  feeBps: bigint;
  feeRecipient: `0x${string}`;
  merchant: `0x${string}`;
  salt: bigint;
  quantityType: QuantityType;
  quantity: bigint;
  signerType: SignerType;
  signer: `0x${string}`;
  nonce: bigint;
}

export interface PaymentIntentHookData {
  intent: PaymentIntent;
  orderId: `0x${string}`;
  signature: `0x${string}`;
}

/**
 * Pack PaymentIntentHookData into packed bytes using viem
 * This reduces byte size compared to standard ABI encoding
 */
export function packPaymentIntentHookData(hookData: PaymentIntentHookData): `0x${string}` {
  // Convert signature to bytes and get length
  const signatureBytes = hookData.signature.slice(2); // Remove 0x prefix
  const signatureLength = signatureBytes.length / 2; // Each byte is 2 hex chars
  
  if (signatureLength > 65535) {
    throw new Error('Signature too long (max 65535 bytes)');
  }

  // Pack the fixed-size data first - this matches the Solidity library exactly
  const packedFixed = encodePacked(
    ['uint256', 'uint256', 'address', 'address', 'uint256', 'uint8', 'uint256', 'uint8', 'address', 'uint256', 'bytes32'],
    [
      hookData.intent.amount,           // 32 bytes
      hookData.intent.feeBps,           // 32 bytes  
      hookData.intent.feeRecipient,     // 20 bytes
      hookData.intent.merchant,         // 20 bytes
      hookData.intent.salt,             // 32 bytes
      hookData.intent.quantityType,     // 1 byte
      hookData.intent.quantity,         // 32 bytes
      hookData.intent.signerType,       // 1 byte
      hookData.intent.signer,           // 20 bytes
      hookData.intent.nonce,            // 32 bytes
      hookData.orderId                  // 32 bytes
    ]
  );

  // Pack the dynamic signature data
  const packedDynamic = encodePacked(
    ['uint16', 'bytes'],
    [signatureLength, hookData.signature]
  );

  // Combine fixed and dynamic parts
  return encodePacked(
    ['bytes', 'bytes'],
    [packedFixed, packedDynamic]
  );
}

/**
 * Calculate the packed size of PaymentIntentHookData
 */
export function getPackedSize(hookData: PaymentIntentHookData): number {
  const signatureLength = (hookData.signature.length - 2) / 2; // Remove 0x and convert hex to bytes
  return 254 + signatureLength; // 252 bytes fixed + 2 bytes length + signature bytes
}

/**
 * Validate if the hookData can be properly packed
 */
export function validatePackableHookData(hookData: PaymentIntentHookData): { valid: boolean; error?: string } {
  const signatureLength = (hookData.signature.length - 2) / 2;
  
  if (signatureLength > 65535) {
    return { valid: false, error: 'Signature too long (max 65535 bytes)' };
  }
  
  if (signatureLength === 0) {
    return { valid: false, error: 'Signature cannot be empty' };
  }
  
  if (hookData.intent.quantityType < 0 || hookData.intent.quantityType > 1) {
    return { valid: false, error: 'Invalid quantity type' };
  }
  
  if (hookData.intent.signerType < 0 || hookData.intent.signerType > 1) {
    return { valid: false, error: 'Invalid signer type' };
  }
  
  return { valid: true };
}

/**
 * Hash a PaymentIntent for signature verification
 */
export function hashPaymentIntent(intent: PaymentIntent): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256', name: 'amount' },
      { type: 'uint256', name: 'feeBps' },
      { type: 'address', name: 'feeRecipient' },
      { type: 'address', name: 'merchant' },
      { type: 'uint256', name: 'salt' },
      { type: 'uint8', name: 'quantityType' },
      { type: 'uint256', name: 'quantity' },
      { type: 'uint8', name: 'signerType' },
      { type: 'address', name: 'signer' },
      { type: 'uint256', name: 'nonce' }
    ],
    [
      intent.amount,
      intent.feeBps,
      intent.feeRecipient,
      intent.merchant,
      intent.salt,
      intent.quantityType,
      intent.quantity,
      intent.signerType,
      intent.signer,
      intent.nonce
    ]
  );
  
  return keccak256(encoded);
}

/**
 * Create a sample PaymentIntentHookData for testing
 */
export function createSampleHookData(): PaymentIntentHookData {
  return {
    intent: {
      amount: 1000000n, // 1 USDC (6 decimals)
      feeBps: 250n, // 2.5%
      feeRecipient: '0x742d35Cc6539C1f7C3F6f6B0e7e1a7f6b9e8d9c8',
      merchant: '0x123d35Cc6539C1f7C3F6f6B0e7e1a7f6b9e8d9c8',
      salt: 12345n,
      quantityType: QuantityType.UNLIMITED,
      quantity: 0n,
      signerType: SignerType.MERCHANT,
      signer: '0x123d35Cc6539C1f7C3F6f6B0e7e1a7f6b9e8d9c8',
      nonce: 1n
    },
    orderId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
  };
}

/**
 * Compare packed size vs ABI encoded size
 */
export function compareSizes(hookData: PaymentIntentHookData): { packedSize: number; abiSize: number; savings: number } {
  const packedSize = getPackedSize(hookData);
  
  // Estimate ABI encoded size (this is approximate)
  const abiEncoded = encodeAbiParameters(
    [
      { 
        type: 'tuple', 
        components: [
          { type: 'uint256', name: 'amount' },
          { type: 'uint256', name: 'feeBps' },
          { type: 'address', name: 'feeRecipient' },
          { type: 'address', name: 'merchant' },
          { type: 'uint256', name: 'salt' },
          { type: 'uint8', name: 'quantityType' },
          { type: 'uint256', name: 'quantity' },
          { type: 'uint8', name: 'signerType' },
          { type: 'address', name: 'signer' },
          { type: 'uint256', name: 'nonce' }
        ]
      },
      { type: 'bytes32', name: 'orderId' },
      { type: 'bytes', name: 'signature' }
    ],
    [hookData.intent, hookData.orderId, hookData.signature]
  );
  
  const abiSize = (abiEncoded.length - 2) / 2; // Remove 0x and convert to bytes
  
  return {
    packedSize,
    abiSize,
    savings: Math.round(((abiSize - packedSize) / abiSize) * 100)
  };
} 