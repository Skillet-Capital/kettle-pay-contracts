// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {IERC20} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import {IReceiverV2} from "../lib/evm-cctp-contracts/src/interfaces/v2/IReceiverV2.sol";
import {TypedMemView} from "../lib/evm-cctp-contracts/lib/memview-sol/contracts/TypedMemView.sol";
import {MessageV2} from "../lib/evm-cctp-contracts/src/messages/v2/MessageV2.sol";
import {BurnMessageV2} from "../lib/evm-cctp-contracts/src/messages/v2/BurnMessageV2.sol";
import {AccessControl} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

import {IPaymentHook} from "./interfaces/IPaymentHook.sol";
import {PaymentIntent, PaymentIntentHookData} from "./Structs.sol";

/**
 * @title CCTPHookWrapper
 * @notice Calls CCTP's receive message
 * @dev Intended to only work with CCTP v2 message formats and interfaces.
 */
contract CCTPMintHookWrapper is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

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

    // Address for the recovery wallet
    address public recoveryWallet;

    // ============ Constants ============

    // Address of the local message transmitter
    IReceiverV2 public immutable MESSAGE_TRANSMITTER;
    IERC20 public immutable USDC;

    // The supported Message Format version
    uint32 public constant SUPPORTED_MESSAGE_VERSION = 1;

    // The supported Message Body version
    uint32 public constant SUPPORTED_MESSAGE_BODY_VERSION = 1;

    // setup the relayer role
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    // ============ Libraries ============
    using TypedMemView for bytes;
    using TypedMemView for bytes29;

    event CCTPHookExecuted(bytes32 indexed nonce, PaymentIntentOrder order);

    event CCTPMessageConsumed(
        bytes29 indexed msg,
        bytes29 indexed msgBody,
        bytes32 nonce,
        BurnMessageFields fields
    );

    // ============ Constructor ============
    /**
     * @param _messageTransmitter The address of the local message transmitter
     */
    constructor(address _usdc, address _messageTransmitter) {
        require(
            _messageTransmitter != address(0),
            "Message transmitter is the zero"
        );

        require(
            _usdc != address(0),
            "USDC is the zero"
        );

        MESSAGE_TRANSMITTER = IReceiverV2(_messageTransmitter);
        USDC = IERC20(_usdc);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(RELAYER_ROLE, msg.sender);
    }

    function setRecoveryWallet(address _recoveryWallet) external onlyAdmin {
        recoveryWallet = _recoveryWallet;
    }

    /// @notice Save the relay message
    /// @dev This is used to save the relay message for recovery purposes
    /// @dev Funds will be sent to the recovery address
    /// @dev message will be consumed and unusable after this function is called
    /// @dev ONLY CALL IF INTENT IS FAILING TO EXECUTE
    /// @param message The message to save
    /// @param attestation The attestation to save
    function saveRelay(
        bytes calldata message,
        bytes calldata attestation
    ) external virtual nonReentrant onlyRelayer {
        (
            bytes29 _msg,
            bytes29 _msgBody,
            bytes32 _nonce,
            BurnMessageFields memory _fields
        ) = _consumeMessage(message, attestation);

        address mintRecipient = _bytes32ToAddress(_fields.mintRecipient);

        // we can only recover the USDC if the mint recipient is the wrapper
        if (mintRecipient == address(this)) {
            USDC.safeTransfer(
                recoveryWallet,
                _fields.amount - _fields.feeExecuted
            );
        }
    }

    /// @notice Relay the intent to the payment hook
    /// @dev This function is used to relay the intent to the payment hook
    /// @dev This function is only callable by the relayer
    /// @param message The message to relay
    /// @param attestation The attestation to relay
    /// @param intent The intent to relay
    /// @param signature The signature of the intent
    function relayIntent(
        bytes calldata message,
        bytes calldata attestation,
        PaymentIntent memory intent,
        bytes memory signature
    ) external virtual nonReentrant onlyRelayer {
        (
            bytes29 _msg,
            bytes29 _msgBody,
            bytes32 _nonce,
            BurnMessageFields memory _fields
        ) = _consumeMessage(message, attestation);

        // Handle hook if present
        bytes29 _hookData = BurnMessageV2._getHookData(_msgBody);
        bytes memory _structData = _hookData.clone();

        // Decode the struct data into a PaymentIntentOrder and verify the intent hash
        PaymentIntentOrder memory order = _decodePaymentIntentOrder(_structData);

        // Execute the payment hook
        _executePaymentHook(_nonce, order, _fields, intent, signature);

        emit CCTPHookExecuted(_nonce, order);
    }

    function _consumeMessage(
        bytes calldata message,
        bytes calldata attestation
    )
        internal
        returns (
            bytes29 _msg,
            bytes29 _msgBody,
            bytes32 _nonce,
            BurnMessageFields memory _fields
        )
    {
        // Validate message
        _msg = message.ref(0);
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

        _nonce = MessageV2._getNonce(_msg);
        _fields = _parseBurnMessageFields(_msgBody);

        emit CCTPMessageConsumed(_msg, _msgBody, _nonce, _fields);

        return (_msg, _msgBody, _nonce, _fields);
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

        // reset the approval for the burn token
        USDC.safeApprove(_order.target, 0);

        // approve the mint recipient to spend the burn token
        USDC.safeApprove(_order.target, _fields.amount - _fields.feeExecuted);

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
        USDC.safeApprove(_order.target, 0);
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

    function _decodePaymentIntentOrder(
        bytes memory data
    ) internal pure returns (PaymentIntentOrder memory order) {
        require(data.length == 84, "Invalid hook data length");

        address target;
        bytes32 orderId;
        bytes32 intentHash;

        assembly {
            target := shr(96, mload(add(data, 32)))
            orderId := mload(add(data, 52))
            intentHash := mload(add(data, 84))
        }

        order = PaymentIntentOrder({
            target: target,
            orderId: orderId,
            intentHash: intentHash
        });
    }

    modifier onlyAdmin() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Only admin"
        );
        _;
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
