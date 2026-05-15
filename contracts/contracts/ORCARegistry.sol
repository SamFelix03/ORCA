// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./interfaces/IERC20.sol";

/// @title ORCARegistry
/// @notice Central registry for agent DIDs (bytes32) and epochs.
/// @dev Permissionless scout DID convention: `didHash = keccak256(bytes(didUtf8String))`,
///      matching off-chain `ethers.keccak256(ethers.toUtf8Bytes(did))` / web3 `keccak(text=did)`.
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

    IERC20 public immutable scoutStakeToken;
    address public stakeRecipient;

    mapping(bytes32 => Agent) public agents;
    mapping(bytes32 => uint256) public scoutBondByDid;
    mapping(bytes32 => address) public scoutOwnerByDid;
    mapping(AgentType => bytes32[]) private didsByType;
    uint256 public currentEpochId;
    address public treasuryController;
    bool public epochActive;
    mapping(uint256 => uint256) public epochStartedAt;
    mapping(uint256 => uint256) public epochEndedAt;

    /// @notice Minimum stake amount for permissionless scout registration (owner configurable).
    uint256 public minScoutBond;

    event AgentRegistered(bytes32 indexed did, address indexed vault, AgentType agentType);
    event AgentStatusUpdated(bytes32 indexed did, bool active);
    event AgentVaultUpdated(bytes32 indexed did, address indexed previousVault, address indexed newVault);
    event TreasuryControllerUpdated(address indexed previousController, address indexed newController);
    event EpochStarted(uint256 indexed epochId, uint256 startedAt);
    event EpochEnded(uint256 indexed epochId, uint256 endedAt);
    event PermissionlessScoutRegistered(bytes32 indexed didHash, address indexed owner, address indexed vault, uint256 bondAmount);
    event StakeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event MinScoutBondUpdated(uint256 previousMin, uint256 newMin);

    constructor(address initialOwner, IERC20 _scoutStakeToken, address _stakeRecipient) Ownable(initialOwner) {
        require(address(_scoutStakeToken) != address(0), "ORCARegistry: stake token required");
        require(_stakeRecipient != address(0), "ORCARegistry: stake recipient required");
        scoutStakeToken = _scoutStakeToken;
        stakeRecipient = _stakeRecipient;
    }

    modifier onlyOwnerOrTreasury() {
        require(msg.sender == owner || msg.sender == treasuryController, "ORCARegistry: unauthorized");
        _;
    }

    function setTreasuryController(address newController) external onlyOwner {
        emit TreasuryControllerUpdated(treasuryController, newController);
        treasuryController = newController;
    }

    function setStakeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "ORCARegistry: stake recipient required");
        emit StakeRecipientUpdated(stakeRecipient, newRecipient);
        stakeRecipient = newRecipient;
    }

    function setMinScoutBond(uint256 newMin) external onlyOwner {
        emit MinScoutBondUpdated(minScoutBond, newMin);
        minScoutBond = newMin;
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

    /// @param didHash keccak256(bytes(didUtf8String)) for the scout Passport DID.
    /// @param vault Scout ClientAgentVault (or EOA-operated vault address used by runtime).
    /// @param bondAmount Amount of scoutStakeToken to pull from msg.sender into stakeRecipient.
    function registerPermissionlessScout(bytes32 didHash, address vault, uint256 bondAmount) external {
        require(didHash != bytes32(0), "ORCARegistry: did required");
        require(vault != address(0), "ORCARegistry: vault required");
        require(bondAmount > 0, "ORCARegistry: bond required");
        require(bondAmount >= minScoutBond, "ORCARegistry: bond below minimum");
        require(agents[didHash].registeredAt == 0, "ORCARegistry: already registered");

        require(
            scoutStakeToken.transferFrom(msg.sender, stakeRecipient, bondAmount),
            "ORCARegistry: stake transfer failed"
        );

        agents[didHash] = Agent({
            vault: vault,
            agentType: AgentType.SCOUT,
            active: true,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp
        });
        scoutBondByDid[didHash] = bondAmount;
        scoutOwnerByDid[didHash] = msg.sender;
        didsByType[AgentType.SCOUT].push(didHash);
        emit PermissionlessScoutRegistered(didHash, msg.sender, vault, bondAmount);
        emit AgentRegistered(didHash, vault, AgentType.SCOUT);
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
