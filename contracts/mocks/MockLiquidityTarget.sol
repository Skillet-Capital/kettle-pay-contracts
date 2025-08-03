// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import {MockERC20} from "./MockERC20.sol";

contract MockLiquidityTarget {
    function mint(
        address token,
        uint256 amount
    ) external {
        MockERC20(token).mint(msg.sender, amount);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountInMax,
        uint256 amountOut
    ) external {
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountInMax);
        MockERC20(tokenOut).mint(msg.sender, amountOut);
    }

    function swapWithSlippage(
        address tokenIn,
        address tokenOut,
        uint256 amountInMax,
        uint256 amountOut,
        uint256 slippageBps
    ) external {
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountInMax * (10000 - slippageBps) / 10000);
        MockERC20(tokenOut).mint(msg.sender, amountOut);
    }

    function swapWithOverflow(
        address tokenIn,
        address tokenOut,
        uint256 amountInMax,
        uint256 amountOut
    ) external {
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountInMax * (10000 - 1000) / 10000);
        MockERC20(tokenOut).mint(msg.sender, amountOut * 2);
    }
}
