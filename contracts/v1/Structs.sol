// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

struct PaymentIntent {
    uint256 amount;
    uint256 feeBps;
    address feeRecipient;
    address merchant;
    uint256 salt;
}

struct PaymentIntentHookData {
    PaymentIntent intent;
    bytes signature;
}
