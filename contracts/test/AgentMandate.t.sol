// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentMandate} from "../src/AgentMandate.sol";
import {IAgentVerifier} from "../src/interfaces/IAgentVerifier.sol";
import {MLDSA65Verifier} from "../src/verifiers/MLDSA65Verifier.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";
import {Signing} from "./Signing.sol";

/// @dev Stand-in for a non-ECDSA scheme: a signature is valid iff it equals keccak256(publicKey, digest).
contract MockVerifier is IAgentVerifier {
    function isValidSignature(bytes calldata publicKey, bytes32 digest, bytes calldata signature)
        external
        pure
        returns (bool)
    {
        return keccak256(signature) == keccak256(abi.encodePacked(keccak256(abi.encodePacked(publicKey, digest))));
    }
}

/// @dev A verifier that always reverts: the mandate must fail closed.
contract RevertingVerifier is IAgentVerifier {
    function isValidSignature(bytes calldata, bytes32, bytes calldata) external pure returns (bool) {
        revert("boom");
    }
}

/// @dev Pretends to be the ML-DSA-65 precompile: returns true when the signature's first byte is 0x01.
contract MockMLDSAPrecompile {
    fallback(bytes calldata input) external returns (bytes memory) {
        (,, bytes memory sig) = abi.decode(input, (bytes, bytes, bytes));
        return abi.encode(sig[0] == 0x01);
    }
}

