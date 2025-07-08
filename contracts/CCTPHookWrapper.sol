// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import {IReceiverV2} from "../lib/evm-cctp-contracts/src/interfaces/v2/IReceiverV2.sol";
import {TypedMemView} from "../lib/evm-cctp-contracts/lib/memview-sol/contracts/TypedMemView.sol";
import {MessageV2} from "../lib/evm-cctp-contracts/src/messages/v2/MessageV2.sol";
import {BurnMessageV2} from "../lib/evm-cctp-contracts/src/messages/v2/BurnMessageV2.sol";
import {Ownable2Step} from "../lib/evm-cctp-contracts/src/roles/Ownable2Step.sol";

import {IPaymentHook} from "./interfaces/IPaymentHook.sol";

/**
 * @title CCTPHookWrapper
 * @notice A sample wrapper around CCTP v2 that relays a message and
 * optionally executes the hook contained in the Burn Message.
 * @dev Intended to only work with CCTP v2 message formats and interfaces.
 */
contract CCTPHookWrapper is Ownable2Step {
    // ============ Constants ============
    // Address of the local message transmitter
    IReceiverV2 public immutable MESSAGE_TRANSMITTER;

    // The supported Message Format version
    uint32 public constant SUPPORTED_MESSAGE_VERSION = 1;

    // The supported Message Body version
    uint32 public constant SUPPORTED_MESSAGE_BODY_VERSION = 1;

    // ============ Libraries ============
    using TypedMemView for bytes;
    using TypedMemView for bytes29;

    // ============ Constructor ============
    /**
     * @param _messageTransmitter The address of the local message transmitter
     */
    constructor(address _messageTransmitter) Ownable2Step() {
        require(
            _messageTransmitter != address(0),
            "Message transmitter is the zero"
        );

        MESSAGE_TRANSMITTER = IReceiverV2(_messageTransmitter);
    }

    // ============ External Functions  ============
    /**
     * @notice Relays a burn message to a local message transmitter
     * and executes the hook, if present.
     *
     * @dev This function is permissionless and can be called by anyone. The hook target is determined
     * by the mintRecipient field in the burn message, which must implement the IPaymentHook interface.
     * The hook is called with the executeHook function, passing burn amount, fee executed, message sender,
     * and the raw hook data from the burn message.
     *
     * @dev The hook data can be any arbitrary bytes and is passed directly to the hook target's
     * executeHook function as the _structData parameter.
     *
     * WARNING: this implementation does NOT enforce atomicity in the hook call. This is to prevent a failed hook call
     * from preventing relay of a message if this contract is set as the destinationCaller.
     *
     * @dev Reverts if the receiveMessage() call to the local message transmitter reverts, or returns false.
     * @param message The message to relay, as bytes
     * @param attestation The attestation corresponding to the message, as bytes
     * @return relaySuccess True if the call to the local message transmitter succeeded.
     * @return hookSuccess True if the call to the hook target succeeded. False if the hook call failed,
     * or if no hook was present.
     * @return hookReturnData The data returned from the call to the hook target. This will be empty
     * if there was no hook in the message.
     */
    function relay(
        bytes calldata message,
        bytes calldata attestation
    )
        external
        virtual
        returns (
            bool relaySuccess,
            bool hookSuccess,
            bytes memory hookReturnData
        )
    {
        // Validate message
        bytes29 _msg = message.ref(0);
        MessageV2._validateMessageFormat(_msg);
        require(
            MessageV2._getVersion(_msg) == SUPPORTED_MESSAGE_VERSION,
            "Invalid message version"
        );

        // Validate burn message
        bytes29 _msgBody = MessageV2._getMessageBody(_msg);
        BurnMessageV2._validateBurnMessageFormat(_msgBody);
        require(
            BurnMessageV2._getVersion(_msgBody) == SUPPORTED_MESSAGE_BODY_VERSION,
            "Invalid message body version"
        );

        // Relay message
        relaySuccess = MESSAGE_TRANSMITTER.receiveMessage(message, attestation);
        require(relaySuccess, "Receive message failed");

        // Handle hook if present
        bytes29 _hookData = BurnMessageV2._getHookData(_msgBody);

        if (_hookData.isValid()) {

            // clone struct data into memory from hook data pointer
            bytes memory _structData = _hookData.clone();

            // extract burn amount and fees
            uint256 _burnAmount = BurnMessageV2._getAmount(_msgBody);
            uint256 _feeExecuted = BurnMessageV2._getFeeExecuted(_msgBody);

            // extract message sender and message recipient (implents IPaymentHook)
            address _messageSender = address(
                uint160(uint256(BurnMessageV2._getMessageSender(_msgBody)))
            );
            address _mintRecipient = address(
                uint160(uint256(BurnMessageV2._getMintRecipient(_msgBody)))
            );

            bytes memory callData = abi.encodeWithSelector(
                IPaymentHook.executeHook.selector,
                _burnAmount,
                _feeExecuted,
                _messageSender,
                _structData
            );

            (hookSuccess, hookReturnData) = _executeHook(
                _mintRecipient,
                callData
            );
        }
    }

    // ============ Internal Functions  ============
    /**
     * @notice Handles hook data by executing a call to a target address
     * @dev Can be overridden to customize execution behavior
     * @dev Does not revert if the CALL to the hook target fails
     * @param _hookTarget The target address of the hook
     * @param _hookCalldata The hook calldata
     * @return _success True if the call to the encoded hook target succeeds
     * @return _returnData The data returned from the call to the hook target
     */
    function _executeHook(
        address _hookTarget,
        bytes memory _hookCalldata
    ) internal virtual returns (bool _success, bytes memory _returnData) {
        (_success, _returnData) = address(_hookTarget).call(_hookCalldata);
    }
}
