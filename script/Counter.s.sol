// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Counter} from "../src/Counter.sol";

contract CounterScript is Script {
    function setUp() public {}

    function run() public {
        uint256 key = vm.envUint("SIGNING_KEY");

        vm.startBroadcast(key);

        Counter counter = new Counter();

        vm.stopBroadcast();
        console.log("counter deployed at", address(counter));
    }
}
