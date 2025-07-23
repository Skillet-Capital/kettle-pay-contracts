// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.6;
pragma abicoder v2;

import {PaymentIntent} from "./Structs.sol";

interface IERC1271 {
    function isValidSignature(
        bytes32 hash,
        bytes calldata signature
    ) external view returns (bytes4);
}

contract Signatures {
    bytes32 private constant _ERC6492_DETECTION_SUFFIX =
        0x6492649264926492649264926492649264926492649264926492649264926492;

    bytes32 private _EIP_712_DOMAIN_TYPEHASH;

    bytes32 private _PAYMENT_INTENT_TYPEHASH;

    string private constant _NAME = "PaymentIntentHandlerV4";
    string private constant _VERSION = "1";

    constructor() {
        (
            _EIP_712_DOMAIN_TYPEHASH,
            _PAYMENT_INTENT_TYPEHASH
        ) = _createTypeHashes();
    }

    function hashPaymentIntent(
        PaymentIntent memory intent
    ) external view returns (bytes32) {
        return _hashPaymentIntent(intent);
    }

    function _createTypeHashes()
        internal
        pure
        returns (bytes32 eip712DomainTypehash, bytes32 paymentIntentTypehash)
    {
        eip712DomainTypehash = keccak256(
            abi.encodePacked(
                "EIP712Domain(",
                "string name,",
                "string version,",
                "uint256 chainId,",
                "address verifyingContract",
                ")"
            )
        );

        bytes memory paymentIntentTypestring = abi.encodePacked(
            "PaymentIntent(",
            "uint256 amount,",
            "uint256 feeBps,",
            "address feeRecipient,",
            "address merchant,",
            "uint256 salt,",
            "uint8 quantityType,",
            "uint256 quantity,",
            "uint8 signerType,",
            "address signer,",
            "uint256 nonce",
            ")"
        );

        paymentIntentTypehash = keccak256(paymentIntentTypestring);
    }

    function _hashDomain(
        bytes32 eip712DomainTypehash,
        bytes32 nameHash,
        bytes32 versionHash
    ) internal view returns (bytes32) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return
            keccak256(
                abi.encode(
                    eip712DomainTypehash,
                    nameHash,
                    versionHash,
                    chainId,
                    address(this)
                )
            );
    }

    function _hashPaymentIntent(
        PaymentIntent memory intent
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _PAYMENT_INTENT_TYPEHASH,
                    intent.amount,
                    intent.feeBps,
                    intent.feeRecipient,
                    intent.merchant,
                    intent.salt,
                    intent.quantityType,
                    intent.quantity,
                    intent.signerType,
                    intent.signer,
                    intent.nonce
                )
            );
    }

    function _hashToSign(bytes32 hash) internal view returns (bytes32) {
        bytes32 domain = _hashDomain(
            _EIP_712_DOMAIN_TYPEHASH,
            keccak256(bytes(_NAME)),
            keccak256(bytes(_VERSION))
        );

        return keccak256(abi.encodePacked(bytes2(0x1901), domain, hash));
    }

    function _verifySignature(
        bytes32 _hash,
        address signer,
        bytes memory signature
    ) internal {
        bytes32 r;
        bytes32 s;
        uint8 v;
        bytes memory sigToValidate;

        bytes32 hashToSign = _hashToSign(_hash);

        // The order here is strictly defined in https://eips.ethereum.org/EIPS/eip-6492
        // - ERC-6492 suffix check and verification first, while being permissive in case
        //   the contract is already deployed; if the contract is deployed we will check
        //   the sig against the deployed version, this allows 6492 signatures to still
        //   be validated while taking into account potential key rotation
        // - ERC-1271 verification if there's contract code
        // - finally, ecrecover

        bool isCounterfactual = _extractSuffix(signature) ==
            _ERC6492_DETECTION_SUFFIX;

        if (isCounterfactual) {
            address create2Factory;
            bytes memory factoryCalldata;

            bytes memory payload = _sliceSignaturePayload(signature);
            (create2Factory, factoryCalldata, sigToValidate) = abi.decode(
                payload,
                (address, bytes, bytes)
            );

            // solhint-disable-next-line explicit-types
            uint contractCodeLen = _getCodeAt(signer).length;
            if (contractCodeLen == 0) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, bytes memory err) = create2Factory.call(
                    factoryCalldata
                );
                if (!success) {
                    revert(
                        string(abi.encodePacked("ERC6492DeployFailed: ", err))
                    );
                }
            }
        } else {
            sigToValidate = signature;
        }

        if (_getCodeAt(signer).length > 0) {
            bytes4 magicValue = IERC1271(signer).isValidSignature(
                hashToSign,
                sigToValidate
            );

            if (magicValue != IERC1271(signer).isValidSignature.selector) {
                revert("InvalidSignature");
            }

            return;
        }

        // solhint-disable-next-line
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        _verify(signer, hashToSign, v, r, s);
    }

    /**
     * @notice Verify signature of digest
     * @param signer Address of expected signer
     * @param digest Signature digest
     * @param v v parameter
     * @param r r parameter
     * @param s s parameter
     */
    function _verify(
        address signer,
        bytes32 digest,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal pure {
        if (v != 27 && v != 28) {
            revert("InvalidVParameter");
        }

        address recoveredSigner = ecrecover(digest, v, r, s);
        if (recoveredSigner == address(0) || signer != recoveredSigner) {
            revert("InvalidSignature");
        }
    }

    function _getCodeAt(
        address _addr
    ) internal view returns (bytes memory code) {
        assembly {
            // Get the size of the code at address _addr
            let size := extcodesize(_addr)
            // Allocate output byte array
            code := mload(0x40)
            // Store the size at the beginning of the memory for the bytes array
            mstore(code, size)
            // Get the actual code
            extcodecopy(_addr, add(code, 0x20), 0, size)
            // Update free-memory pointer
            mstore(0x40, add(code, add(size, 0x20)))
        }
    }

    function _extractSuffix(
        bytes memory signature
    ) internal pure returns (bytes32 suffix) {
        require(signature.length >= 32, "Signature too short");
        assembly {
            // mload reads 32 bytes starting at the given pointer
            // signature points to length, so data starts at add(signature, 32)
            suffix := mload(add(signature, add(32, sub(mload(signature), 32))))
        }
    }

    function _sliceSignaturePayload(
        bytes memory signature
    ) internal pure returns (bytes memory) {
        require(signature.length > 32, "Signature too short for 6492 suffix");

        uint256 newLength = signature.length - 32;
        bytes memory sliced = new bytes(newLength);

        for (uint256 i = 0; i < newLength; i++) {
            sliced[i] = signature[i];
        }

        return sliced;
    }
}
