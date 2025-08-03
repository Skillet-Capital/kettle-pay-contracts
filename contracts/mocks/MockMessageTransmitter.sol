// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {IERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IReceiverV2} from "../../lib/evm-cctp-contracts/src/interfaces/v2/IReceiverV2.sol";
import {BurnMessageV2} from "../../lib/evm-cctp-contracts/src/messages/v2/BurnMessageV2.sol";
import {MessageV2} from "../../lib/evm-cctp-contracts/src/messages/v2/MessageV2.sol";
import {TypedMemView} from "../../lib/evm-cctp-contracts/lib/memview-sol/contracts/TypedMemView.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockMessageTransmitter is IReceiverV2 {
    using TypedMemView for bytes;
    using TypedMemView for bytes29;

    MockERC20 public token;

    constructor(address _token) {
        token = MockERC20(_token);
    }

    function receiveMessage(bytes calldata _message, bytes calldata _attestation) external override returns (bool) {
        bytes29 _msg = _message.ref(0);
        bytes29 _msgBody = MessageV2._getMessageBody(_msg);
        uint256 feeExecuted = BurnMessageV2._getFeeExecuted(_msgBody);
        uint256 amount = BurnMessageV2._getAmount(_msgBody);

        token.mint(msg.sender, amount - feeExecuted);

        return true;
    }
}
