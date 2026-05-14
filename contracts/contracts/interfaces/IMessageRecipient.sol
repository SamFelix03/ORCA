// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMessageRecipient {
    function handle(uint32 origin, bytes32 sender, bytes calldata body) external payable;
}
