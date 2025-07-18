// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import {IERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";

contract SafeTransferV2 {

    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    constructor(address _token) {
        token = IERC20(_token);
    }

    event SafeTransferToToken(address indexed token, address indexed from, address indexed to, uint256 value);
    
    function safeTransfer(address to, uint256 value) external {
        token.safeTransferFrom(msg.sender, to, value);
        emit SafeTransferToToken(address(token), msg.sender, to, value);
    }
}
