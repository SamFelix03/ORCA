// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";

contract SpendingRuleEnforcer is Ownable {
    struct Rule {
        uint256 timeWindow;
        uint256 budget;
        uint256 maxPerTx;
        uint256 initialWindowStartTime;
    }

    Rule public rule;
    mapping(address => bool) public whitelistedProviders;

    address public vault;
    uint256 public windowStart;
    uint256 public spentInWindow;
    uint8 public consecutiveBreaches;
    uint256 public pausedUntil;

    event SpendingRuleConfigured(uint256 timeWindow, uint256 budget, uint256 maxPerTx, uint256 initialWindowStartTime);
    event ProviderWhitelistUpdated(address indexed provider, bool allowed);
    event SpendingWindowUpdated(uint256 windowStart, uint256 spentInWindow);
    event SpendingRuleBreach(address indexed provider, uint256 attemptedAmount, string reason);
    event VaultPaused(uint256 pausedUntil);
    event VaultUpdated(address indexed previousVault, address indexed newVault);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyVault() {
        require(msg.sender == vault, "SpendingRuleEnforcer: only vault");
        _;
    }

    function setVault(address newVault) external onlyOwner {
        require(newVault != address(0), "SpendingRuleEnforcer: invalid vault");
        emit VaultUpdated(vault, newVault);
        vault = newVault;
    }

    function configureRule(uint256 timeWindow, uint256 budget, uint256 maxPerTx, uint256 initialWindowStartTime)
        external
        onlyOwner
    {
        require(timeWindow > 0, "SpendingRuleEnforcer: invalid window");
        require(budget > 0, "SpendingRuleEnforcer: invalid budget");
        require(maxPerTx > 0 && maxPerTx <= budget, "SpendingRuleEnforcer: invalid maxPerTx");
        rule = Rule({
            timeWindow: timeWindow,
            budget: budget,
            maxPerTx: maxPerTx,
            initialWindowStartTime: initialWindowStartTime
        });
        windowStart = initialWindowStartTime;
        spentInWindow = 0;
        consecutiveBreaches = 0;

        emit SpendingRuleConfigured(timeWindow, budget, maxPerTx, initialWindowStartTime);
    }

    function setProviderWhitelist(address provider, bool allowed) external onlyOwner {
        whitelistedProviders[provider] = allowed;
        emit ProviderWhitelistUpdated(provider, allowed);
    }

    function enforceRules(address provider, uint256 amount) external view returns (bool) {
        if (rule.timeWindow == 0 || rule.budget == 0 || rule.maxPerTx == 0) {
            return false;
        }
        if (block.timestamp < pausedUntil) {
            return false;
        }

        if (!whitelistedProviders[provider]) {
            return false;
        }

        if (amount > rule.maxPerTx) {
            return false;
        }

        (uint256 projectedSpent, ) = _projectedSpend(amount);
        if (projectedSpent > rule.budget) {
            return false;
        }

        return true;
    }

    function updateSpendingWindow(address provider, uint256 amount) external onlyVault {
        if (block.timestamp < pausedUntil) {
            emit SpendingRuleBreach(provider, amount, "vault paused");
            revert("SpendingRuleEnforcer: vault paused");
        }

        if (rule.timeWindow == 0 || rule.budget == 0 || rule.maxPerTx == 0) {
            emit SpendingRuleBreach(provider, amount, "rule not configured");
            revert("SpendingRuleEnforcer: rule not configured");
        }

        require(whitelistedProviders[provider], "SpendingRuleEnforcer: provider not whitelisted");
        if (amount > rule.maxPerTx) {
            consecutiveBreaches += 1;
            emit SpendingRuleBreach(provider, amount, "per tx cap exceeded");
            _pauseIfThresholdReached();
            revert("SpendingRuleEnforcer: per tx cap exceeded");
        }

        (uint256 projectedSpent, bool resetWindow) = _projectedSpend(amount);

        if (projectedSpent > rule.budget) {
            consecutiveBreaches += 1;
            emit SpendingRuleBreach(provider, amount, "budget exceeded");
            _pauseIfThresholdReached();

            revert("SpendingRuleEnforcer: budget exceeded");
        }

        consecutiveBreaches = 0;

        if (resetWindow) {
            windowStart = block.timestamp;
            spentInWindow = amount;
        } else {
            spentInWindow = projectedSpent;
        }

        emit SpendingWindowUpdated(windowStart, spentInWindow);
    }

    function _projectedSpend(uint256 amount) internal view returns (uint256 projectedSpent, bool resetWindow) {
        if (block.timestamp >= windowStart + rule.timeWindow) {
            return (amount, true);
        }

        return (spentInWindow + amount, false);
    }

    function _pauseIfThresholdReached() internal {
        if (consecutiveBreaches >= 3) {
            pausedUntil = block.timestamp + 1 hours;
            consecutiveBreaches = 0;
            emit VaultPaused(pausedUntil);
        }
    }
}
