// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentMandate} from "../../src/AgentMandate.sol";
import {Signing} from "../Signing.sol";

interface ITUSD8 is IERC20 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @notice AgentMandate against the REAL tUSD8 on a local fork of Aevum testnet. No funds needed.
///         Run with: make test-fork
contract AgentMandateForkTest is Test {
    ITUSD8 constant TUSD8 = ITUSD8(0x456569838f1d43009A91ebA4263147Afd7233483);

    AgentMandate mandate;
    address owner = makeAddr("owner");
    address seller = makeAddr("seller");
    address attacker = makeAddr("attacker");
    address agent;
    uint256 agentKey;
    address funder;
    uint256 funderKey;
    uint256 id;

    function test_realTusd8_mandateLifecycle() public {
        assertEq(block.chainid, 44005, "run with --fork-url aevum");
        (agent, agentKey) = makeAddrAndKey("agent");
        (funder, funderKey) = makeAddrAndKey("funder");
        mandate = new AgentMandate(TUSD8);
        _createAndFund();
        _gaslessTopUp();
        _payAndRefuse();

        // 5. Revoke, then the owner withdraws everything that is left.
        vm.startPrank(owner);
        mandate.revoke(id);
        mandate.withdraw(id, 7e6 - 10_000, owner);
        vm.stopPrank();
        assertEq(TUSD8.balanceOf(address(mandate)), 0);
    }

    function _createAndFund() internal {
        deal(address(TUSD8), owner, 5e6);
        deal(address(TUSD8), funder, 2e6);

        // 1. Owner creates a mandate: 0.05 per call, 1 per day, 3 total, seller allowlisted.
        address[] memory payees = new address[](1);
        payees[0] = seller;
        AgentMandate.Limits memory limits = AgentMandate.Limits({
            maxSinglePayment: 50_000,
            maxPeriodSpend: 1e6,
            maxTotalSpend: 3e6,
            period: 1 days,
            expiresAt: uint64(block.timestamp + 7 days)
        });
        vm.startPrank(owner);
        TUSD8.approve(address(mandate), 5e6);
        id = mandate.createMandate(agent, address(0), "", limits, payees, 5e6);
        vm.stopPrank();
    }

    function _gaslessTopUp() internal {
        // 2. Funder tops up gaslessly with a real tUSD8 EIP-3009 signature.
        bytes32 salt = keccak256("fork-top-up");
        (uint8 v, bytes32 r, bytes32 s) = Signing.signReceive(
            vm,
            funderKey,
            TUSD8.DOMAIN_SEPARATOR(),
            Signing.Auth({
                from: funder,
                to: address(mandate),
                value: 2e6,
                validAfter: 0,
                validBefore: block.timestamp + 1 hours,
                nonce: mandate.depositNonce(id, salt)
            })
        );
        mandate.depositWithAuthorization(
            id,
            funder,
            2e6,
            AgentMandate.Authorization({
                validAfter: 0, validBefore: block.timestamp + 1 hours, salt: salt, v: v, r: r, s: s
            })
        );
        assertEq(TUSD8.balanceOf(address(mandate)), 7e6);
    }

    function _payAndRefuse() internal {
        // 3. Agent pays the seller 0.01 per call; a facilitator submits.
        AgentMandate.Payment memory p = AgentMandate.Payment({
            mandateId: id,
            payee: seller,
            amount: 10_000,
            resourceHash: keccak256("GET /v1/price"),
            requestHash: keccak256("req-1"),
            nonce: keccak256("n-1"),
            deadline: uint64(block.timestamp + 5 minutes)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, mandate.paymentDigest(p));
        bytes32 paymentId = mandate.settle(p, abi.encodePacked(r, s, v));
        assertEq(TUSD8.balanceOf(seller), 10_000);
        assertTrue(mandate.isSettled(paymentId));

        // 4. A prompt-injected payment to an attacker is refused.
        p.payee = attacker;
        p.nonce = keccak256("n-2");
        (v, r, s) = vm.sign(agentKey, mandate.paymentDigest(p));
        vm.expectRevert(AgentMandate.PayeeNotAllowed.selector);
        mandate.settle(p, abi.encodePacked(r, s, v));
    }
}
