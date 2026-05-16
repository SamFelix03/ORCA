// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Testnet-only ISM: always verifies. Do not use on mainnet.
contract NoopISM {
    function moduleType() external pure returns (uint8) {
        return 6;
    }

    function verify(bytes calldata, bytes calldata) external pure returns (bool) {
        return true;
    }
}
