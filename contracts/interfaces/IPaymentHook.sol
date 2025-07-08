// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IPaymentHook {
    function executeHook(
      uint256 _burnAmount,
      uint256 _feeExecuted,
      address _messageSender,
      bytes calldata _structData
    ) external returns (bool);
}
