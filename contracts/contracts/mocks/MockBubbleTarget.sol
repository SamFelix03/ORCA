// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Used in tests for ClientAgentVault revert bubbling.
contract MockBubbleTarget {
    error SomeCustom();

    function revertCustom() external pure {
        revert SomeCustom();
    }

    function revertString() external pure {
        revert("inner reason");
    }
}
