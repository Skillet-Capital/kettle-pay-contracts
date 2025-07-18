// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {ISwapTarget} from "../interfaces/ISwapTarget.sol";
import {TokenMessengerV2} from "../../lib/evm-cctp-contracts/src/v2/TokenMessengerV2.sol";
import {IERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";

contract CCTPBurnHookWrapper is ISwapTarget {
    using SafeERC20 for IERC20;

    struct BurnMessageFields {
        uint256 amount;
        uint32 destinationDomain;
        bytes32 mintRecipient;
        address burnToken;
        bytes32 destinationCaller;
        uint256 maxFee;
        uint32 minFinalityThreshold;
        bytes hookData;
    }

    address public immutable TOKEN_MESSENGER;

    constructor(address _tokenMessenger) {
        TOKEN_MESSENGER = _tokenMessenger;
    }

    function executeSwapHook(
        address /*_tokenIn*/,
        address /*_tokenOut*/,
        uint256 /*_amountInMax*/,
        uint256 /*_amountOut*/,
        bytes calldata _structData
    ) external override returns (bool) {

        require(_structData.length > 0, "Invalid struct data");

        BurnMessageFields memory burnMessageFields = abi.decode(
            _structData,
            (BurnMessageFields)
        );

        // pull funds from the msg.sender
        IERC20(burnMessageFields.burnToken).safeTransferFrom(
            msg.sender,
            address(this),
            burnMessageFields.amount
        );

        // Approve tokenMessenger to pull tokenIn
        IERC20(burnMessageFields.burnToken).safeApprove(
            TOKEN_MESSENGER,
            burnMessageFields.amount
        );

        TokenMessengerV2(TOKEN_MESSENGER).depositForBurnWithHook(
            burnMessageFields.amount,
            burnMessageFields.destinationDomain,
            burnMessageFields.mintRecipient,
            burnMessageFields.burnToken,
            burnMessageFields.destinationCaller,
            burnMessageFields.maxFee,
            burnMessageFields.minFinalityThreshold,
            burnMessageFields.hookData
        );

        // Reset approval for tokenIn
        IERC20(burnMessageFields.burnToken).safeApprove(TOKEN_MESSENGER, 0);

        emit BurnHookExecuted(
            burnMessageFields.amount,
            burnMessageFields.destinationDomain,
            burnMessageFields.mintRecipient,
            burnMessageFields.burnToken,
            burnMessageFields.destinationCaller,
            burnMessageFields.maxFee,
            burnMessageFields.minFinalityThreshold,
            burnMessageFields.hookData
        );
        return true;
    }
}
