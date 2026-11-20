// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentVerifier} from "./interfaces/IAgentVerifier.sol";

/// @notice EIP-3009 `receiveWithAuthorization`, implemented by tUSD8 on Aevum.
interface IERC3009Receive {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title AgentMandate
/// @notice On-chain spending mandates for AI agents that pay per request (x402) in tUSD8.
///
///         An owner deposits tUSD8 into a mandate and names an agent key. The agent never holds
///         funds and never needs gas: for each paid request it signs an EIP-712 `Payment`, and
///         the seller's facilitator (or anyone) submits it with `settle`. The contract pays only
///         if the payment fits the mandate:
///           - payee is on the owner's allowlist
///           - amount <= maxSinglePayment
///           - spend in the current period <= maxPeriodSpend
///           - lifetime spend <= maxTotalSpend
///           - the mandate is not revoked or expired, and the payment deadline has not passed
///           - the signature is the agent's (built-in ECDSA, or a pluggable verifier)
///         A prompt-injected agent can sign anything; the contract still refuses it.
///
///         Limit names follow QDay's planned Payment Agent API (maxSinglePayment, maxDailySpend,
///         allowedRecipients), so the design maps onto QDay's session keys when their SDK ships.
///
///         Every settled payment stores a receipt keyed by its EIP-712 digest (the paymentId),
///         binding what was bought (resourceHash) and the exact request (requestHash). The payee
///         can then attest a hash of the response it delivered, giving an on-chain audit trail of
///         request -> payment -> result.
///
/// @dev Aevum runs the Shanghai EVM: no transient storage, so ReentrancyGuard uses storage.
///      Settlement is idempotent: re-submitting an already-settled Payment returns its paymentId
///      without paying again, so facilitators can retry safely.
contract AgentMandate is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    /// @notice Spending rules for one mandate. All amounts in token base units (tUSD8: 6 decimals).
    struct Limits {
        uint128 maxSinglePayment; // cap per payment
        uint128 maxPeriodSpend; // cap per period (e.g. per day)
        uint128 maxTotalSpend; // lifetime cap
        uint32 period; // period length in seconds (86400 = daily)
        uint64 expiresAt; // unix time after which the agent can no longer spend
    }

    struct Mandate {
        address owner;
        address agent; // ECDSA agent address (used when verifier == address(0))
        address verifier; // pluggable signature scheme; address(0) = built-in ECDSA
        bool revoked;
        uint64 periodStart;
        uint128 periodSpent;
        uint128 totalSpent;
        uint256 balance;
        Limits limits;
    }

    /// @notice What the agent signs for one paid request.
    struct Payment {
        uint256 mandateId;
        address payee; // the seller being paid
        uint256 amount;
        bytes32 resourceHash; // what is being bought, e.g. keccak256("GET /v1/price")
        bytes32 requestHash; // hash of the exact request the agent sent
        bytes32 nonce; // unique per payment, chosen by the agent
        uint64 deadline; // unix time after which this signature is void
    }

