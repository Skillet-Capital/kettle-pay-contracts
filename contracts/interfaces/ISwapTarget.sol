// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface ISwapTarget {
    /// @notice Executes the swap hook
    /// @param _tokenIn The token that was burned
    /// @param _tokenOut The token that was minted
    /// @param _amountInMax The maximum amount of tokens that were burned
    /// @param _amountOutMin The minimum amount of tokens that were minted
    /// @param _structData The struct data for the swap
    /// @return success Whether the swap was successful
    function executeSwapHook(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountInMax,
        uint256 _amountOutMin,
        bytes calldata _structData
    ) external returns (bool);

    event BurnHookExecuted(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes hookData
    );
}