contract AgentMandateTest is Test {
    MockUSD8 token;
    AgentMandate mandate;

    address owner = makeAddr("owner");
    address agent;
    uint256 agentKey;
    address seller = makeAddr("seller"); // allowlisted API provider
    address seller2 = makeAddr("seller2"); // second allowlisted API provider
    address attacker = makeAddr("attacker"); // address injected into a prompt
    address facilitator = makeAddr("facilitator");

    uint256 constant DEPOSIT = 20e6; // 20 tUSD8
    uint128 constant MAX_SINGLE = 1e6; // 1 tUSD8 per call
    uint128 constant MAX_DAY = 5e6; // 5 tUSD8 per day
    uint128 constant MAX_TOTAL = 10e6; // 10 tUSD8 lifetime
    uint256 constant PRICE = 10_000; // 0.01 tUSD8 per API call

    uint256 id;
    uint256 nonceCounter;

    function setUp() public {
        vm.warp(1_800_000_000);
        (agent, agentKey) = makeAddrAndKey("agent");
        token = new MockUSD8();
        mandate = new AgentMandate(IERC20(address(token)));
        token.mint(owner, 100e6);
        id = _createDefault();
    }

    // ------------------------------------------------------------------ helpers

    function _limits() internal view returns (AgentMandate.Limits memory) {
        return AgentMandate.Limits({
            maxSinglePayment: MAX_SINGLE,
            maxPeriodSpend: MAX_DAY,
            maxTotalSpend: MAX_TOTAL,
            period: 1 days,
            expiresAt: uint64(block.timestamp + 30 days)
        });
    }

    function _createDefault() internal returns (uint256) {
        address[] memory payees = new address[](2);
        payees[0] = seller;
        payees[1] = seller2;
        vm.startPrank(owner);
        token.approve(address(mandate), DEPOSIT);
        uint256 newId = mandate.createMandate(agent, address(0), "", _limits(), payees, DEPOSIT);
        vm.stopPrank();
        return newId;
    }

    function _payment(address payee, uint256 amount) internal returns (AgentMandate.Payment memory p) {
        p = AgentMandate.Payment({
            mandateId: id,
            payee: payee,
            amount: amount,
            resourceHash: keccak256("GET /v1/price?pair=BTC-USD"),
            requestHash: keccak256(abi.encodePacked("request-", nonceCounter)),
            nonce: keccak256(abi.encodePacked("nonce-", nonceCounter++)),
            deadline: uint64(block.timestamp + 5 minutes)
        });
    }

    function _sign(uint256 key, AgentMandate.Payment memory p) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, mandate.paymentDigest(p));
        return abi.encodePacked(r, s, v);
    }

    function _pay(uint256 amount) internal returns (bytes32) {
        AgentMandate.Payment memory p = _payment(seller, amount);
        bytes memory sig = _sign(agentKey, p);
        vm.prank(facilitator);
        return mandate.settle(p, sig);
    }

    function _expectSettleRevert(AgentMandate.Payment memory p, bytes memory sig, bytes4 err) internal {
        (bool ok, bytes4 reason) = mandate.verify(p, sig);
        assertFalse(ok, "verify should fail");
        assertEq(reason, err, "verify reason");
        vm.prank(facilitator);
        vm.expectRevert(err);
        mandate.settle(p, sig);
    }

    // ------------------------------------------------------------------ create

    function test_create_escrowsDepositAndStoresRules() public view {
        AgentMandate.Mandate memory m = mandate.getMandate(id);
        assertEq(m.owner, owner);
        assertEq(m.agent, agent);
        assertEq(m.verifier, address(0));
        assertEq(m.balance, DEPOSIT);
        assertEq(m.limits.maxSinglePayment, MAX_SINGLE);
        assertEq(token.balanceOf(address(mandate)), DEPOSIT);
        assertTrue(mandate.isAllowedPayee(id, seller));
        assertTrue(mandate.isAllowedPayee(id, seller2));
        assertFalse(mandate.isAllowedPayee(id, attacker));
    }

    function test_create_rejectsBadLimits() public {
        address[] memory none = new address[](0);
        AgentMandate.Limits memory l = _limits();

        l.maxSinglePayment = 0;
        vm.expectRevert(AgentMandate.InvalidLimits.selector);
        mandate.createMandate(agent, address(0), "", l, none, 0);

        l = _limits();
        l.maxSinglePayment = MAX_DAY + 1; // single > period
        vm.expectRevert(AgentMandate.InvalidLimits.selector);
        mandate.createMandate(agent, address(0), "", l, none, 0);

        l = _limits();
        l.maxPeriodSpend = MAX_TOTAL + 1; // period > total
        vm.expectRevert(AgentMandate.InvalidLimits.selector);
        mandate.createMandate(agent, address(0), "", l, none, 0);

        l = _limits();
        l.period = 0;
        vm.expectRevert(AgentMandate.InvalidLimits.selector);
        mandate.createMandate(agent, address(0), "", l, none, 0);

        l = _limits();
        l.expiresAt = uint64(block.timestamp);
        vm.expectRevert(AgentMandate.InvalidLimits.selector);
        mandate.createMandate(agent, address(0), "", l, none, 0);
    }

    function test_create_rejectsZeroAgent() public {
        address[] memory none = new address[](0);
        vm.expectRevert(AgentMandate.ZeroAddress.selector);
        mandate.createMandate(address(0), address(0), "", _limits(), none, 0);
    }

    // ------------------------------------------------------------------ settle

    function test_settle_paysSellerAndRecordsReceipt() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory sig = _sign(agentKey, p);
        bytes32 expectedId = mandate.paymentDigest(p);

        (bool ok, bytes4 reason) = mandate.verify(p, sig);
        assertTrue(ok);
        assertEq(reason, bytes4(0));

        vm.expectEmit(true, true, true, true, address(mandate));
        emit AgentMandate.PaymentSettled(expectedId, id, seller, PRICE, p.resourceHash, p.requestHash);
        vm.prank(facilitator);
        bytes32 paymentId = mandate.settle(p, sig);

        assertEq(paymentId, expectedId);
        assertEq(token.balanceOf(seller), PRICE);
        assertEq(mandate.getMandate(id).balance, DEPOSIT - PRICE);
        assertEq(mandate.getMandate(id).totalSpent, PRICE);
        assertTrue(mandate.isSettled(paymentId));

        AgentMandate.Receipt memory rc = mandate.receiptOf(paymentId);
        assertEq(rc.mandateId, id);
        assertEq(rc.payee, seller);
        assertEq(rc.amount, PRICE);
        assertEq(rc.paidAt, block.timestamp);
        assertEq(rc.resourceHash, p.resourceHash);
        assertEq(rc.requestHash, p.requestHash);
    }

    function test_settle_agentNeedsNoFundsOrGas() public {
        assertEq(token.balanceOf(agent), 0);
        assertEq(agent.balance, 0);
        _pay(PRICE);
        assertEq(token.balanceOf(seller), PRICE);
        assertEq(vm.getNonce(agent), 0, "agent never sent a transaction");
    }

    function test_settle_isIdempotent() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory sig = _sign(agentKey, p);
        vm.prank(facilitator);
        bytes32 first = mandate.settle(p, sig);
        // facilitator retries after a timeout: same id, no second payment
        vm.prank(facilitator);
        bytes32 second = mandate.settle(p, sig);
        assertEq(first, second);
        assertEq(token.balanceOf(seller), PRICE);
        assertEq(mandate.getMandate(id).totalSpent, PRICE);
    }

    function test_settle_rejectsNonceReuseWithDifferentPayment() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        vm.prank(facilitator);
        mandate.settle(p, _sign(agentKey, p));

        AgentMandate.Payment memory p2 = p;
        p2.amount = PRICE * 2; // same nonce, different payment
        _expectSettleRevert(p2, _sign(agentKey, p2), AgentMandate.NonceAlreadyUsed.selector);
    }

    // ---------------------------------------------------------- the guardrails

    /// The headline demo: a prompt-injected agent signs a payment to the attacker. The contract refuses.
    function test_guard_promptInjectedPayeeIsRefused() public {
        AgentMandate.Payment memory p = _payment(attacker, PRICE);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.PayeeNotAllowed.selector);
        assertEq(token.balanceOf(attacker), 0);
    }

    function test_guard_singlePaymentCap() public {
        AgentMandate.Payment memory p = _payment(seller, MAX_SINGLE + 1);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.ExceedsSinglePayment.selector);
    }

    function test_guard_periodBudgetResetsNextPeriod() public {
        for (uint256 i = 0; i < 5; i++) {
            _pay(MAX_SINGLE); // 5 x 1 = 5 tUSD8, the daily cap
        }
        AgentMandate.Payment memory p = _payment(seller, 1);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.ExceedsPeriodBudget.selector);

        (, uint256 periodLeft,,) = mandate.remaining(id);
        assertEq(periodLeft, 0);

        vm.warp(block.timestamp + 1 days);
        (, periodLeft,,) = mandate.remaining(id);
        assertEq(periodLeft, MAX_DAY);
        _pay(MAX_SINGLE); // allowed again
        assertEq(mandate.getMandate(id).periodSpent, MAX_SINGLE);
    }

    function test_guard_periodsDoNotDrift() public {
        uint64 start = mandate.getMandate(id).periodStart;
        vm.warp(block.timestamp + 2 days + 3 hours);
        _pay(PRICE);
        assertEq(mandate.getMandate(id).periodStart, start + 2 days);
    }

    function test_guard_totalBudget() public {
        for (uint256 day = 0; day < 2; day++) {
            for (uint256 i = 0; i < 5; i++) {
                _pay(MAX_SINGLE);
            }
            vm.warp(block.timestamp + 1 days);
        }
        assertEq(mandate.getMandate(id).totalSpent, MAX_TOTAL);
        AgentMandate.Payment memory p = _payment(seller, 1);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.ExceedsTotalBudget.selector);
    }

    function test_guard_insufficientBalance() public {
        vm.prank(owner);
        mandate.withdraw(id, DEPOSIT - 100, owner); // leave 0.0001 tUSD8
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.InsufficientBalance.selector);
    }

    function test_guard_wrongSignerRefused() public {
        (, uint256 strangerKey) = makeAddrAndKey("stranger");
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, _sign(strangerKey, p), AgentMandate.InvalidAgentSignature.selector);
    }

    function test_guard_tamperedAmountRefused() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory sig = _sign(agentKey, p);
        p.amount = MAX_SINGLE; // a malicious facilitator bumps the price after signing
        _expectSettleRevert(p, sig, AgentMandate.InvalidAgentSignature.selector);
    }

    function test_guard_tamperedPayeeRefused() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory sig = _sign(agentKey, p);
        p.payee = seller2; // allowlisted, but not who the agent agreed to pay
        _expectSettleRevert(p, sig, AgentMandate.InvalidAgentSignature.selector);
    }

    function test_guard_garbageSignatureRefused() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, hex"1234", AgentMandate.InvalidAgentSignature.selector);
    }

    function test_guard_paymentDeadline() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory sig = _sign(agentKey, p);
        vm.warp(p.deadline + 1);
        _expectSettleRevert(p, sig, AgentMandate.PaymentExpired.selector);
    }

    function test_guard_mandateExpiry() public {
        vm.warp(block.timestamp + 30 days);
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.MandateExpired.selector);
    }

    function test_guard_zeroAmount() public {
        AgentMandate.Payment memory p = _payment(seller, 0);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.ZeroAmount.selector);
    }

    function test_guard_unknownMandate() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        p.mandateId = 999;
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.UnknownMandate.selector);
    }

    function test_guard_signatureCannotBeReplayedOnAnotherDeployment() public {
        AgentMandate other = new AgentMandate(IERC20(address(token)));
        address[] memory payees = new address[](1);
        payees[0] = seller;
        vm.startPrank(owner);
        token.approve(address(other), DEPOSIT);
        other.createMandate(agent, address(0), "", _limits(), payees, DEPOSIT);
        vm.stopPrank();

        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory sigForFirst = _sign(agentKey, p); // domain = first deployment
        (bool ok, bytes4 reason) = other.verify(p, sigForFirst);
        assertFalse(ok);
        assertEq(reason, AgentMandate.InvalidAgentSignature.selector);
    }

    // ------------------------------------------------------- revoke / withdraw

    function test_revoke_stopsAgentButOwnerCanWithdraw() public {
        _pay(PRICE);
        vm.prank(owner);
        mandate.revoke(id);

        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.MandateIsRevoked.selector);

        uint256 left = mandate.getMandate(id).balance;
        vm.prank(owner);
        mandate.withdraw(id, left, owner);
        assertEq(token.balanceOf(owner), 100e6 - PRICE);
        assertEq(token.balanceOf(address(mandate)), 0);
    }

    function test_revoke_signedButUnsettledPaymentDies() public {
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory sig = _sign(agentKey, p); // signed before revoke, submitted after
        vm.prank(owner);
        mandate.revoke(id);
        _expectSettleRevert(p, sig, AgentMandate.MandateIsRevoked.selector);
    }

    function test_adminFunctions_onlyOwner() public {
        vm.startPrank(attacker);
        vm.expectRevert(AgentMandate.NotOwner.selector);
        mandate.revoke(id);
        vm.expectRevert(AgentMandate.NotOwner.selector);
        mandate.withdraw(id, 1, attacker);
        vm.expectRevert(AgentMandate.NotOwner.selector);
        mandate.setPayee(id, attacker, true);
        vm.expectRevert(AgentMandate.NotOwner.selector);
        mandate.setLimits(id, _limits());
        vm.expectRevert(AgentMandate.NotOwner.selector);
        mandate.setAgent(id, attacker, address(0), "");
        vm.expectRevert(AgentMandate.UnknownMandate.selector);
        mandate.revoke(999);
        vm.stopPrank();
    }

    function test_withdraw_cannotExceedBalance() public {
        vm.prank(owner);
        vm.expectRevert(AgentMandate.InsufficientBalance.selector);
        mandate.withdraw(id, DEPOSIT + 1, owner);
    }

    function test_setPayee_ownerCanRemoveSeller() public {
        vm.prank(owner);
        mandate.setPayee(id, seller, false);
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.PayeeNotAllowed.selector);
    }

    // ------------------------------------------------------------- attestation

    function test_attest_sellerCommitsResponseHash() public {
        bytes32 paymentId = _pay(PRICE);
        bytes32 responseHash = keccak256('{"BTC-USD":97000.12}');

        vm.expectEmit(true, true, false, true, address(mandate));
        emit AgentMandate.ResultAttested(paymentId, seller, responseHash);
        vm.prank(seller);
        mandate.attest(paymentId, responseHash);
        assertEq(mandate.receiptOf(paymentId).responseHash, responseHash);
    }

    function test_attest_rules() public {
        bytes32 paymentId = _pay(PRICE);

        vm.prank(attacker);
        vm.expectRevert(AgentMandate.NotPayee.selector);
        mandate.attest(paymentId, keccak256("x"));

        vm.prank(seller);
        vm.expectRevert(AgentMandate.EmptyResponseHash.selector);
        mandate.attest(paymentId, bytes32(0));

        vm.prank(seller);
        mandate.attest(paymentId, keccak256("x"));
        vm.prank(seller);
        vm.expectRevert(AgentMandate.AlreadyAttested.selector);
        mandate.attest(paymentId, keccak256("y"));

        vm.prank(seller);
        vm.expectRevert(AgentMandate.UnknownPayment.selector);
        mandate.attest(keccak256("nope"), keccak256("x"));
    }

    // ------------------------------------------------------- deposits

    function test_deposit_anyoneCanTopUp() public {
        token.mint(address(this), 5e6);
        token.approve(address(mandate), 5e6);
        mandate.deposit(id, 5e6);
        assertEq(mandate.getMandate(id).balance, DEPOSIT + 5e6);
    }

    function test_depositWithAuthorization_isGaslessAndBoundToMandate() public {
        (address funder, uint256 funderKey) = makeAddrAndKey("funder");
        token.mint(funder, 3e6);
        bytes32 salt = keccak256("top-up-1");
        uint256 validBefore = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(
            vm,
            funderKey,
            token.DOMAIN_SEPARATOR(),
            Signing.Auth({
                from: funder,
                to: address(mandate),
                value: 3e6,
                validAfter: 0,
                validBefore: validBefore,
                nonce: mandate.depositNonce(id, salt)
            })
        );
        AgentMandate.Authorization memory auth =
            AgentMandate.Authorization({validAfter: 0, validBefore: validBefore, salt: salt, v: v, r: r, s: s});

        // A relayer cannot redirect the funder's signature to a different mandate.
        address[] memory none = new address[](0);
        vm.prank(attacker);
        uint256 attackerMandate = mandate.createMandate(attacker, address(0), "", _limits(), none, 0);
        vm.prank(facilitator);
        vm.expectRevert(MockUSD8.InvalidSignature.selector);
        mandate.depositWithAuthorization(attackerMandate, funder, 3e6, auth);

        vm.prank(facilitator);
        mandate.depositWithAuthorization(id, funder, 3e6, auth);
        assertEq(mandate.getMandate(id).balance, DEPOSIT + 3e6);
        assertEq(vm.getNonce(funder), 0, "funder never sent a transaction");
    }

    // ---------------------------------------- key rotation / pluggable verifiers

    function test_setAgent_oldKeyStopsWorking() public {
        (address newAgent, uint256 newKey) = makeAddrAndKey("newAgent");
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory oldSig = _sign(agentKey, p);

        vm.prank(owner);
        mandate.setAgent(id, newAgent, address(0), "");

        _expectSettleRevert(p, oldSig, AgentMandate.InvalidAgentSignature.selector);
        vm.prank(facilitator);
        mandate.settle(p, _sign(newKey, p));
        assertEq(token.balanceOf(seller), PRICE);
    }

    function test_setAgent_switchToAnotherSchemeWithoutMovingFunds() public {
        MockVerifier verifier = new MockVerifier();
        bytes memory pubKey = hex"c0ffee";
        vm.prank(owner);
        mandate.setAgent(id, address(0), address(verifier), pubKey);
        assertEq(mandate.getMandate(id).balance, DEPOSIT, "funds untouched");

        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes32 digest = mandate.paymentDigest(p);

        // An ECDSA signature from the old agent no longer works...
        _expectSettleRevert(p, _sign(agentKey, p), AgentMandate.InvalidAgentSignature.selector);

        // ...a signature in the new scheme does.
        bytes memory newSig = abi.encodePacked(keccak256(abi.encodePacked(pubKey, digest)));
        vm.prank(facilitator);
        mandate.settle(p, newSig);
        assertEq(token.balanceOf(seller), PRICE);
    }

    function test_setAgent_revertingVerifierFailsClosed() public {
        RevertingVerifier verifier = new RevertingVerifier();
        vm.prank(owner);
        mandate.setAgent(id, address(0), address(verifier), hex"01");
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, hex"01", AgentMandate.InvalidAgentSignature.selector);
    }

    function test_setAgent_customVerifierNeedsKey() public {
        MockVerifier verifier = new MockVerifier();
        vm.prank(owner);
        vm.expectRevert(AgentMandate.EmptyVerifierKey.selector);
        mandate.setAgent(id, address(0), address(verifier), "");
    }

    // --------------------------------------------- ML-DSA-65 (post-quantum) adapter

    function test_mldsa_notLiveYetFailsClosed() public {
        MLDSA65Verifier pq = new MLDSA65Verifier(address(0)); // QDay has not published the precompile
        vm.expectRevert(MLDSA65Verifier.PrecompileNotLive.selector);
        pq.isValidSignature(new bytes(1952), bytes32(0), new bytes(3309));

        // Wired into a mandate, a not-yet-live verifier can never release funds.
        vm.prank(owner);
        mandate.setAgent(id, address(0), address(pq), new bytes(1952));
        AgentMandate.Payment memory p = _payment(seller, PRICE);
        _expectSettleRevert(p, new bytes(3309), AgentMandate.InvalidAgentSignature.selector);
    }

    function test_mldsa_readyForPhase2Precompile() public {
        // Simulate QDay publishing the precompile at some address.
        address precompile = address(0x0000000000000000000000000000000000000100);
        vm.etch(precompile, address(new MockMLDSAPrecompile()).code);
        MLDSA65Verifier pq = new MLDSA65Verifier(precompile);

        vm.prank(owner);
        mandate.setAgent(id, address(0), address(pq), new bytes(1952));

        AgentMandate.Payment memory p = _payment(seller, PRICE);
        bytes memory badSig = new bytes(3309); // first byte 0x00 -> mock says invalid
        _expectSettleRevert(p, badSig, AgentMandate.InvalidAgentSignature.selector);

        bytes memory goodSig = new bytes(3309);
        goodSig[0] = 0x01;
        vm.prank(facilitator);
        mandate.settle(p, goodSig);
        assertEq(token.balanceOf(seller), PRICE);

        vm.expectRevert(MLDSA65Verifier.BadSignatureLength.selector);
        pq.isValidSignature(new bytes(1952), bytes32(0), new bytes(10));
        vm.expectRevert(MLDSA65Verifier.BadPublicKeyLength.selector);
        pq.isValidSignature(new bytes(32), bytes32(0), goodSig);
    }

    // ------------------------------------------------------------------- fuzz

    /// Whatever the agent signs, the books always balance and no cap is ever exceeded.
    function testFuzz_invariants(uint256[12] memory amounts, uint8[12] memory hoursForward) public {
        for (uint256 i = 0; i < amounts.length; i++) {
            vm.warp(block.timestamp + uint256(hoursForward[i]) * 1 hours);
            uint256 amount = bound(amounts[i], 1, 2 * MAX_SINGLE);
            AgentMandate.Payment memory p = _payment(seller, amount);
            bytes memory sig = _sign(agentKey, p);
            (bool ok,) = mandate.verify(p, sig);
            vm.prank(facilitator);
            if (ok) {
                mandate.settle(p, sig);
            } else {
                vm.expectRevert();
                mandate.settle(p, sig);
            }

            AgentMandate.Mandate memory m = mandate.getMandate(id);
            assertLe(m.totalSpent, MAX_TOTAL);
            assertLe(m.periodSpent, MAX_DAY);
            assertEq(m.balance + token.balanceOf(seller), DEPOSIT);
            assertEq(token.balanceOf(address(mandate)), m.balance);
        }
    }

    // ------------------------------------------------------------------ names

    event MandateNamed(uint256 indexed mandateId, string name);

    function test_name_createNamedMandateCreatesAndNames() public {
        address[] memory payees = new address[](1);
        payees[0] = seller;
        vm.startPrank(owner);
        token.approve(address(mandate), DEPOSIT);
        vm.expectEmit(true, false, false, true, address(mandate));
        emit MandateNamed(2, "Research agent");
        uint256 newId = mandate.createNamedMandate("Research agent", agent, address(0), "", _limits(), payees, DEPOSIT);
        vm.stopPrank();
        assertEq(newId, 2);
        AgentMandate.Mandate memory m = mandate.getMandate(newId);
        assertEq(m.owner, owner);
        assertEq(m.balance, DEPOSIT);
        assertTrue(mandate.isAllowedPayee(newId, seller));
    }

    function test_name_ownerCanRenameAndClear() public {
        vm.startPrank(owner);
        vm.expectEmit(true, false, false, true, address(mandate));
        emit MandateNamed(id, "Price watcher");
        mandate.setName(id, "Price watcher");
        vm.expectEmit(true, false, false, true, address(mandate));
        emit MandateNamed(id, "");
        mandate.setName(id, "");
        vm.stopPrank();
    }

    function test_name_onlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert(AgentMandate.NotOwner.selector);
        mandate.setName(id, "Mine now");
        vm.expectRevert(AgentMandate.UnknownMandate.selector);
        mandate.setName(999, "Nobody");
    }

    function test_name_atMost64Bytes() public {
        vm.startPrank(owner);
        mandate.setName(id, "0123456789012345678901234567890123456789012345678901234567890123"); // 64
        vm.expectRevert(AgentMandate.NameTooLong.selector);
        mandate.setName(id, "01234567890123456789012345678901234567890123456789012345678901234"); // 65
        vm.stopPrank();
    }
}
