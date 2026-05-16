// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IMessageRecipient.sol";

contract MockMailbox {
    event DispatchCalled(uint32 indexed destinationDomain, bytes32 indexed recipientAddress, bytes messageBody);

    bytes32 private _nextDispatchId;

    function setNextDispatchId(bytes32 nextDispatchId) external {
        _nextDispatchId = nextDispatchId;
    }

    function dispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        returns (bytes32)
    {
        emit DispatchCalled(destinationDomain, recipientAddress, messageBody);
        if (_nextDispatchId == bytes32(0)) {
            return keccak256(abi.encode(destinationDomain, recipientAddress, messageBody, block.timestamp));
        }
        return _nextDispatchId;
    }

    /// @dev Simulates Hyperlane delivery so tests can invoke `IMessageRecipient.handle` with `msg.sender` = this mailbox.
    function deliver(address recipient, uint32 origin, bytes32 sender, bytes calldata body) external payable {
        IMessageRecipient(recipient).handle{value: msg.value}(origin, sender, body);
    }
}
