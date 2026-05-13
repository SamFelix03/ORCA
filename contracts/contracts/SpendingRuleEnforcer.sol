// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";

contract SpendingRuleEnforcer is Ownable {
    struct Rule {
        uint256 timeWindow;
        uint256 budget;
        uint256 initialWindowStartTime;
    }

    Rule public rule;
    mapping(address => bool) public whitelistedProviders;

    uint256 public windowStart;
    uint256 public spentInWindow;
    uint8 public consecutiveBreaches;
    uint256 public pausedUntil;

    event SpendingRuleConfigured(uint256 timeWindow, uint256 budget, uint256 initialWindowStartTime);
    event ProviderWhitelistUpdated(address indexed provider, bool allowed);
    event SpendingWindowUpdated(uint256 windowStart, uint256 spentInWindow);
    event SpendingRuleBreach(address indexed provider, uint256 attemptedAmount, string reason);
    event VaultPaused(uint256 pausedUntil);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function configureRule(uint256 timeWindow, uint256 budget, uint256 initialWindowStartTime) external onlyOwner {
        require(timeWindow > 0, "SpendingRuleEnforcer: invalid window");
        rule = Rule({
            timeWindow: timeWindow,
            budget: budget,
            initialWindowStartTime: initialWindowStartTime
        });
        windowStart = initialWindowStartTime;
        spentInWindow = 0;
        consecutiveBreaches = 0;

        emit SpendingRuleConfigured(timeWindow, budget, initialWindowStartTime);
    }

    function setProviderWhitelist(address provider, bool allowed) external onlyOwner {
        whitelistedProviders[provider] = allowed;
        emit ProviderWhitelistUpdated(provider, allowed);
    }

    function enforceRules(address provider, uint256 amount) external view returns (bool) {
        if (block.timestamp < pausedUntil) {
            return false;
        }

        if (!whitelistedProviders[provider]) {
            return false;
        }

        (uint256 projectedSpent, ) = _projectedSpend(amount);
        if (projectedSpent > rule.budget) {
            return false;
        }

        return true;
    }

    function updateSpendingWindow(address provider, uint256 amount) external onlyOwner {
        if (block.timestamp < pausedUntil) {
            emit SpendingRuleBreach(provider, amount, "vault paused");
            revert("SpendingRuleEnforcer: vault paused");
        }

        require(whitelistedProviders[provider], "SpendingRuleEnforcer: provider not whitelisted");

        (uint256 projectedSpent, bool resetWindow) = _projectedSpend(amount);

        if (projectedSpent > rule.budget) {
            consecutiveBreaches += 1;
            emit SpendingRuleBreach(provider, amount, "budget exceeded");

            if (consecutiveBreaches >= 3) {
                pausedUntil = block.timestamp + 1 hours;
                consecutiveBreaches = 0;
                emit VaultPaused(pausedUntil);
            }

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
}
