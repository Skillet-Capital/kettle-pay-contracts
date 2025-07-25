// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Simple mock ERC20 token with 6 decimals for testing.
 */
contract MockWeth is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {
        _setupDecimals(6);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }
}
