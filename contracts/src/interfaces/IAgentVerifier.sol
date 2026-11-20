// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAgentVerifier
/// @notice A pluggable signature scheme for agent keys.
/// @dev AgentMandate checks agent signatures with built-in ECDSA by default. A mandate owner can
///      point their mandate at a verifier contract instead, so the agent's key can move to a
///      different scheme (for example ML-DSA-65 when QDay ships its Phase 2 post-quantum
///      precompiles) without moving the funds or recreating the mandate.
interface IAgentVerifier {
    /// @param publicKey The agent's public key, in whatever encoding the scheme uses.
    /// @param digest    The EIP-712 digest of the Payment the agent signed.
    /// @param signature The agent's signature over `digest`.
    /// @return True if `signature` is a valid signature of `digest` under `publicKey`.
    function isValidSignature(bytes calldata publicKey, bytes32 digest, bytes calldata signature)
        external
        view
        returns (bool);
}
