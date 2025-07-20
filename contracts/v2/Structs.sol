// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

enum QuantityType {
  FIXED,
  UNLIMITED
}

enum SignerType {
  MERCHANT,
  OPERATOR
}

struct PaymentIntent {
    uint256 amount;
    uint256 feeBps;
    address feeRecipient;
    address merchant;
    uint256 salt;
    QuantityType quantityType;
    uint256 quantity;
    uint256 nonce;
    SignerType signerType;
    address signer;
}

struct PaymentIntentHookData {
    PaymentIntent intent;
    bytes signature;
}
