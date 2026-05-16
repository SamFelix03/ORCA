// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./SpendingRuleEnforcer.sol";

contract ClientAgentVault is Ownable {
    SpendingRuleEnforcer public enforcer;
    address public executor;
    uint256 public nonce;

    event ExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event EnforcerUpdated(address indexed previousEnforcer, address indexed newEnforcer);
    event VaultExecuted(
        uint256 indexed nonce,
        address indexed executor,
        address indexed target,
        uint256 value,
        uint256 amountForRule
    );

    error NotExecutor();
    error InvalidTarget();
    error EnforcerRejected();
    error ExecutionFailed();
    error ValueMismatch();

    constructor(address initialOwner, address initialExecutor, address enforcerAddress) Ownable(initialOwner) {
        require(initialExecutor != address(0), "ClientAgentVault: invalid executor");
        executor = initialExecutor;
        if (enforcerAddress != address(0)) {
            enforcer = SpendingRuleEnforcer(enforcerAddress);
        }
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor();
        _;
    }

    receive() external payable {}

    function setExecutor(address newExecutor) external onlyOwner {
        require(newExecutor != address(0), "ClientAgentVault: invalid executor");
        emit ExecutorUpdated(executor, newExecutor);
        executor = newExecutor;
    }

    function setEnforcer(address newEnforcer) external onlyOwner {
        emit EnforcerUpdated(address(enforcer), newEnforcer);
        enforcer = SpendingRuleEnforcer(newEnforcer);
    }

    function execute(address target, uint256 value, bytes calldata data, uint256 amountForRule)
        external
        payable
        onlyExecutor
        returns (bytes memory result)
    {
        if (target == address(0)) revert InvalidTarget();
        if (msg.value != value) revert ValueMismatch();

        if (address(enforcer) != address(0) && amountForRule > 0) {
            if (!enforcer.enforceRules(target, amountForRule)) revert EnforcerRejected();
            enforcer.updateSpendingWindow(target, amountForRule);
        }

        (bool ok, bytes memory returndata) = target.call{value: value}(data);
        if (!ok) {
            // Bubble inner revert (OApp custom errors, require strings, etc.) instead of masking as ExecutionFailed.
            if (returndata.length > 0) {
                assembly ("memory-safe") {
                    let len := mload(returndata)
                    revert(add(returndata, 32), len)
                }
            }
            revert ExecutionFailed();
        }
        nonce += 1;
        emit VaultExecuted(nonce, msg.sender, target, value, amountForRule);
        return returndata;
    }
}
