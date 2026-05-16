// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IInterchainSecurityModule {
    function moduleType() external view returns (uint8);

    function verify(bytes calldata metadata, bytes calldata message) external returns (bool);
}
