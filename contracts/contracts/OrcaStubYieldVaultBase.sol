// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./interfaces/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Hackathon stub: principal + linear stub APY; owner funds `rewardReserve` so withdrawals can pay simulated yield.
contract OrcaStubYieldVaultBase is Ownable, ReentrancyGuard {
    IERC20 public immutable underlying;
    /// @notice Annual yield in basis points (10000 = 100%)
    uint256 public apyBps;

    mapping(address => uint256) public principalOf;
    mapping(address => uint256) public lastAccrualTs;
    uint256 public rewardReserve;

    event Deposited(address indexed from, address indexed beneficiary, uint256 amount);
    event Withdrawn(address indexed user, uint256 principal, uint256 yieldPaid, uint256 total);
    event RewardsFunded(address indexed from, uint256 amount, uint256 newReserve);
    event ApyBpsUpdated(uint256 newApyBps);

    constructor(address initialOwner, IERC20 underlying_, uint256 apyBps_) Ownable(initialOwner) {
        require(address(underlying_) != address(0), "OrcaStub: zero underlying");
        require(apyBps_ <= 50_000, "OrcaStub: apy too high"); // cap 500% for safety
        underlying = underlying_;
        apyBps = apyBps_;
    }

    function setApyBps(uint256 newApyBps) external onlyOwner {
        require(newApyBps <= 50_000, "OrcaStub: apy too high");
        apyBps = newApyBps;
        emit ApyBpsUpdated(newApyBps);
    }

    /// @notice Pull reward float from owner so `withdraw` can pay `accruedYield`.
    function fundRewards(uint256 amount) external onlyOwner nonReentrant {
        require(underlying.transferFrom(msg.sender, address(this), amount), "OrcaStub: fund transfer");
        rewardReserve += amount;
        emit RewardsFunded(msg.sender, amount, rewardReserve);
    }

    function deposit(uint256 amount) external nonReentrant {
        _depositFrom(msg.sender, msg.sender, amount);
    }

    /// @notice Used by `RemoteAdapter`: adapter must have approved this vault on `underlying`.
    function depositFor(address beneficiary, uint256 amount) external nonReentrant {
        require(beneficiary != address(0), "OrcaStub: zero beneficiary");
        _depositFrom(msg.sender, beneficiary, amount);
    }

    function _depositFrom(address from, address beneficiary, uint256 amount) internal {
        require(amount > 0, "OrcaStub: zero amount");
        require(underlying.transferFrom(from, address(this), amount), "OrcaStub: deposit transfer");
        principalOf[beneficiary] += amount;
        lastAccrualTs[beneficiary] = block.timestamp;
        emit Deposited(from, beneficiary, amount);
    }

    function accruedYield(address user) public view returns (uint256) {
        uint256 p = principalOf[user];
        if (p == 0) return 0;
        uint256 dt = block.timestamp - lastAccrualTs[user];
        if (dt == 0) return 0;
        return (p * apyBps * dt) / (365 days) / uint256(10_000);
    }

    function claimableOf(address user) external view returns (uint256 principal, uint256 yield_, uint256 total) {
        principal = principalOf[user];
        yield_ = accruedYield(user);
        total = principal + yield_;
    }

    /// @notice Full exit: principal + accrued yield (yield paid from `rewardReserve`).
    function withdraw() external nonReentrant {
        address user = msg.sender;
        uint256 p = principalOf[user];
        require(p > 0, "OrcaStub: no position");
        uint256 y = accruedYield(user);
        uint256 totalOut = p + y;
        require(y <= rewardReserve, "OrcaStub: insufficient yield float");
        require(underlying.balanceOf(address(this)) >= totalOut, "OrcaStub: insolvent");

        principalOf[user] = 0;
        lastAccrualTs[user] = 0;
        rewardReserve -= y;

        require(underlying.transfer(user, totalOut), "OrcaStub: withdraw transfer");
        emit Withdrawn(user, p, y, totalOut);
    }
}
