// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

/// @title IWETH - Minimal interface for Wrapped Ether (WETH)
interface IWETH {
    /// @notice Deposit ETH and receive WETH
    function deposit() external payable;

    /// @notice Withdraw ETH by burning WETH
    /// @param wad Amount of WETH to withdraw
    function withdraw(uint256 wad) external;

    /// @notice Get balance of an account in WETH
    /// @param account Address to query balance for
    /// @return Balance in WETH
    function balanceOf(address account) external view returns (uint256);

    /// @notice Approve another address to spend WETH
    /// @param spender Address allowed to spend
    /// @param amount Amount allowed
    /// @return True if successful
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Transfer WETH to another address
    /// @param to Recipient
    /// @param amount Amount to transfer
    /// @return True if successful
    function transfer(address to, uint256 amount) external returns (bool);
}
