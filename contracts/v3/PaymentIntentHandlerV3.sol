// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {SafeERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import {Signatures} from "./Signatures.sol";
import {PaymentIntentHookData, PaymentIntent, QuantityType, SignerType} from "./Structs.sol";
import {ReentrancyGuard} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/access/AccessControl.sol";
import {SafeMath} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/math/SafeMath.sol";
import {IERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {IPaymentHook} from "../interfaces/IPaymentHook.sol";
import {ISwapTarget} from "../interfaces/ISwapTarget.sol";

/// @notice Payment intent processor for Circle CCTP V2
contract PaymentIntentHandlerV3 is
    IPaymentHook,
    ISwapTarget,
    Signatures,
    ReentrancyGuard,
    AccessControl
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    bytes32 public constant RECOVER_ROLE = keccak256("RECOVER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Tracks used salts to prevent replays
    mapping(uint256 => uint256) public usages;
    mapping(uint256 => uint256) public intentNonces;
    mapping(bytes32 => uint256) public receivedMints;
    mapping(address => mapping(uint256 => bool)) public deactivated;

    /// @notice USDC token address on this chain
    address public usdc;

    /// @notice The address of the CCTP hook wrapper
    address public hookWrapper;

    event PaymentIntentSuccess(
        bytes32 indexed consumptionNonce,
        PaymentIntent intent,
        uint256 feeExecuted,
        uint256 netMinted,
        uint256 netPayable,
        uint256 netFee,
        uint256 quantityUsed
    );

    event PaymentIntentFailed(bytes32 indexed nonce, string reason);

    /// @notice Emitted when emergency recovery is executed
    event EmergencyRecovery(address to, uint256 amount);

    /// @notice Emitted when the nonce of an intent is updated
    event PaymentIntentNonceUpdated(uint256 indexed salt, uint256 nonce);

    /// @notice Initializes the contract with the USDC and Circle Messenger addresses
    constructor(address _usdc, address _hookWrapper) Signatures() {
        require(_usdc != address(0), "Invalid USDC address");
        require(_hookWrapper != address(0), "Invalid hook wrapper address");

        usdc = _usdc;
        hookWrapper = _hookWrapper;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(RECOVER_ROLE, msg.sender);
    }

    /// @notice Deactivate a payment intent
    /// @param _salt The salt of the payment intent
    /// @param _deactivate Whether to deactivate the payment intent
    function toggleDeactivate(uint256 _salt, bool _deactivate) external {
        deactivated[msg.sender][_salt] = _deactivate;
    }

    function validateIntent(
        PaymentIntent memory _intent,
        bytes memory _signature,
        uint256 amount
    ) public returns (bool) {
        require(!deactivated[_intent.merchant][_intent.salt], "Intent deactivated");

        bytes32 _hash = _hashPaymentIntent(_intent);

        address signer = _resolveIntentSigner(_intent);
        _verifySignature(_hash, signer, _signature);

        // Check nonce
        uint256 currentNonce = intentNonces[_intent.salt];
        require(
            _intent.nonce == currentNonce || _intent.nonce > currentNonce,
            "Using old intent nonce"
        );

        // Check quantity
        uint256 usage = usages[_intent.salt];
        if (_intent.quantityType == QuantityType.FIXED) {
            require(usage < _intent.quantity, "Quantity already used");
        }

        require(_intent.amount == amount, "Mismatched amount");

        return true;
    }

    /// @notice locally fulfill a payment intent
    function localExecuteHook(
        PaymentIntent memory _intent,
        bytes memory _signature
    ) external nonReentrant returns (bool) {
        return _localExecuteHook(_intent, _signature);
    }

    /// @inheritdoc ISwapTarget
    function executeSwapHook(
        address /*_tokenIn*/,
        address /*_tokenOut*/,
        uint256 /*_amountInMax*/,
        uint256 /*_amountOut*/,
        bytes calldata _structData
    ) external override nonReentrant returns (bool) {
        PaymentIntentHookData memory _hookData = abi.decode(
            _structData,
            (PaymentIntentHookData)
        );

        return _localExecuteHook(_hookData.intent, _hookData.signature);
    }

    /// @notice locally fulfill a payment intent
    function _localExecuteHook(
        PaymentIntent memory _intent,
        bytes memory _signature
    ) internal returns (bool) {
        _consumeIntent(_intent, _signature);

        require(_intent.amount > 0, "Invalid amount");
        require(_intent.feeBps <= 10_000, "Invalid fee bps");
        require(_intent.merchant != address(0), "Invalid merchant");

        uint256 _grossFee = _intent.amount.mul(_intent.feeBps).div(10_000);

        require(_grossFee < _intent.amount, "Fee too high");

        IERC20(usdc).safeTransferFrom(
            msg.sender,
            _intent.merchant,
            _intent.amount - _grossFee
        );

        if (_grossFee > 0 && _intent.feeRecipient != address(0)) {
            IERC20(usdc).safeTransferFrom(
                msg.sender,
                _intent.feeRecipient,
                _grossFee
            );
        }

        emit PaymentIntentSuccess(
            bytes32(_intent.salt),
            _intent,
            0,
            _intent.amount,
            _intent.amount - _grossFee,
            _grossFee,
            usages[_intent.salt]
        );

        return true;
    }

    /// @inheritdoc IPaymentHook
    function executePaymentHook(
        bytes32 _nonce,
        uint32 /* _version */,
        bytes32 /* _burnToken */,
        bytes32 /* _mintRecipient */,
        uint256 _amount,
        bytes32 /* _messageSender */,
        uint256 /* _maxFee */,
        uint256 _feeExecuted,
        uint256 /* _expirationBlock */,
        bytes calldata _structData
    ) external override nonReentrant onlyHookWrapper returns (bool) {
        receivedMints[_nonce] = _amount - _feeExecuted;

        try
            this._executeHook(_nonce, _amount, _feeExecuted, _structData)
        returns (bool result) {
            return result;
        } catch Error(string memory reason) {
            emit PaymentIntentFailed(_nonce, reason);
            return false;
        } catch {
            emit PaymentIntentFailed(_nonce, "Unknown error");
            return false;
        }
    }

    /// @dev External only for self-call via `this._executeHook`. Rejects all other callers.
    function _executeHook(
        bytes32 _nonce,
        uint256 _amount,
        uint256 _feeExecuted,
        bytes calldata _structData
    ) external onlySelf returns (bool) {
        PaymentIntentHookData memory _hookData = abi.decode(
            _structData,
            (PaymentIntentHookData)
        );

        _consumeIntent(_hookData.intent, _hookData.signature);

        /**
         * _amount - amount burned from source chain
         * _netMinted - amount minted net of fee executed
         * _feeExecuted - fee taken by cctp
         * _grossFee - total fees taken out of the intent amount
         * _netPayable - payment intent amount minus gross fee
         * _netFee - total fees net of cctp fee takable by the protocol
         */
        require(_hookData.intent.amount == _amount, "Invalid amount");

        uint256 _netMinted = _amount - _feeExecuted;
        uint256 _grossFee = _hookData
            .intent
            .amount
            .mul(_hookData.intent.feeBps)
            .div(10_000);

        // Ensure that protocol fee does not underflow when subtracting CCTP fee
        require(_grossFee >= _feeExecuted, "Fee executed exceeds gross fee");

        uint256 _netPayable = _hookData.intent.amount - _grossFee;

        IERC20(usdc).safeTransfer(_hookData.intent.merchant, _netPayable);

        if (_netMinted > _netPayable) {
            IERC20(usdc).safeTransfer(
                _hookData.intent.feeRecipient,
                _netMinted - _netPayable
            );
        }

        emit PaymentIntentSuccess(
            _nonce,
            _hookData.intent,
            _feeExecuted,
            _netMinted,
            _netPayable,
            _netMinted - _netPayable,
            usages[_hookData.intent.salt]
        );

        return true;
    }

    /// @notice Consume an intent by checking the nonce, quantity, and signature
    /// @param _intent The intent to consume
    /// @param _signature The signature of the intent
    function _consumeIntent(
        PaymentIntent memory _intent,
        bytes memory _signature
    ) internal {
        require(!deactivated[_intent.merchant][_intent.salt], "Intent deactivated");
        
        // check the current nonce of the intent and update if it's higher
        if (_intent.nonce > intentNonces[_intent.salt]) {
            intentNonces[_intent.salt] = _intent.nonce;
            emit PaymentIntentNonceUpdated(_intent.salt, _intent.nonce);
        } else {
            require(
                _intent.nonce == intentNonces[_intent.salt],
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

    /// @notice Emergency function to recover stuck USDC in the contract
    /// @param to Address to receive the recovered funds
    function emergencyRecover(address to) external onlyRecover nonReentrant {
        uint256 balance = IERC20(usdc).balanceOf(address(this));
        require(IERC20(usdc).transfer(to, balance), "Transfer failed");
        emit EmergencyRecovery(to, balance);
    }

    /// @notice Emergency function to recover stuck USDC in the contract by nonce
    /// @param _nonce The nonce of the cctp burn message
    /// @param _to Address to receive the recovered funds
    function emergencyRecoverNonceMint(
        bytes32 _nonce,
        address _to
    ) external onlyRecover {
        uint256 _amount = receivedMints[_nonce];
        require(_amount > 0, "No amount received");
        receivedMints[_nonce] = 0;
        IERC20(usdc).safeTransfer(_to, _amount);
    }

    modifier onlyHookWrapper() {
        require(msg.sender == hookWrapper, "Only callable by hook wrapper");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "Only callable by self");
        _;
    }

    modifier onlyRecover() {
        require(
            hasRole(RECOVER_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Only recover or admin"
        );
        _;
    }
}
