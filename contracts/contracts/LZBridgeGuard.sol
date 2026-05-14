// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";

contract LZBridgeGuard is Ownable {
    uint256 public approvalThresholdUsdc;
    mapping(bytes32 => bool) public approvedTransfers;
    mapping(address => bool) public authorizedCallers;

    event ApprovalThresholdUpdated(uint256 previousThreshold, uint256 newThreshold);
    event AuthorizedCallerUpdated(address indexed caller, bool allowed);
    event TransferApproved(bytes32 indexed transferId, uint256 amountUsdc);
    event TransferConsumed(bytes32 indexed transferId, uint256 amountUsdc);

    constructor(address initialOwner, uint256 initialThresholdUsdc) Ownable(initialOwner) {
        approvalThresholdUsdc = initialThresholdUsdc;
    }

    modifier onlyAuthorizedCaller() {
        require(authorizedCallers[msg.sender], "LZBridgeGuard: unauthorized caller");
        _;
    }

    function setApprovalThresholdUsdc(uint256 newThreshold) external onlyOwner {
        emit ApprovalThresholdUpdated(approvalThresholdUsdc, newThreshold);
        approvalThresholdUsdc = newThreshold;
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerUpdated(caller, allowed);
    }

    function approveTransfer(bytes32 transferId, uint256 amountUsdc) external onlyOwner {
        require(transferId != bytes32(0), "LZBridgeGuard: invalid transferId");
        require(amountUsdc >= approvalThresholdUsdc, "LZBridgeGuard: amount below threshold");
        approvedTransfers[transferId] = true;
        emit TransferApproved(transferId, amountUsdc);
    }

    function requireApproval(bytes32 transferId, uint256 amountUsdc) external onlyAuthorizedCaller {
        if (amountUsdc < approvalThresholdUsdc) {
            return;
        }
        require(approvedTransfers[transferId], "LZBridgeGuard: transfer not approved");
        delete approvedTransfers[transferId];
        emit TransferConsumed(transferId, amountUsdc);
    }
}
