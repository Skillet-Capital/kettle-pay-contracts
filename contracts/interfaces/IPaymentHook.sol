// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IPaymentHook {
  
    function executeHook(
      uint32 _version,
      bytes32 _burnToken,
      bytes32 _mintRecipient,
      uint256 _amount,
      bytes32 _messageSender,
      uint256 _maxFee,
      uint256 _feeExecuted,
      uint256 _expirationBlock,
      bytes calldata _structData
    ) external returns (bool);

    event CCTPHookExecuted(
        uint256 indexed executionId,
        uint32 version,
        bytes32 burnToken,
        bytes32 mintRecipient,
        uint256 amount,
        bytes32 messageSender,
        uint256 maxFee,
        uint256 feeExecuted,
        uint256 expirationBlock,
        bytes structData
    );
}
