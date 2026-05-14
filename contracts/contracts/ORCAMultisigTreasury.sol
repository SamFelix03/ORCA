// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./ORCARegistry.sol";
import "./PoAIAttribution.sol";

contract ORCAMultisigTreasury is Ownable {
    mapping(address => bool) public isSigner;
    uint256 public signerCount;
    uint256 public threshold;

    struct Proposal {
        bytes32 id;
        address target;
        uint256 value;
        bytes data;
        uint256 approvals;
        uint256 createdAt;
        bool executed;
    }

    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => mapping(address => bool)) public approvedBy;

    ORCARegistry public registry;
    PoAIAttribution public poai;

    event SignerUpdated(address indexed signer, bool allowed);
    event ThresholdUpdated(uint256 previousThreshold, uint256 newThreshold);
    event ProposalCreated(bytes32 indexed id, address indexed proposer, address indexed target, uint256 value);
    event ProposalApproved(bytes32 indexed id, address indexed signer, uint256 approvals);
    event ProposalExecuted(bytes32 indexed id, address indexed executor, bool success);
    event RegistryLinked(address indexed registryAddress);
    event PoAILinked(address indexed poaiAddress);

    error NotSigner();
    error InvalidThreshold();
    error ProposalMissing();
    error AlreadyApproved();
    error ProposalExecutedAlready();
    error QuorumNotMet();
    error ExecutionFailed();

    constructor(address initialOwner, address[] memory initialSigners, uint256 initialThreshold) Ownable(initialOwner) {
        _configureSigners(initialSigners, initialThreshold);
    }

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner();
        _;
    }

    receive() external payable {}

    function setRegistry(address registryAddress) external onlyOwner {
        registry = ORCARegistry(registryAddress);
        emit RegistryLinked(registryAddress);
    }

    function setPoAI(address poaiAddress) external onlyOwner {
        poai = PoAIAttribution(poaiAddress);
        emit PoAILinked(poaiAddress);
    }

    function configureSigners(address[] calldata signers, uint256 newThreshold) external onlyOwner {
        _configureSigners(signers, newThreshold);
    }

    function submitProposal(address target, uint256 value, bytes calldata data) external onlySigner returns (bytes32 id) {
        require(target != address(0), "ORCAMultisigTreasury: invalid target");
        id = keccak256(abi.encodePacked(block.chainid, target, value, data, block.timestamp, msg.sender));
        proposals[id] = Proposal({
            id: id,
            target: target,
            value: value,
            data: data,
            approvals: 0,
            createdAt: block.timestamp,
            executed: false
        });
        emit ProposalCreated(id, msg.sender, target, value);
        _approve(id, msg.sender);
    }

    function approveProposal(bytes32 id) external onlySigner {
        _approve(id, msg.sender);
    }

    function executeProposal(bytes32 id) external onlySigner {
        Proposal storage proposal = proposals[id];
        if (proposal.createdAt == 0) revert ProposalMissing();
        if (proposal.executed) revert ProposalExecutedAlready();
        if (proposal.approvals < threshold) revert QuorumNotMet();

        proposal.executed = true;
        (bool ok,) = proposal.target.call{value: proposal.value}(proposal.data);
        emit ProposalExecuted(id, msg.sender, ok);
        if (!ok) revert ExecutionFailed();
    }

    function _approve(bytes32 id, address signer) internal {
        Proposal storage proposal = proposals[id];
        if (proposal.createdAt == 0) revert ProposalMissing();
        if (proposal.executed) revert ProposalExecutedAlready();
        if (approvedBy[id][signer]) revert AlreadyApproved();
        approvedBy[id][signer] = true;
        proposal.approvals += 1;
        emit ProposalApproved(id, signer, proposal.approvals);
    }

    function _configureSigners(address[] memory signers, uint256 newThreshold) internal {
        for (uint256 i = 0; i < signers.length; i++) {
            require(signers[i] != address(0), "ORCAMultisigTreasury: invalid signer");
        }
        if (newThreshold == 0 || newThreshold > signers.length) revert InvalidThreshold();

        for (uint256 i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = true;
            emit SignerUpdated(signers[i], true);
        }
        signerCount = signers.length;
        emit ThresholdUpdated(threshold, newThreshold);
        threshold = newThreshold;
    }
}
