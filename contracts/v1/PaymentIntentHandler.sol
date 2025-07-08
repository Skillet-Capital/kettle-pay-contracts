// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import {Ownable} from "../../lib/evm-cctp-contracts/src/roles/Ownable.sol";
import {SafeERC20} from "../../lib/evm-cctp-contracts/lib/openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol";
import {IPaymentHook} from "../interfaces/IPaymentHook.sol";
import {Signatures} from "./Signatures.sol";
import {PaymentIntentHookData} from "./Structs.sol";

/// @notice Minimal USDC interface for transfer
interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/// @notice Payment intent processor for Circle CCTP V2
contract PaymentIntentHandlerV1 is Ownable, IPaymentHook, Signatures {
    using SafeERC20 for IERC20;

    /// @notice Tracks used salts to prevent replays
    mapping(uint256 => bool) public salts;

    /// @notice USDC token address on this chain
    address public usdc;

    event PaymentIntentExecuted(address indexed merchant, uint256 amount, uint256 feeBps, address feeRecipient, uint256 salt);

    /// @notice Emitted when emergency recovery is executed
    event EmergencyRecovery(address to, uint256 amount);

    /// @notice Initializes the contract with the USDC and Circle Messenger addresses
    constructor(address _usdc, address _owner) Ownable() Signatures() {
        usdc = _usdc;

        _transferOwnership(_owner);
    }

    function executeHook(
      uint256 _burnAmount,
      uint256 _feeExecuted,
      address _messageSender,
      bytes calldata _structData
    ) external override returns (bool) {

        PaymentIntentHookData memory _hookData = abi.decode(_structData, (PaymentIntentHookData));

        // check if the salt has been used
        require(!salts[_hookData.intent.salt], "Salt already used");
        salts[_hookData.intent.salt] = true;

        // verify the intent signature by the merchant
        bytes32 _hash = _hashPaymentIntent(_hookData.intent);
        _verifySignature(_hash, _hookData.intent.merchant, _hookData.signature);

        uint256 netMinted = _burnAmount - _feeExecuted;

        uint256 grossFee = _hookData.intent.amount * _hookData.intent.feeBps / 10_000;
        uint256 netPayable = _hookData.intent.amount - grossFee;

        uint256 netFee = netMinted - netPayable;

        IERC20(usdc).transfer(_hookData.intent.merchant, netPayable);
        IERC20(usdc).transfer(_hookData.intent.feeRecipient, netFee);

        return true;
    }

    /// @notice Emergency function to recover stuck USDC in the contract
    /// @param to Address to receive the recovered funds
    function emergencyRecover(address to) external onlyOwner {
        uint256 balance = IERC20(usdc).balanceOf(address(this));
        require(IERC20(usdc).transfer(to, balance), "Transfer failed");
        emit EmergencyRecovery(to, balance);
    }
} 
