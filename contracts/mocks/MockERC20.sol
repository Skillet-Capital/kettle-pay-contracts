// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Simple mock ERC20 token with 6 decimals for testing.
 */
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        _setupDecimals(6);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
