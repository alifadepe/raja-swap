// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {RajaSwap} from "../src/RajaSwap.sol";

contract Deploy is Script {
    function run() external returns (RajaSwap) {
        // Start broadcasting (account specified via --account flag)
        vm.startBroadcast();

        // Deploy
        RajaSwap rajaSwap = new RajaSwap();

        console.log("RajaSwap deployed to:", address(rajaSwap));
        console.log("Owner:", rajaSwap.owner());

        vm.stopBroadcast();

        return rajaSwap;
    }
}
