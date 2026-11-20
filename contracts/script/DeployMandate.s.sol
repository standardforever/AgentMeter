// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentMandate} from "../src/AgentMandate.sol";
import {MLDSA65Verifier} from "../src/verifiers/MLDSA65Verifier.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

/// @notice Deploys AgentMandate and the (not-yet-live) ML-DSA-65 verifier adapter.
///   - Aevum testnet and `make fork`: uses the real tUSD8.
///   - `make anvil` (chain 31337) only: deploys MockUSD8 and mints 1,000 to the deployer.
///   MLDSA_PRECOMPILE (optional env): QDay's ML-DSA-65 precompile once published; default address(0).
///
///   make deploy-mandate-aevum ACCOUNT=deployer
contract DeployMandate is Script {
    address constant AEVUM_TUSD8 = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 constant ANVIL_CHAIN = 31337;

    function run() external returns (AgentMandate mandate, MLDSA65Verifier pqVerifier, address token) {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        if (AEVUM_TUSD8.code.length > 0) {
            token = AEVUM_TUSD8;
        } else {
            require(block.chainid == ANVIL_CHAIN, "tUSD8 not found on this chain. Check the RPC (Aevum testnet is 44005).");
            MockUSD8 mock = new MockUSD8();
            mock.mint(deployer, 1_000e6);
            token = address(mock);
        }
        mandate = new AgentMandate(IERC20(token));
        pqVerifier = new MLDSA65Verifier(vm.envOr("MLDSA_PRECOMPILE", address(0)));
        vm.stopBroadcast();

        console.log("chainId          ", block.chainid);
        console.log("token            ", token);
        console.log("AgentMandate     ", address(mandate));
        console.log("MLDSA65Verifier  ", address(pqVerifier));
    }
}
