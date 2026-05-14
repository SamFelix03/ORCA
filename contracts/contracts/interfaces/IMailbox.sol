// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMailbox {
    function dispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        returns (bytes32);
}
