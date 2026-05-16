// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./OrcaStubYieldVaultBase.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/external/compound-v3/IComet.sol";

/// @notice Compound III Comet–shaped stub (`supply` to `msg.sender`).
contract OrcaCompoundV3StubVault is OrcaStubYieldVaultBase, ICometLike {
    constructor(address initialOwner, IERC20 underlying_, uint256 apyBps_)
        OrcaStubYieldVaultBase(initialOwner, underlying_, apyBps_)
    {}

    function supply(address asset, uint256 amount) external nonReentrant {
        require(asset == address(underlying), "OrcaCometStub: bad asset");
        _depositFrom(msg.sender, msg.sender, amount);
    }
}
