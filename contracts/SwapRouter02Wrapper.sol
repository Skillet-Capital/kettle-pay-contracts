// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {IWETH} from "./interfaces/IWETH.sol";
import {ISwapTarget} from "./interfaces/ISwapTarget.sol";
import {ReentrancyGuard} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import {IERC20} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface for Uniswap V3 Router02 multicall + unwrap
interface ISwapRouter02 {
    function multicall(
        uint256 deadline,
        bytes[] calldata data
    ) external payable returns (bytes[] memory results);

    function unwrapWETH9(
        uint256 amountMinimum,
        address recipient
    ) external payable;
}

contract SwapRouter02Wrapper is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Uniswap SwapRouter02
    ISwapRouter02 public immutable SWAP_ROUTER_02;
    /// @notice Hook for burning output
    address public immutable BURN_HOOK;
    /// @notice Hook for payment handling
    address public immutable PAYMENT_HANDLER;

    /// @notice Which hook to call after swap
    enum Hook {
        Burn,
        PaymentHandler
    }

    event SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountInUsed,
        uint256 amountOut,
        uint256 tokenInRefund,
        uint256 tokenOutLeftover
    );

    constructor(
        address _swapRouter,
        address _burnHook,
        address _paymentHandler
    ) {
        SWAP_ROUTER_02 = ISwapRouter02(_swapRouter);
        BURN_HOOK = _burnHook;
        PAYMENT_HANDLER = _paymentHandler;
    }

    struct RouteParams {
        address tokenIn; // zero = ETH
        address tokenOut; // zero = ETH
        uint256 amountInMax;
        uint256 amountOut;
        uint256 deadline;
        bytes[] swapCalls; // full bytes[] from off-chain quoting
        Hook hook;
        bytes structData; // opaque context for ISwapTarget hook
    }

    receive() external payable {}

    function executeSwap(RouteParams calldata p) external payable nonReentrant {
        require(p.tokenIn != p.tokenOut, "Invalid token pair");
        require(p.tokenOut != address(0), "tokenOut cannot be ETH");

        // pull in funds
        if (p.tokenIn == address(0)) {
            require(msg.value == p.amountInMax, "Invalid ETH amount");
        } else {
            IERC20(p.tokenIn).safeTransferFrom(
                msg.sender,
                address(this),
                p.amountInMax
            );
        }

        uint256 preNative = _balanceOf(address(0)); // ETH balance before swap
        uint256 preIn = _balanceOf(p.tokenIn); // tokenIn balance before swap
        uint256 preOut = _balanceOf(p.tokenOut); // tokenOut balance before swap

        // approve router
        if (p.tokenIn != address(0)) {
            IERC20(p.tokenIn).safeApprove(address(SWAP_ROUTER_02), 0);
            IERC20(p.tokenIn).safeApprove(
                address(SWAP_ROUTER_02),
                p.amountInMax
            );
        }

        // multicall: swap steps
        SWAP_ROUTER_02.multicall{
            value: p.tokenIn == address(0) ? p.amountInMax : 0
        }(p.deadline, p.swapCalls);

        // reset approval
        if (p.tokenIn != address(0)) {
            IERC20(p.tokenIn).safeApprove(address(SWAP_ROUTER_02), 0);
        }

        // call swap target hook (revert if unknown hook target)
        address hookTarget = _hookTarget(p.hook);
        IERC20(p.tokenOut).safeApprove(hookTarget, p.amountOut);
        ISwapTarget(hookTarget).executeSwapHook(
            p.tokenIn,
            p.tokenOut,
            p.amountInMax,
            p.amountOut,
            p.structData
        );
        IERC20(p.tokenOut).safeApprove(hookTarget, 0);

        // compute any tokenIn leftover and return to user
        uint256 usedIn = preIn - _balanceOf(p.tokenIn);
        uint256 inLeft = (p.amountInMax > usedIn) ? p.amountInMax - usedIn : 0;
        if (inLeft > 0) {
            if (p.tokenIn == address(0)) {
                (bool sent, ) = msg.sender.call{value: inLeft}("");
                require(sent, "ETH refund failed");
            } else {
                IERC20(p.tokenIn).safeTransfer(msg.sender, inLeft);
            }
        }

        // compute any tokenOut leftover and return to user
        uint256 outLeft = _balanceOf(p.tokenOut) - preOut;
        if (outLeft > 0) {
            if (p.tokenOut == address(0)) {
                (bool sent, ) = msg.sender.call{value: outLeft}("");
                require(sent, "ETH refund failed");
            } else {
                IERC20(p.tokenOut).safeTransfer(msg.sender, outLeft);
            }
        }

        // Return any native ETH dust (from unwrapWETH9)
        uint256 postNative = _balanceOf(address(0));
        if (postNative > preNative) {
            uint256 nativeDust = postNative - preNative;
            (bool sent, ) = msg.sender.call{value: nativeDust}("");
            require(sent, "Native dust refund failed");
        }

        emit SwapExecuted(
            msg.sender,
            p.tokenIn,
            p.tokenOut,
            usedIn,
            p.amountOut,
            inLeft,
            outLeft
        );
    }

    /// @dev ETH-balance when token==0, else ERC20.balanceOf
    function _balanceOf(address token) internal view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    function _hookTarget(Hook hook) internal view returns (address) {
        if (hook == Hook.Burn) {
            require(BURN_HOOK != address(0), "Burn hook not set");
            return BURN_HOOK;
        } else if (hook == Hook.PaymentHandler) {
            require(PAYMENT_HANDLER != address(0), "Payment handler not set");
            return PAYMENT_HANDLER;
        } else {
            revert("Invalid hook");
        }
    }
}
