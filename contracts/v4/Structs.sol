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
    SignerType signerType;
    address signer;
    uint256 nonce;
}

struct PaymentIntentHookData {
    PaymentIntent intent;
    bytes32 orderId;
    bytes signature;
}
