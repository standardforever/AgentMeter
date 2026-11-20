// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentVerifier} from "../interfaces/IAgentVerifier.sol";

/// @title MLDSA65Verifier
/// @notice Adapter from IAgentVerifier to QDay's planned ML-DSA-65 (FIPS 204) verify precompile.
/// @dev NOT LIVE YET. QDay's docs say the post-quantum precompiles arrive in Phase 2 and that the
///      precompile address will be published then. Until that address exists this contract is
///      deployed with `precompile = address(0)` and every check reverts with PrecompileNotLive,
///      so no mandate can accidentally rely on it.
///      The call encoding follows QDay's published example:
///      `staticcall(abi.encode(publicKey, message, signature))` returning `abi.encode(bool)`.
///      https://wiki.qday.info/Knowledge/technical/developer-guide/precompiled-contracts/
contract MLDSA65Verifier is IAgentVerifier {
    uint256 public constant PUBLIC_KEY_LENGTH = 1952;
    uint256 public constant SIGNATURE_LENGTH = 3309;

    /// @notice QDay's ML-DSA-65 verify precompile. address(0) until QDay publishes it.
    address public immutable precompile;

    error PrecompileNotLive();
    error BadPublicKeyLength();
    error BadSignatureLength();

    constructor(address precompile_) {
        precompile = precompile_;
    }

    /// @inheritdoc IAgentVerifier
    function isValidSignature(bytes calldata publicKey, bytes32 digest, bytes calldata signature)
        external
        view
        returns (bool)
    {
        if (precompile == address(0)) revert PrecompileNotLive();
        if (publicKey.length != PUBLIC_KEY_LENGTH) revert BadPublicKeyLength();
        if (signature.length != SIGNATURE_LENGTH) revert BadSignatureLength();

        (bool ok, bytes memory result) =
            precompile.staticcall(abi.encode(publicKey, abi.encodePacked(digest), signature));
        if (!ok || result.length != 32) return false;
        return abi.decode(result, (bool));
    }
}
