// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {Ownable} from "../../lib/evm-cctp-contracts/src/roles/Ownable.sol";
import {SafeERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import {IPaymentHook} from "../interfaces/IPaymentHook.sol";
import {Signatures} from "./Signatures.sol";
import {PaymentIntentHookData} from "./Structs.sol";
import {ReentrancyGuard} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal USDC interface for transfer
interface IERC20 {
    function transfer(
        address recipient,
        uint256 amount
    ) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

/// @notice Payment intent processor for Circle CCTP V2
contract PaymentIntentHandlerV1 is Ownable, IPaymentHook, Signatures, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Tracks used salts to prevent replays
    mapping(uint256 => bool) public salts;

    /// @notice USDC token address on this chain
    address public usdc;

    /// @notice Tracks cctp hook executions
    uint256 public cctpHookExecutionCount;

    event PaymentIntentSuccess(
        uint256 indexed executionId,
        address indexed merchant,
        uint256 amount,
        uint256 feeBps,
        address feeRecipient,
        uint256 salt
    );

    event PaymentIntentFailed(
        uint256 indexed executionId,
        string reason
    );

    /// @notice Emitted when emergency recovery is executed
    event EmergencyRecovery(address to, uint256 amount);

    /// @notice Initializes the contract with the USDC and Circle Messenger addresses
    constructor(address _usdc, address _owner) Ownable() Signatures() {
        usdc = _usdc;

        _transferOwnership(_owner);
    }

    function executeHook(
        uint32 _version,
        bytes32 _burnToken,
        bytes32 _mintRecipient,
        uint256 _amount,
        bytes32 _messageSender,
        uint256 _maxFee,
        uint256 _feeExecuted,
        uint256 _expirationBlock,
        bytes calldata _structData
    ) external override nonReentrant returns (bool) {

        // increment the cctp hook execution count
        cctpHookExecutionCount += 1;

        emit CCTPHookExecuted(
            cctpHookExecutionCount,
            _version,
            _burnToken,
            _mintRecipient,
            _amount,
            _messageSender,
            _maxFee,
            _feeExecuted,
            _expirationBlock,
            _structData
        );
        
        try this._executeHook(_amount, _feeExecuted, _structData) returns (bool result) {
            return result;
        } catch Error(string memory reason) {
            emit PaymentIntentFailed(
                cctpHookExecutionCount,
                reason
            );
        } catch {
            emit PaymentIntentFailed(
                cctpHookExecutionCount,
                "Unknown error"
            );
        }
    }

    function _executeHook(
        uint256 _amount,
        uint256 _feeExecuted,
        bytes calldata _structData
    ) external returns (bool) {
        require(msg.sender == address(this), "Only callable internally");

        PaymentIntentHookData memory _hookData = abi.decode(
            _structData,
            (PaymentIntentHookData)
        );

        // check if the salt has been used
        require(!salts[_hookData.intent.salt], "Salt already used");
        salts[_hookData.intent.salt] = true;

        // verify the intent signature by the merchant
        bytes32 _hash = _hashPaymentIntent(_hookData.intent);
        _verifySignature(_hash, _hookData.intent.merchant, _hookData.signature);

        uint256 netMinted = _amount - _feeExecuted;

        uint256 grossFee = (_hookData.intent.amount * _hookData.intent.feeBps) /
            10_000;
        uint256 netPayable = _hookData.intent.amount - grossFee;

        uint256 netFee = netMinted - netPayable;

        IERC20(usdc).transfer(_hookData.intent.merchant, netPayable);
        IERC20(usdc).transfer(_hookData.intent.feeRecipient, netFee);

        emit PaymentIntentSuccess(
            cctpHookExecutionCount,
            _hookData.intent.merchant,
            _hookData.intent.amount,
            _hookData.intent.feeBps,
            _hookData.intent.feeRecipient,
            _hookData.intent.salt
        );

        return true;
    }

    /// @notice Emergency function to recover stuck USDC in the contract
    /// @param to Address to receive the recovered funds
    function emergencyRecover(address to) external onlyOwner nonReentrant {
        uint256 balance = IERC20(usdc).balanceOf(address(this));
        require(IERC20(usdc).transfer(to, balance), "Transfer failed");
        emit EmergencyRecovery(to, balance);
    }
}
