// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Uniswap V3 NonfungiblePositionManager — mint params + mint (minimal)
/// @notice From Uniswap v3 periphery — https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/INonfungiblePositionManager.sol
struct MintParams {
    address token0;
    address token1;
    uint24 fee;
    int24 tickLower;
    int24 tickUpper;
    uint256 amount0Desired;
    uint256 amount1Desired;
    uint256 amount0Min;
    uint256 amount1Min;
    address recipient;
    uint256 deadline;
}

interface INonfungiblePositionManagerLike {
    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}
