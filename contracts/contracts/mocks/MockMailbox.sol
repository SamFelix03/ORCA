// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IMessageRecipient.sol";

contract MockMailbox {
    event DispatchCalled(uint32 indexed destinationDomain, bytes32 indexed recipientAddress, bytes messageBody);

    bytes32 private _nextDispatchId;

    function setNextDispatchId(bytes32 nextDispatchId) external {
        _nextDispatchId = nextDispatchId;
    }

    uint256 public quoteFee;

    function setQuoteFee(uint256 newFee) external {
        quoteFee = newFee;
    }

    function quoteDispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        view
        returns (uint256 fee)
    {
        destinationDomain;
        recipientAddress;
        messageBody;
        return quoteFee;
    }

    function dispatch(uint32 destinationDomain, bytes32 recipientAddress, bytes calldata messageBody)
        external
        payable
        returns (bytes32)
    {
        require(msg.value >= quoteFee, "MockMailbox: insufficient dispatch fee");
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
