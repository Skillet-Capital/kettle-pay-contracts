// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {PaymentIntent, PaymentIntentHookData} from "../Structs.sol";

interface IPaymentHook {
    /// @notice Executes the payment intent hook
    /// @param _nonce The nonce of the cctp burn message
    /// @param _version The version of the cctp burn message
    /// @param _burnToken The token that was burned
    /// @param _mintRecipient The address that received the mint
    /// @param _amount The amount of the payment intent
    /// @param _messageSender The address that sent the message
    /// @param _maxFee The maximum fee that was executed
    function executePaymentHook(
        bytes32 _nonce,
        uint32 _version,
        bytes32 _burnToken,
        bytes32 _mintRecipient,
        uint256 _amount,
        bytes32 _messageSender,
        uint256 _maxFee,
        uint256 _feeExecuted,
        uint256 _expirationBlock,
        PaymentIntentHookData memory _paymentData
    ) external returns (bool);

    function hashPaymentIntent(
        PaymentIntent memory _intent
    ) external view returns (bytes32);
}
