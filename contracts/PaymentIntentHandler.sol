// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {SafeERC20} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import {ReentrancyGuard} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/access/AccessControl.sol";
import {SafeMath} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/math/SafeMath.sol";
import {IERC20} from "../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {IPaymentHook} from "./interfaces/IPaymentHook.sol";
import {ISwapTarget} from "./interfaces/ISwapTarget.sol";
import {Signatures} from "./Signatures.sol";
import {PaymentIntentHookData, PaymentIntent, QuantityType, SignerType} from "./Structs.sol";

/// @notice Payment intent processor for Circle CCTP V2
contract PaymentIntentHandler is
    IPaymentHook,
    ISwapTarget,
    Signatures,
    ReentrancyGuard,
    AccessControl
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Tracks used orders to prevent replays
    mapping(bytes32 => bool) public orderIds;

    /// @notice Tracks used salts to prevent replays
    mapping(uint256 => uint256) public usages;

    /// @notice Tracks used nonces to prevent replays
    mapping(uint256 => uint256) public nonces;

    /// @notice Tracks deactivated intents
    mapping(address => mapping(uint256 => bool)) public deactivated;

    /// @notice USDC token address on this chain
    address public usdc;

    /// @notice The address of the CCTP hook wrapper
    address public hookWrapper;

    /// @notice Emitted upon succesful consumption of payment intent
    event PaymentIntentSuccess(
        bytes32 indexed consumptionNonce,
        bytes32 indexed orderId,
        PaymentIntent intent,
        uint256 feeExecuted,
        uint256 netMinted,
        uint256 netPayable,
        uint256 netFee,
        uint256 quantityUsed
    );

    /// @notice Emitted when the nonce of an intent is updated
    event PaymentIntentNonceUpdated(uint256 indexed salt, uint256 nonce);

    /// @notice Initializes the contract with the USDC and Circle Messenger addresses
    constructor(address _usdc, address _hookWrapper) Signatures() {
        require(_usdc != address(0), "Invalid USDC address");
        require(_hookWrapper != address(0), "Invalid hook wrapper address");

        usdc = _usdc;
        hookWrapper = _hookWrapper;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Deactivate a payment intent
    /// @param _salt The salt of the payment intent
    /// @param _deactivate Whether to deactivate the payment intent
    function toggleDeactivate(uint256 _salt, bool _deactivate) external {
        deactivated[msg.sender][_salt] = _deactivate;
    }

    /// @notice Validate a payment intent
    /// @param _orderId The order ID of the payment intent
    /// @param _intent The payment intent to validate
    /// @param _signature The signature of the payment intent
    /// @return isValid Whether the payment intent is valid
    function validateIntent(
        bytes32 _orderId,
        PaymentIntent memory _intent,
        bytes memory _signature
    ) public returns (bool) {
        require(
            !deactivated[_intent.merchant][_intent.salt],
            "Intent deactivated"
        );

        require(
            !orderIds[_orderId], 
            "Order ID already used"
        );

        // check the current nonce of the intent
        uint256 currentNonce = nonces[_intent.salt];
        require(
            _intent.nonce == currentNonce || _intent.nonce > currentNonce,
            "Using old intent nonce"
        );

        // check if the payment intent has been used
        uint256 usage = usages[_intent.salt];
        if (_intent.quantityType == QuantityType.FIXED) {
            require(usage < _intent.quantity, "Quantity already used");
        }

        // verify the intent signature by the merchant
        bytes32 _hash = _hashPaymentIntent(_intent);
        address signer = _resolveIntentSigner(_intent);
        _verifySignature(_hash, signer, _signature);

        return true;
    }

    /// @notice locally fulfill a payment intent
    /// @param _orderId The order ID of the payment intent
    /// @param _intent The payment intent to fulfill
    /// @param _signature The signature of the payment intent
    function fulfillIntent(
        bytes32 _orderId,
        PaymentIntent memory _intent,
        bytes memory _signature
    ) external nonReentrant returns (bool) {
        return 
            _fulfillIntent(
                bytes32(0),
                0, 
                _orderId, 
                _intent,
                _signature
            );
    }

    /// @inheritdoc ISwapTarget
    function executeSwapHook(
        address /*_tokenIn*/,
        address /*_tokenOut*/,
        uint256 /*_amountInMax*/,
        uint256 /*_amountOut*/,
        bytes calldata _structData
    ) external override nonReentrant returns (bool) {
        PaymentIntentHookData memory _paymentData = abi.decode(
            _structData,
            (PaymentIntentHookData)
        );

        return
            _fulfillIntent(
                bytes32(0),
                0,
                _paymentData.orderId,
                _paymentData.intent,
                _paymentData.signature
            );
    }

    /// @inheritdoc IPaymentHook
    function executePaymentHook(
        bytes32 _nonce,
        uint32 /* _version */,
        bytes32 /* _burnToken */,
        bytes32 /* _mintRecipient */,
        uint256 /* _amount */,
        bytes32 /* _messageSender */,
        uint256 /* _maxFee */,
        uint256 _feeExecuted,
        uint256 /* _expirationBlock */,
        PaymentIntentHookData memory _paymentData
    ) external override nonReentrant onlyHookWrapper returns (bool) {
        return
            _fulfillIntent(
                _nonce,
                _feeExecuted,
                _paymentData.orderId,
                _paymentData.intent,
                _paymentData.signature
            );
    }

    /// @notice locally fulfill a payment intent
    /// @param _feeExecuted The fee executed
    /// @param _orderId The order ID of the payment intent
    /// @param _intent The payment intent to fulfill
    /// @param _signature The signature of the payment intent
    function _fulfillIntent(
        bytes32 _consumptionNonce,
        uint256 _feeExecuted,
        bytes32 _orderId,
        PaymentIntent memory _intent,
        bytes memory _signature
    ) internal returns (bool) {
        _consumeIntent(_orderId, _intent, _signature);

        uint256 netMinted = _intent.amount - _feeExecuted;
        uint256 grossFee = _intent.amount.mul(_intent.feeBps).div(10_000);
        uint256 netPayable = _intent.amount - grossFee;

        IERC20(usdc).safeTransferFrom(
            msg.sender,
            _intent.merchant,
            netPayable
        );

        if (netMinted > netPayable) {
            IERC20(usdc).safeTransferFrom(
                msg.sender,
                _intent.feeRecipient,
                netMinted - netPayable
            );
        }

        emit PaymentIntentSuccess(
            _consumptionNonce,
            _orderId,
            _intent,
            _feeExecuted,
            netMinted,
            netPayable,
            netMinted - netPayable,
            usages[_intent.salt]
        );

        return true;
    }

    /// @notice Consume an intent by checking the nonce, quantity, and signature
    /// @param _intent The intent to consume
    /// @param _signature The signature of the intent
    function _consumeIntent(
        bytes32 _orderId,
        PaymentIntent memory _intent,
        bytes memory _signature
    ) internal {
        require(
            !deactivated[_intent.merchant][_intent.salt],
            "Intent deactivated"
        );

        require(
            !orderIds[_orderId], 
            "Order ID already used"
        );
        orderIds[_orderId] = true;

        // check the current nonce of the intent and update if it's higher
        if (_intent.nonce > nonces[_intent.salt]) {
            nonces[_intent.salt] = _intent.nonce;
            emit PaymentIntentNonceUpdated(_intent.salt, _intent.nonce);
        } else {
            require(
                _intent.nonce == nonces[_intent.salt],
                "Using old intent nonce"
            );
        }

        // check if the payment intent has been used
        uint256 _usage = usages[_intent.salt];
        if (_intent.quantityType == QuantityType.FIXED) {
            require(_usage < _intent.quantity, "Quantity already used");
        }

        usages[_intent.salt] = _usage + 1;

        // verify the intent signature by the merchant
        bytes32 _hash = _hashPaymentIntent(_intent);
        address signer = _resolveIntentSigner(_intent);
        _verifySignature(_hash, signer, _signature);
    }

    /// @inheritdoc IPaymentHook
    function hashPaymentIntent(
        PaymentIntent memory intent
    ) external override view returns (bytes32) {
        return _hashPaymentIntent(intent);
    }

    /// @notice Resolve the signer of the intent
    /// @param _intent The intent to resolve the signer for
    /// @return signer The signer of the intent
    function _resolveIntentSigner(
        PaymentIntent memory _intent
    ) internal view returns (address signer) {
        if (_intent.signerType == SignerType.MERCHANT) {
            signer = _intent.merchant;
        } else if (_intent.signerType == SignerType.OPERATOR) {
            require(hasRole(OPERATOR_ROLE, _intent.signer), "Invalid operator");
            signer = _intent.signer;
        } else {
            revert("Invalid signer type");
        }
    }

    modifier onlyHookWrapper() {
        require(msg.sender == hookWrapper, "Only callable by hook wrapper");
        _;
    }
}
