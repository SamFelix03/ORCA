// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./OrcaStubYieldVaultBase.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/external/aave-v3/IPool.sol";

/// @notice Aave V3–shaped stub; `asset` must match the vault `underlying`.
contract OrcaAaveV3StubVault is OrcaStubYieldVaultBase, IAaveV3PoolLike {
    constructor(address initialOwner, IERC20 underlying_, uint256 apyBps_)
        OrcaStubYieldVaultBase(initialOwner, underlying_, apyBps_)
    {}

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external nonReentrant {
        require(asset == address(underlying), "OrcaAaveStub: bad asset");
        require(onBehalfOf != address(0), "OrcaAaveStub: zero onBehalf");
        require(underlying.transferFrom(msg.sender, address(this), amount), "OrcaAaveStub: transfer");
        principalOf[onBehalfOf] += amount;
        lastAccrualTs[onBehalfOf] = block.timestamp;
        emit Deposited(msg.sender, onBehalfOf, amount);
    }

    function withdraw(address asset, uint256 amount, address to) external nonReentrant returns (uint256) {
        require(asset == address(underlying), "OrcaAaveStub: bad asset");
        require(to == msg.sender, "OrcaAaveStub: to must be msg.sender");
        require(amount == type(uint256).max || amount == principalOf[msg.sender] + accruedYield(msg.sender), "OrcaAaveStub: use full exit");
        uint256 p = principalOf[msg.sender];
        require(p > 0, "OrcaAaveStub: no position");
        uint256 y = accruedYield(msg.sender);
        uint256 totalOut = p + y;
        require(y <= rewardReserve, "OrcaAaveStub: yield float");
        require(underlying.balanceOf(address(this)) >= totalOut, "OrcaAaveStub: insolvent");

        principalOf[msg.sender] = 0;
        lastAccrualTs[msg.sender] = 0;
        rewardReserve -= y;

        require(underlying.transfer(to, totalOut), "OrcaAaveStub: transfer");
        emit Withdrawn(msg.sender, p, y, totalOut);
        return totalOut;
    }
}