    /// @notice An EIP-3009 ReceiveWithAuthorization signature, for gasless deposits.
    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 salt; // the signed nonce is depositNonce(mandateId, salt)
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Receipt {
        uint256 mandateId;
        address payee;
        uint128 amount;
        uint64 paidAt;
        bytes32 resourceHash;
        bytes32 requestHash;
        bytes32 responseHash; // set by the payee with `attest`
    }

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(uint256 mandateId,address payee,uint256 amount,bytes32 resourceHash,bytes32 requestHash,bytes32 nonce,uint64 deadline)"
    );

    // ------------------------------------------------------------------ state

    IERC20 public immutable token;
    uint256 public mandateCount;

    mapping(uint256 mandateId => Mandate) private _mandates;
    mapping(uint256 mandateId => bytes) private _verifierKey;
    mapping(uint256 mandateId => mapping(address payee => bool)) public isAllowedPayee;
    mapping(uint256 mandateId => mapping(bytes32 nonce => bool)) public nonceUsed;
    mapping(bytes32 paymentId => Receipt) private _receipts;

    // ----------------------------------------------------------------- events

    event MandateCreated(
        uint256 indexed mandateId, address indexed owner, address indexed agent, address verifier, Limits limits
    );
    event AgentSet(uint256 indexed mandateId, address indexed agent, address verifier, bytes verifierKey);
    event LimitsUpdated(uint256 indexed mandateId, Limits limits);
    event PayeeSet(uint256 indexed mandateId, address indexed payee, bool allowed);
    event Deposited(uint256 indexed mandateId, address indexed from, uint256 amount);
    event Withdrawn(uint256 indexed mandateId, address indexed to, uint256 amount);
    event MandateRevoked(uint256 indexed mandateId);
    event PaymentSettled(
        bytes32 indexed paymentId,
        uint256 indexed mandateId,
        address indexed payee,
        uint256 amount,
        bytes32 resourceHash,
        bytes32 requestHash
    );
    event ResultAttested(bytes32 indexed paymentId, address indexed payee, bytes32 responseHash);

    // ----------------------------------------------------------------- errors

    error ZeroAddress();
    error ZeroAmount();
    error InvalidLimits();
    error UnknownMandate();
    error NotOwner();
    error MandateIsRevoked();
    error MandateExpired();
    error PaymentExpired();
    error PayeeNotAllowed();
    error ExceedsSinglePayment();
    error ExceedsPeriodBudget();
    error ExceedsTotalBudget();
    error InsufficientBalance();
    error NonceAlreadyUsed();
    error InvalidAgentSignature();
    error UnknownPayment();
    error NotPayee();
    error AlreadyAttested();
    error EmptyVerifierKey();
    error EmptyResponseHash();

    // -------------------------------------------------------------- modifiers

    modifier onlyOwner(uint256 mandateId) {
        address owner = _mandates[mandateId].owner;
        if (owner == address(0)) revert UnknownMandate();
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IERC20 token_) EIP712("AgentMandate", "1") {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    // ================================================================= owner

    /// @notice Create a mandate, allowlist its payees and (optionally) fund it.
    /// @param agent        The agent's ECDSA address. Required when `verifier` is address(0).
    /// @param verifier     Optional IAgentVerifier for a non-ECDSA agent key; address(0) for ECDSA.
    /// @param verifierKey  The agent's public key for `verifier` (ignored for ECDSA).
    /// @param initialDeposit tUSD8 to pull from msg.sender (needs approve); 0 to fund later.
    function createMandate(
        address agent,
        address verifier,
        bytes calldata verifierKey,
        Limits calldata limits,
        address[] calldata payees,
        uint256 initialDeposit
    ) external nonReentrant returns (uint256 mandateId) {
        mandateId = _create(agent, verifier, verifierKey, limits);
        for (uint256 i = 0; i < payees.length; i++) {
            _setPayee(mandateId, payees[i], true);
        }
        if (initialDeposit > 0) {
            _mandates[mandateId].balance = initialDeposit;
            token.safeTransferFrom(msg.sender, address(this), initialDeposit);
            emit Deposited(mandateId, msg.sender, initialDeposit);
        }
    }

    function setPayee(uint256 mandateId, address payee, bool allowed) external onlyOwner(mandateId) {
        _setPayee(mandateId, payee, allowed);
    }

    function setLimits(uint256 mandateId, Limits calldata limits) external onlyOwner(mandateId) {
        _validateLimits(limits);
        _mandates[mandateId].limits = limits;
        emit LimitsUpdated(mandateId, limits);
    }

    /// @notice Replace the agent key, or move it to another signature scheme. Funds stay put.
    ///         Signatures from the previous key stop working immediately.
    function setAgent(uint256 mandateId, address agent, address verifier, bytes calldata verifierKey)
        external
        onlyOwner(mandateId)
    {
        _setAgent(mandateId, agent, verifier, verifierKey);
    }

    /// @notice Permanently stop the agent from spending. The owner can still withdraw.
    function revoke(uint256 mandateId) external onlyOwner(mandateId) {
        _mandates[mandateId].revoked = true;
        emit MandateRevoked(mandateId);
    }

    function withdraw(uint256 mandateId, uint256 amount, address to) external nonReentrant onlyOwner(mandateId) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        Mandate storage m = _mandates[mandateId];
        if (amount > m.balance) revert InsufficientBalance();
        m.balance -= amount;
        token.safeTransfer(to, amount);
        emit Withdrawn(mandateId, to, amount);
    }

    // =============================================================== funding

    /// @notice Top up a mandate with tokens approved to this contract. Anyone may fund any mandate.
    function deposit(uint256 mandateId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Mandate storage m = _mandates[mandateId];
        if (m.owner == address(0)) revert UnknownMandate();
        m.balance += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(mandateId, msg.sender, amount);
    }

    /// @notice Gasless top-up: `from` signs an EIP-3009 ReceiveWithAuthorization off-chain and
    ///         anyone submits it. The signed nonce must be `depositNonce(mandateId, salt)`, which
    ///         binds the signature to this mandate so a relayer cannot credit a different one.
    function depositWithAuthorization(uint256 mandateId, address from, uint256 amount, Authorization calldata auth)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (_mandates[mandateId].owner == address(0)) revert UnknownMandate();
        _mandates[mandateId].balance += amount;
        IERC3009Receive(address(token)).receiveWithAuthorization(
            from,
            address(this),
            amount,
            auth.validAfter,
            auth.validBefore,
            depositNonce(mandateId, auth.salt),
            auth.v,
            auth.r,
            auth.s
        );
        emit Deposited(mandateId, from, amount);
    }

    function depositNonce(uint256 mandateId, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), mandateId, salt));
    }

    // ============================================================ settlement

    /// @notice x402 "verify": would `settle(p, signature)` succeed right now?
    /// @return ok     True if the payment would be paid (or is already settled).
    /// @return reason The custom-error selector `settle` would revert with, or 0x00000000.
    function verify(Payment calldata p, bytes calldata signature) external view returns (bool ok, bytes4 reason) {
        bytes32 paymentId = paymentDigest(p);
        if (_receipts[paymentId].paidAt != 0) return (true, bytes4(0));
        reason = _check(p, paymentId, signature);
        ok = reason == bytes4(0);
    }

    /// @notice x402 "settle": pay `p.payee` from the mandate if the payment fits every rule.
    ///         Callable by anyone (normally the seller's facilitator); the agent needs no gas.
    ///         Idempotent: an already-settled Payment returns its paymentId and pays nothing.
    function settle(Payment calldata p, bytes calldata signature)
        external
        nonReentrant
        returns (bytes32 paymentId)
    {
        paymentId = paymentDigest(p);
        if (_receipts[paymentId].paidAt != 0) return paymentId;

        bytes4 reason = _check(p, paymentId, signature);
        if (reason != bytes4(0)) _revertWith(reason);

        Mandate storage m = _mandates[p.mandateId];
        _rollPeriod(m);
        // _check proved these fit in uint128 (they are <= the uint128 limits).
        m.periodSpent += uint128(p.amount);
        m.totalSpent += uint128(p.amount);
        m.balance -= p.amount;
        nonceUsed[p.mandateId][p.nonce] = true;

        Receipt storage rc = _receipts[paymentId];
        rc.mandateId = p.mandateId;
        rc.payee = p.payee;
        rc.amount = uint128(p.amount);
        rc.paidAt = uint64(block.timestamp);
        rc.resourceHash = p.resourceHash;
        rc.requestHash = p.requestHash;

        token.safeTransfer(p.payee, p.amount);
        emit PaymentSettled(paymentId, p.mandateId, p.payee, p.amount, p.resourceHash, p.requestHash);
    }

    /// @notice The payee commits a hash of the response it delivered for a paid request.
    function attest(bytes32 paymentId, bytes32 responseHash) external {
        Receipt storage rc = _receipts[paymentId];
        if (rc.paidAt == 0) revert UnknownPayment();
        if (msg.sender != rc.payee) revert NotPayee();
        if (rc.responseHash != bytes32(0)) revert AlreadyAttested();
        if (responseHash == bytes32(0)) revert EmptyResponseHash();
        rc.responseHash = responseHash;
        emit ResultAttested(paymentId, msg.sender, responseHash);
    }

    // ================================================================= views

    /// @notice The EIP-712 digest the agent signs; also the paymentId of the settled payment.
    function paymentDigest(Payment calldata p) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    PAYMENT_TYPEHASH,
                    p.mandateId,
                    p.payee,
                    p.amount,
                    p.resourceHash,
                    p.requestHash,
                    p.nonce,
                    p.deadline
                )
            )
        );
    }

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    function verifierKeyOf(uint256 mandateId) external view returns (bytes memory) {
        return _verifierKey[mandateId];
    }

    function receiptOf(bytes32 paymentId) external view returns (Receipt memory) {
        return _receipts[paymentId];
    }

    function isSettled(bytes32 paymentId) external view returns (bool) {
        return _receipts[paymentId].paidAt != 0;
    }

    /// @notice What the agent can still spend: per payment, this period, in total, and in escrow.
    function remaining(uint256 mandateId)
        external
        view
        returns (uint256 singlePayment, uint256 period, uint256 total, uint256 balance)
    {
        Mandate storage m = _mandates[mandateId];
        Limits memory l = m.limits;
        uint256 periodSpent = _periodRolled(m) ? 0 : m.periodSpent;
        singlePayment = l.maxSinglePayment;
        period = l.maxPeriodSpend > periodSpent ? l.maxPeriodSpend - periodSpent : 0;
        total = l.maxTotalSpend > m.totalSpent ? l.maxTotalSpend - m.totalSpent : 0;
        balance = m.balance;
    }

    // ============================================================== internal

    /// @dev Returns 0 if `p` can be settled now, otherwise the selector of the error to revert with.
    ///      Order matters for UX: the cheapest, most explanatory checks come first.
    function _check(Payment calldata p, bytes32 paymentId, bytes calldata signature)
        internal
        view
        returns (bytes4)
    {
        Mandate storage m = _mandates[p.mandateId];
        if (m.owner == address(0)) return UnknownMandate.selector;
        if (m.revoked) return MandateIsRevoked.selector;
        if (block.timestamp >= m.limits.expiresAt) return MandateExpired.selector;
        if (block.timestamp > p.deadline) return PaymentExpired.selector;
        if (p.amount == 0) return ZeroAmount.selector;
        if (!isAllowedPayee[p.mandateId][p.payee]) return PayeeNotAllowed.selector;
        if (p.amount > m.limits.maxSinglePayment) return ExceedsSinglePayment.selector;

        uint256 periodSpent = _periodRolled(m) ? 0 : m.periodSpent;
        if (periodSpent + p.amount > m.limits.maxPeriodSpend) return ExceedsPeriodBudget.selector;
        if (uint256(m.totalSpent) + p.amount > m.limits.maxTotalSpend) return ExceedsTotalBudget.selector;
        if (p.amount > m.balance) return InsufficientBalance.selector;
        if (nonceUsed[p.mandateId][p.nonce]) return NonceAlreadyUsed.selector;
        if (!_isValidAgentSignature(m, p.mandateId, paymentId, signature)) return InvalidAgentSignature.selector;
        return bytes4(0);
    }

    function _isValidAgentSignature(Mandate storage m, uint256 mandateId, bytes32 digest, bytes calldata signature)
        internal
        view
        returns (bool)
    {
        address verifier = m.verifier;
        if (verifier == address(0)) {
            (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
            return err == ECDSA.RecoverError.NoError && recovered == m.agent;
        }
        // A broken or reverting verifier must fail closed, never pay.
        try IAgentVerifier(verifier).isValidSignature(_verifierKey[mandateId], digest, signature) returns (
            bool valid
        ) {
            return valid;
        } catch {
            return false;
        }
    }

    function _periodRolled(Mandate storage m) internal view returns (bool) {
        return block.timestamp >= uint256(m.periodStart) + m.limits.period;
    }

    /// @dev Start a new period aligned to the original start, so periods don't drift.
    function _rollPeriod(Mandate storage m) internal {
        if (_periodRolled(m)) {
            uint256 elapsed = block.timestamp - m.periodStart;
            m.periodStart = uint64(block.timestamp - (elapsed % m.limits.period));
            m.periodSpent = 0;
        }
    }

    function _create(address agent, address verifier, bytes calldata verifierKey, Limits calldata limits)
        internal
        returns (uint256 mandateId)
    {
        _validateLimits(limits);
        mandateId = ++mandateCount;
        Mandate storage m = _mandates[mandateId];
        m.owner = msg.sender;
        m.limits = limits;
        m.periodStart = uint64(block.timestamp);
        _setAgent(mandateId, agent, verifier, verifierKey);
        emit MandateCreated(mandateId, msg.sender, agent, verifier, limits);
    }

    function _setAgent(uint256 mandateId, address agent, address verifier, bytes calldata verifierKey) internal {
        if (verifier == address(0)) {
            if (agent == address(0)) revert ZeroAddress();
            delete _verifierKey[mandateId];
        } else {
            if (verifierKey.length == 0) revert EmptyVerifierKey();
            _verifierKey[mandateId] = verifierKey;
        }
        Mandate storage m = _mandates[mandateId];
        m.agent = agent;
        m.verifier = verifier;
        emit AgentSet(mandateId, agent, verifier, verifierKey);
    }

    function _setPayee(uint256 mandateId, address payee, bool allowed) internal {
        if (payee == address(0)) revert ZeroAddress();
        isAllowedPayee[mandateId][payee] = allowed;
        emit PayeeSet(mandateId, payee, allowed);
    }

    function _validateLimits(Limits calldata l) internal view {
        if (
            l.maxSinglePayment == 0 || l.maxSinglePayment > l.maxPeriodSpend || l.maxPeriodSpend > l.maxTotalSpend
                || l.period == 0 || l.expiresAt <= block.timestamp
        ) revert InvalidLimits();
    }

    function _revertWith(bytes4 selector) internal pure {
        assembly {
            mstore(0, selector)
            revert(0, 4)
        }
    }
}
