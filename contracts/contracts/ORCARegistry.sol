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
        uint256 registeredAt;
        uint256 updatedAt;
    }

    mapping(bytes32 => Agent) public agents;
    mapping(bytes32 => uint256) public scoutBondByDid;
    mapping(bytes32 => address) public scoutOwnerByDid;
    mapping(AgentType => bytes32[]) private didsByType;
    uint256 public currentEpochId;
    address public treasuryController;
    bool public epochActive;
    mapping(uint256 => uint256) public epochStartedAt;
    mapping(uint256 => uint256) public epochEndedAt;

    event AgentRegistered(bytes32 indexed did, address indexed vault, AgentType agentType);
    event AgentStatusUpdated(bytes32 indexed did, bool active);
    event AgentVaultUpdated(bytes32 indexed did, address indexed previousVault, address indexed newVault);
    event TreasuryControllerUpdated(address indexed previousController, address indexed newController);
    event EpochStarted(uint256 indexed epochId, uint256 startedAt);
    event EpochEnded(uint256 indexed epochId, uint256 endedAt);
    event PermissionlessScoutRegistered(bytes32 indexed did, address indexed owner, address indexed vault, uint256 bondAmount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyOwnerOrTreasury() {
        require(msg.sender == owner || msg.sender == treasuryController, "ORCARegistry: unauthorized");
        _;
    }

    function setTreasuryController(address newController) external onlyOwner {
        emit TreasuryControllerUpdated(treasuryController, newController);
        treasuryController = newController;
    }

    function registerAgent(bytes32 did, address vault, AgentType agentType) external onlyOwnerOrTreasury {
        require(did != bytes32(0), "ORCARegistry: did required");
        require(vault != address(0), "ORCARegistry: vault required");
        require(agents[did].registeredAt == 0, "ORCARegistry: already registered");

        agents[did] = Agent({
            vault: vault,
            agentType: agentType,
            active: true,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp
        });
        didsByType[agentType].push(did);
        emit AgentRegistered(did, vault, agentType);
    }

    function registerPermissionlessScout(bytes32 did, address vault, uint256 bondAmount) external {
        require(did != bytes32(0), "ORCARegistry: did required");
        require(vault != address(0), "ORCARegistry: vault required");
        require(bondAmount > 0, "ORCARegistry: bond required");
        require(agents[did].registeredAt == 0, "ORCARegistry: already registered");
        agents[did] = Agent({
            vault: vault,
            agentType: AgentType.SCOUT,
            active: true,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp
        });
        scoutBondByDid[did] = bondAmount;
        scoutOwnerByDid[did] = msg.sender;
        didsByType[AgentType.SCOUT].push(did);
        emit PermissionlessScoutRegistered(did, msg.sender, vault, bondAmount);
        emit AgentRegistered(did, vault, AgentType.SCOUT);
    }

    function setAgentStatus(bytes32 did, bool active) external onlyOwnerOrTreasury {
        require(agents[did].vault != address(0), "ORCARegistry: unknown agent");
        agents[did].active = active;
        agents[did].updatedAt = block.timestamp;
        emit AgentStatusUpdated(did, active);
    }

    function setAgentVault(bytes32 did, address newVault) external onlyOwnerOrTreasury {
        require(newVault != address(0), "ORCARegistry: vault required");
        Agent storage agent = agents[did];
        require(agent.vault != address(0), "ORCARegistry: unknown agent");
        address previousVault = agent.vault;
        agent.vault = newVault;
        agent.updatedAt = block.timestamp;
        emit AgentVaultUpdated(did, previousVault, newVault);
    }

    function startEpoch(uint256 epochId) external onlyOwnerOrTreasury {
        require(!epochActive, "ORCARegistry: epoch already active");
        require(epochId > currentEpochId, "ORCARegistry: epoch must increase");
        currentEpochId = epochId;
        epochActive = true;
        epochStartedAt[epochId] = block.timestamp;
        emit EpochStarted(epochId, block.timestamp);
    }

    function endEpoch(uint256 epochId) external onlyOwnerOrTreasury {
        require(epochActive, "ORCARegistry: no active epoch");
        require(epochId == currentEpochId, "ORCARegistry: wrong epoch");
        epochActive = false;
        epochEndedAt[epochId] = block.timestamp;
        emit EpochEnded(epochId, block.timestamp);
    }

    function getVaultForAgent(bytes32 did) external view returns (address) {
        return agents[did].vault;
    }

    function isRegisteredAgent(bytes32 did) external view returns (bool) {
        return agents[did].registeredAt != 0;
    }

    function isActiveAgent(bytes32 did) external view returns (bool) {
        Agent storage agent = agents[did];
        return agent.registeredAt != 0 && agent.active;
    }

    function getAgentCountByType(AgentType agentType) external view returns (uint256) {
        return didsByType[agentType].length;
    }

    function getAgentDidByTypeAt(AgentType agentType, uint256 index) external view returns (bytes32) {
        require(index < didsByType[agentType].length, "ORCARegistry: index out of bounds");
        return didsByType[agentType][index];
    }
}
