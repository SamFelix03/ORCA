// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./OrcaStubYieldVaultBase.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/external/morpho-blue/IMorpho.sol";

/// @notice Morpho Blue–shaped stub; only `loanToken` must match `underlying`.
contract OrcaMorphoBlueStubVault is OrcaStubYieldVaultBase, IMorphoLike {
    constructor(address initialOwner, IERC20 underlying_, uint256 apyBps_)
        OrcaStubYieldVaultBase(initialOwner, underlying_, apyBps_)
    {}

    function supply(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata
    ) external nonReentrant returns (uint256 assetsSupplied, uint256 sharesSupplied) {
        require(marketParams.loanToken == address(underlying), "OrcaMorphoStub: bad loanToken");
        require(onBehalf != address(0), "OrcaMorphoStub: zero onBehalf");
        require(shares == 0, "OrcaMorphoStub: shares unsupported");
        require(assets > 0, "OrcaMorphoStub: zero assets");
        require(underlying.transferFrom(msg.sender, address(this), assets), "OrcaMorphoStub: transfer");
        principalOf[onBehalf] += assets;
        lastAccrualTs[onBehalf] = block.timestamp;
        emit Deposited(msg.sender, onBehalf, assets);
        return (assets, 0);
    }
}
