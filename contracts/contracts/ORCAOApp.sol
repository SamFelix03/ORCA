// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./LZBridgeGuard.sol";
import "./interfaces/IMailbox.sol";

contract ORCAOApp is Ownable {
    uint8 public constant MESSAGE_VERSION = 1;
    IMailbox public immutable mailbox;
    LZBridgeGuard public bridgeGuard;
    address public executorVault;
    uint32 public immutable localDomain;

    mapping(uint32 => bytes32) public trustedRemotes;
    mapping(bytes32 => bool) public executedPayloads;

    event TrustedRemoteSet(uint32 indexed domain, bytes32 remote);
    event BridgeGuardUpdated(address indexed previousGuard, address indexed newGuard);
    event CrossChainRebalanceRequested(
        uint32 indexed dstDomain,
        address indexed fromProtocol,
        address indexed toProtocol,
        uint256 amount,
        bytes32 destinationAdapter,
        bytes32 transferId,
        bytes32 dispatchId,
        bytes payload
    );
    event CrossChainMessageReceived(bytes32 indexed transferId, uint32 indexed originDomain, bytes payload);

    error NotExecutorVault();
    error MissingTrustedRemote();
    error InvalidPayload();
    error MailboxOnly();

    constructor(
        address initialOwner,
        address mailboxAddress,
        address initialExecutorVault,
        address bridgeGuardAddress,
        uint32 chainDomain
    )
        Ownable(initialOwner)
    {
        require(mailboxAddress != address(0), "ORCAOApp: invalid mailbox");
        require(initialExecutorVault != address(0), "ORCAOApp: invalid executor vault");
        require(chainDomain != 0, "ORCAOApp: invalid local domain");
        mailbox = IMailbox(mailboxAddress);
        executorVault = initialExecutorVault;
        bridgeGuard = LZBridgeGuard(bridgeGuardAddress);
        localDomain = chainDomain;
    }

    function setExecutorVault(address newExecutorVault) external onlyOwner {
        require(newExecutorVault != address(0), "ORCAOApp: invalid executor vault");
        executorVault = newExecutorVault;
    }

    function setBridgeGuard(address newGuard) external onlyOwner {
        require(newGuard != address(0), "ORCAOApp: invalid bridge guard");
        emit BridgeGuardUpdated(address(bridgeGuard), newGuard);
        bridgeGuard = LZBridgeGuard(newGuard);
    }

    function setTrustedRemote(uint32 domain, bytes32 remote) external onlyOwner {
        trustedRemotes[domain] = remote;
        emit TrustedRemoteSet(domain, remote);
    }

    function executeCrossChainRebalance(
        uint32 dstDomain,
        bytes32 destinationAdapter,
        address fromProtocol,
        address toProtocol,
        uint256 amount,
        bytes calldata hookMetadata
    ) external {
        if (msg.sender != executorVault) revert NotExecutorVault();
        if (trustedRemotes[dstDomain] == bytes32(0) || trustedRemotes[dstDomain] != destinationAdapter) {
            revert MissingTrustedRemote();
        }
        require(fromProtocol != address(0) && toProtocol != address(0), "ORCAOApp: invalid protocol");
        require(amount > 0, "ORCAOApp: invalid amount");

        bytes32 transferId = keccak256(
            abi.encodePacked(
                block.chainid,
                localDomain,
                msg.sender,
                dstDomain,
                destinationAdapter,
                fromProtocol,
                toProtocol,
                amount,
                keccak256(hookMetadata),
                block.timestamp
            )
        );
        bridgeGuard.requireApproval(transferId, amount);
        bytes memory payload =
            abi.encode(MESSAGE_VERSION, transferId, localDomain, fromProtocol, toProtocol, amount, block.timestamp);
        bytes32 dispatchId = mailbox.dispatch(dstDomain, destinationAdapter, payload);

        emit CrossChainRebalanceRequested(
            dstDomain, fromProtocol, toProtocol, amount, destinationAdapter, transferId, dispatchId, payload
        );
    }

    function handle(uint32 originDomain, bytes32 sender, bytes calldata payload) external payable {
        if (msg.sender != address(mailbox)) revert MailboxOnly();
        require(trustedRemotes[originDomain] == sender, "ORCAOApp: untrusted sender");

        (
            uint8 version,
            bytes32 transferId,
            uint32 sourceDomain,
            address fromProtocol,
            address toProtocol,
            uint256 amount,
            uint256 timestamp
        ) = abi.decode(payload, (uint8, bytes32, uint32, address, address, uint256, uint256));
        if (version != MESSAGE_VERSION) revert InvalidPayload();
        require(sourceDomain == originDomain, "ORCAOApp: origin mismatch");
        require(fromProtocol != address(0) && toProtocol != address(0), "ORCAOApp: invalid protocol");
        require(amount > 0 && timestamp > 0, "ORCAOApp: invalid payload");
        require(!executedPayloads[transferId], "ORCAOApp: payload already processed");

        executedPayloads[transferId] = true;
        emit CrossChainMessageReceived(transferId, originDomain, payload);
    }
}
