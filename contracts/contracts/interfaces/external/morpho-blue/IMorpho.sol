// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Morpho Blue — market params + supply (minimal)
/// @notice From Morpho Blue core — https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

interface IMorphoLike {
    function supply(
        MarketParams calldata marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata data
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied);
}
