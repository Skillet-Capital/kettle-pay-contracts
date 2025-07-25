// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {IERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IReceiverV2} from "../../lib/evm-cctp-contracts/src/interfaces/v2/IReceiverV2.sol";
import {TypedMemView} from "../../lib/evm-cctp-contracts/lib/memview-sol/contracts/TypedMemView.sol";
import {MessageV2} from "../../lib/evm-cctp-contracts/src/messages/v2/MessageV2.sol";
import {BurnMessageV2} from "../../lib/evm-cctp-contracts/src/messages/v2/BurnMessageV2.sol";
import {AccessControl} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

import {IPaymentHook} from "../interfaces/IPaymentHook.sol";
import {PaymentIntent, PaymentIntentHookData} from "../Structs.sol";

/**
 * @title CCTPHookWrapper
 * @notice Calls CCTP's receive message
 * @dev Intended to only work with CCTP v2 message formats and interfaces.
 */
contract CCTPMintHookWrapper is AccessControl, ReentrancyGuard {
    struct BurnMessageFields {
        uint32 version;
        bytes32 burnToken;
        bytes32 mintRecipient;
        uint256 amount;
        bytes32 messageSender;
        uint256 maxFee;
        uint256 feeExecuted;
        uint256 expirationBlock;
    }

    struct PaymentIntentOrder {
        address target;
        bytes32 orderId;
        bytes32 intentHash;
    }

    // ============ Constants ============
    // Address of the local message transmitter
    IReceiverV2 public immutable MESSAGE_TRANSMITTER;

    // The supported Message Format version
    uint32 public constant SUPPORTED_MESSAGE_VERSION = 1;

    // The supported Message Body version
    uint32 public constant SUPPORTED_MESSAGE_BODY_VERSION = 1;

    // setup the relayer role
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant RECOVERY_ROLE = keccak256("RECOVERY_ROLE");

    // ============ Libraries ============
    using TypedMemView for bytes;
    using TypedMemView for bytes29;

    event CCTPHookExecuted(
        bytes32 indexed nonce,
        PaymentIntentOrder order
    );

    // ============ Constructor ============
    /**
     * @param _messageTransmitter The address of the local message transmitter
     */
    constructor(address _messageTransmitter) {
        require(
            _messageTransmitter != address(0),
            "Message transmitter is the zero"
        );

        MESSAGE_TRANSMITTER = IReceiverV2(_messageTransmitter);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(RECOVERY_ROLE, msg.sender);
        _setupRole(RELAYER_ROLE, msg.sender);
    }

    // ============ External Functions  ============
    function relayIntent(
        bytes calldata message,
        bytes calldata attestation,
        PaymentIntent memory intent,
        bytes memory signature
    ) external virtual nonReentrant onlyRelayer {
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
            BurnMessageV2._getVersion(_msgBody) ==
                SUPPORTED_MESSAGE_BODY_VERSION,
            "Invalid message body version"
        );

        // Relay message
        require(
            MESSAGE_TRANSMITTER.receiveMessage(message, attestation),
            "Receive message failed"
        );

        // Extract message nonce
        bytes32 _nonce = MessageV2._getNonce(_msg);

        // Handle hook if present
        bytes29 _hookData = BurnMessageV2._getHookData(_msgBody);

        // clone the hook data into memory
        bytes memory _structData = _hookData.clone();

        // parse the burn message fields
        BurnMessageFields memory fields = _parseBurnMessageFields(_msgBody);

        // decode the struct data into a PaymentIntentOrder and verify the intent hash
        PaymentIntentOrder memory order = abi.decode(
            _structData,
            (PaymentIntentOrder)
        );

        // approve the mint recipient to spend the burn token
        _executePaymentHook(_nonce, order, fields, intent, signature);

        emit CCTPHookExecuted(
            _nonce,
            order
        );
    }

    function _executePaymentHook(
        bytes32 _nonce,
        PaymentIntentOrder memory _order,
        BurnMessageFields memory _fields,
        PaymentIntent memory _intent,
        bytes memory _signature
    ) internal {
        require(
            IPaymentHook(_order.target).hashPaymentIntent(_intent) ==
                _order.intentHash,
            "Invalid intent hash"
        );

        // approve the mint recipient to spend the burn token
        _approveTarget(
            _fields.burnToken,
            _order.target,
            _fields.amount - _fields.feeExecuted
        );

        PaymentIntentHookData memory hookData = PaymentIntentHookData({
            orderId: _order.orderId,
            intent: _intent,
            signature: _signature
        });

        // execute the payment hook
        IPaymentHook(_order.target).executePaymentHook(
            _nonce,
            _fields.version,
            _fields.burnToken,
            _fields.mintRecipient,
            _fields.amount,
            _fields.messageSender,
            _fields.maxFee,
            _fields.feeExecuted,
            _fields.expirationBlock,
            hookData
        );

        // reset the approval for the burn token
        _approveTarget(_fields.burnToken, _order.target, 0);
    }

    function _approveTarget(
        bytes32 _burnToken,
        address _target,
        uint256 _amount
    ) internal {
        IERC20(_bytes32ToAddress(_burnToken)).approve(_target, _amount);
    }

    function _bytes32ToAddress(
        bytes32 _bytes32
    ) internal pure returns (address) {
        return address(uint160(uint256(_bytes32)));
    }

    function _parseBurnMessageFields(
        bytes29 _msgBody
    ) internal pure returns (BurnMessageFields memory fields) {
        fields.version = BurnMessageV2._getVersion(_msgBody);
        fields.burnToken = BurnMessageV2._getBurnToken(_msgBody);
        fields.mintRecipient = BurnMessageV2._getMintRecipient(_msgBody);
        fields.amount = BurnMessageV2._getAmount(_msgBody);
        fields.messageSender = BurnMessageV2._getMessageSender(_msgBody);
        fields.maxFee = BurnMessageV2._getMaxFee(_msgBody);
        fields.feeExecuted = BurnMessageV2._getFeeExecuted(_msgBody);
        fields.expirationBlock = BurnMessageV2._getExpirationBlock(_msgBody);
    }

    modifier onlyRelayer() {
        require(
            hasRole(RELAYER_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Only relayer or admin"
        );
        _;
    }
}
