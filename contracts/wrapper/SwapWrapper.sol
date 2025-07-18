// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {IWETH} from "../interfaces/IWETH.sol";
import {ISwapTarget} from "../interfaces/ISwapTarget.sol";
import {ReentrancyGuard} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import {IERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract SwapWrapper is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable WETH;

    event SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountInUsed,
        uint256 amountOut,
        uint256 tokenInRefund,
        uint256 tokenOutLeftover
    );

    constructor(address _weth) {
        WETH = _weth;
    }

    struct RouteParams {
        address tokenIn;
        address tokenOut;
        uint256 amountInMax;
        uint256 amountOut;
        address liquidityTarget;
        bytes liquidityCalldata;
        address target;
        bytes structData;
    }

    receive() external payable {}

    function executeSwap(
        RouteParams calldata params
    ) external payable nonReentrant {
        if (params.tokenIn == address(0)) {
            require(msg.value == params.amountInMax, "Invalid ETH amount");
            IWETH(WETH).deposit{value: msg.value}();
        } else {
            IERC20(params.tokenIn).safeTransferFrom(
                msg.sender,
                address(this),
                params.amountInMax
            );
        }

        uint256 preTokenInBalance = getBalance(params.tokenIn);
        uint256 preTokenOutBalance = getBalance(params.tokenOut);

        // Approve liquidity target to pull tokenIn (if needed)
        if (params.tokenIn != address(0)) {
            IERC20(params.tokenIn).safeApprove(params.liquidityTarget, 0);
            IERC20(params.tokenIn).safeApprove(
                params.liquidityTarget,
                params.amountInMax
            );
        } else {
            IWETH(WETH).approve(params.liquidityTarget, params.amountInMax);
        }

        // solhint-disable-next-line avoid-low-level-calls
        (bool swapSuccess, ) = params.liquidityTarget.call(
            params.liquidityCalldata
        );
        require(swapSuccess, "liquidityTarget call failed");

        // Reset approval for tokenIn
        if (params.tokenIn != address(0)) {
            IERC20(params.tokenIn).safeApprove(params.liquidityTarget, 0);
        } else {
            IWETH(WETH).approve(params.liquidityTarget, 0);
        }

        // Determine how much of the input token was used
        uint256 usedAmountIn = preTokenInBalance - getBalance(params.tokenIn);

        // Approve target to pull tokenOut (if needed)
        if (params.tokenOut != address(0)) {
            IERC20(params.tokenOut).safeApprove(params.target, 0);
            IERC20(params.tokenOut).safeApprove(
                params.target,
                params.amountOut
            );
        }

        // Call final target
        ISwapTarget(params.target).executeSwapHook(
            params.tokenIn,
            params.tokenOut,
            params.amountInMax,
            params.amountOut,
            params.structData
        );

        // Reset approval for tokenOut
        if (params.tokenOut != address(0)) {
            IERC20(params.tokenOut).safeApprove(params.target, 0);
        }

        // Return leftover tokenIn to sender
        uint256 tokenInLeftover = params.amountInMax - usedAmountIn;

        if (tokenInLeftover > 0) {
            if (params.tokenIn == address(0)) {
                IWETH(WETH).withdraw(tokenInLeftover);
                (bool sent, ) = msg.sender.call{value: tokenInLeftover}("");
                require(sent, "ETH refund failed");
            } else {
                IERC20(params.tokenIn).safeTransfer(
                    msg.sender,
                    tokenInLeftover
                );
            }
        }

        // Return leftover tokenOut to sender
        uint256 tokenOutLeftover = getBalance(params.tokenOut) -
            preTokenOutBalance;

        if (tokenOutLeftover > 0) {
            if (params.tokenOut == address(0)) {
                IWETH(WETH).withdraw(tokenOutLeftover);
                (bool sent, ) = msg.sender.call{value: tokenOutLeftover}("");
                require(sent, "ETH refund failed");
            } else {
                IERC20(params.tokenOut).safeTransfer(
                    msg.sender,
                    tokenOutLeftover
                );
            }
        }

        emit SwapExecuted(
            msg.sender,
            params.tokenIn,
            params.tokenOut,
            usedAmountIn,
            params.amountOut,
            tokenInLeftover,
            tokenOutLeftover
        );
    }

    function getBalance(address token) internal view returns (uint256) {
        if (token == address(0) || token == WETH) {
            return IWETH(WETH).balanceOf(address(this));
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }
}
