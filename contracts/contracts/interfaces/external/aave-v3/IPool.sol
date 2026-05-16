// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Aave V3 Pool interface (minimal subset for ORCA stubs)
/// @notice Sourced from Aave V3 core — https://github.com/aave/aave-v3-core/blob/master/contracts/interfaces/IPool.sol
interface IAaveV3PoolLike {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
