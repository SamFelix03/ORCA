// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Compound III Comet — minimal supply surface for ORCA stubs
/// @notice See Compound III `supply(address asset, uint256 amount)` pattern
interface ICometLike {
    function supply(address asset, uint256 amount) external;
}
