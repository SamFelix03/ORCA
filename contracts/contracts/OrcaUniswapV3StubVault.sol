// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./OrcaStubYieldVaultBase.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/external/uniswap-v3/INonfungiblePositionManager.sol";

/// @notice Uniswap v3 NPM–shaped stub: one-sided mint into `recipient` using `token0` as `underlying`.
contract OrcaUniswapV3StubVault is OrcaStubYieldVaultBase, INonfungiblePositionManagerLike {
    uint256 private _nextTokenId = 1;

    constructor(address initialOwner, IERC20 underlying_, uint256 apyBps_)
        OrcaStubYieldVaultBase(initialOwner, underlying_, apyBps_)
    {}

    function mint(MintParams calldata params)
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(params.token0 == address(underlying), "OrcaUniStub: token0 must be underlying");
        require(params.token1 != address(0), "OrcaUniStub: token1");
        require(params.recipient != address(0), "OrcaUniStub: recipient");
        require(params.amount0Desired > 0, "OrcaUniStub: amount0");
        require(params.amount1Desired == 0, "OrcaUniStub: one-sided only");
        require(params.deadline >= block.timestamp, "OrcaUniStub: deadline");

        require(
            underlying.transferFrom(msg.sender, address(this), params.amount0Desired),
            "OrcaUniStub: transfer"
        );
        principalOf[params.recipient] += params.amount0Desired;
        lastAccrualTs[params.recipient] = block.timestamp;
        emit Deposited(msg.sender, params.recipient, params.amount0Desired);

        tokenId = _nextTokenId++;
        liquidity = 0;
        amount0 = params.amount0Desired;
        amount1 = 0;
    }
}
