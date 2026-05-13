// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";

contract ORCARegistry is Ownable {
    enum AgentType {
        SCOUT,
        RISK,
        EXECUTOR,
        AUDIT
    }

    struct Agent {
        address vault;
        AgentType agentType;
        bool active;
    }

    mapping(bytes32 => Agent) public agents;
    uint256 public currentEpochId;

    event AgentRegistered(bytes32 indexed did, address indexed vault, AgentType agentType);
    event AgentStatusUpdated(bytes32 indexed did, bool active);
    event EpochStarted(uint256 indexed epochId, uint256 startedAt);
    event EpochEnded(uint256 indexed epochId, uint256 endedAt);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerAgent(bytes32 did, address vault, AgentType agentType) external onlyOwner {
        require(did != bytes32(0), "ORCARegistry: did required");
        require(vault != address(0), "ORCARegistry: vault required");

        agents[did] = Agent({vault: vault, agentType: agentType, active: true});
        emit AgentRegistered(did, vault, agentType);
    }

    function setAgentStatus(bytes32 did, bool active) external onlyOwner {
        require(agents[did].vault != address(0), "ORCARegistry: unknown agent");
        agents[did].active = active;
        emit AgentStatusUpdated(did, active);
    }

    function startEpoch(uint256 epochId) external onlyOwner {
        require(epochId > currentEpochId, "ORCARegistry: epoch must increase");
        currentEpochId = epochId;
        emit EpochStarted(epochId, block.timestamp);
    }

    function endEpoch(uint256 epochId) external onlyOwner {
        require(epochId == currentEpochId, "ORCARegistry: wrong epoch");
        emit EpochEnded(epochId, block.timestamp);
    }

    function getVaultForAgent(bytes32 did) external view returns (address) {
        return agents[did].vault;
    }
}
