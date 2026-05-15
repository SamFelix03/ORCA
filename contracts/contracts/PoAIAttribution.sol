// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./interfaces/IERC20.sol";

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
    mapping(uint256 => mapping(bytes32 => int256)) public epochAgentValueDelta;
    mapping(uint256 => bool) public epochDistributed;
    mapping(uint256 => uint256) public epochTotalSignals;
    mapping(uint256 => uint256) public epochTotalExecutions;
    address public rewardDistributor;
    IERC20 public rewardToken;

    event AgentRegistrationUpdated(bytes32 indexed agentDID, bool registered);
    event ActionRecorded(uint256 indexed epochId, bytes32 indexed agentDID, ActionType actionType, int256 valueDelta);
    event EpochRewardsDistributed(uint256 indexed epochId, uint256 recordCount, address indexed distributor);
    event RewardDistributorUpdated(address indexed previousDistributor, address indexed newDistributor);
    event RewardTokenUpdated(address indexed token);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyRegisteredAgent(bytes32 agentDID) {
        require(registeredAgents[agentDID], "PoAIAttribution: agent not registered");
        _;
    }

    function setRegisteredAgent(bytes32 agentDID, bool registered) external onlyOwner {
        require(agentDID != bytes32(0), "PoAIAttribution: invalid agent");
        registeredAgents[agentDID] = registered;
        emit AgentRegistrationUpdated(agentDID, registered);
    }

    function setRewardDistributor(address newDistributor) external onlyOwner {
        emit RewardDistributorUpdated(rewardDistributor, newDistributor);
        rewardDistributor = newDistributor;
    }

    function setRewardToken(address token) external onlyOwner {
        require(token != address(0), "PoAIAttribution: invalid token");
        rewardToken = IERC20(token);
        emit RewardTokenUpdated(token);
    }

    function recordAction(uint256 epochId, AttributionRecord calldata record)
        external
        onlyRegisteredAgent(record.agentDID)
    {
        require(epochId > 0, "PoAIAttribution: invalid epoch");
        require(record.timestamp <= block.timestamp + 5 minutes, "PoAIAttribution: invalid timestamp");
        require(record.timestamp + 1 hours >= block.timestamp, "PoAIAttribution: stale record");

        epochRecords[epochId].push(record);
        epochAgentValueDelta[epochId][record.agentDID] += record.valueDelta;

        if (record.actionType == ActionType.SIGNAL) {
            epochTotalSignals[epochId] += 1;
        } else if (record.actionType == ActionType.EXECUTION) {
            epochTotalExecutions[epochId] += 1;
        }
        emit ActionRecorded(epochId, record.agentDID, record.actionType, record.valueDelta);
    }

    function distributeEpochRewards(uint256 epochId) external onlyOwner {
        require(!epochDistributed[epochId], "PoAIAttribution: already distributed");
        require(address(rewardToken) != address(0), "PoAIAttribution: reward token not set");
        require(rewardDistributor != address(0), "PoAIAttribution: reward distributor not set");
        uint256 rewardBalance = rewardToken.balanceOf(address(this));
        require(rewardBalance > 0, "PoAIAttribution: no rewards funded");
        epochDistributed[epochId] = true;
        require(rewardToken.transfer(rewardDistributor, rewardBalance), "PoAIAttribution: transfer failed");
        emit EpochRewardsDistributed(epochId, epochRecords[epochId].length, rewardDistributor);
    }

    function getEpochRecordCount(uint256 epochId) external view returns (uint256) {
        return epochRecords[epochId].length;
    }

    function getEpochRecord(uint256 epochId, uint256 index) external view returns (AttributionRecord memory) {
        require(index < epochRecords[epochId].length, "PoAIAttribution: index out of bounds");
        return epochRecords[epochId][index];
    }
}
