// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import {IERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";

contract SafeTransfer {

    using SafeERC20 for IERC20;

    event SafeTransferToToken(address indexed from, address indexed to, uint256 value);
    
    function safeTransfer(address token, address to, uint256 value) external {
        IERC20(token).safeTransferFrom(msg.sender, to, value);
        emit SafeTransferToToken(msg.sender, to, value);
    }
}
