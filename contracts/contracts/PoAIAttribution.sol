// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";

contract PoAIAttribution is Ownable {
    enum ActionType {
        SIGNAL,
        RISK_EVAL,
        EXECUTION,
        AUDIT
    }

    struct AttributionRecord {
        bytes32 agentDID;
        ActionType actionType;
        bytes32 inputHash;
        bytes32 outcomeHash;
        int256 valueDelta;
        uint256 timestamp;
    }

    mapping(bytes32 => bool) public registeredAgents;
    mapping(uint256 => AttributionRecord[]) private epochRecords;

    event AgentRegistrationUpdated(bytes32 indexed agentDID, bool registered);
    event ActionRecorded(uint256 indexed epochId, bytes32 indexed agentDID, ActionType actionType, int256 valueDelta);
    event EpochRewardsDistributed(uint256 indexed epochId, uint256 recordCount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyRegisteredAgent(bytes32 agentDID) {
        require(registeredAgents[agentDID], "PoAIAttribution: agent not registered");
        _;
    }

    function setRegisteredAgent(bytes32 agentDID, bool registered) external onlyOwner {
        registeredAgents[agentDID] = registered;
        emit AgentRegistrationUpdated(agentDID, registered);
    }

    function recordAction(uint256 epochId, AttributionRecord calldata record)
        external
        onlyRegisteredAgent(record.agentDID)
    {
        require(record.timestamp <= block.timestamp + 5 minutes, "PoAIAttribution: invalid timestamp");
        epochRecords[epochId].push(record);
        emit ActionRecorded(epochId, record.agentDID, record.actionType, record.valueDelta);
    }

    function distributeEpochRewards(uint256 epochId) external onlyOwner {
        emit EpochRewardsDistributed(epochId, epochRecords[epochId].length);
    }

    function getEpochRecordCount(uint256 epochId) external view returns (uint256) {
        return epochRecords[epochId].length;
    }
}
