// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./LZBridgeGuard.sol";
import "./interfaces/IMailbox.sol";

contract ORCAOApp is Ownable {
    uint8 public constant MESSAGE_VERSION = 2;
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
    error InsufficientDispatchFee(uint256 required, uint256 received);

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

    /// @notice Hyperlane `Mailbox.quoteDispatch` for the payload this vault call would send (use current `block.timestamp`).
    function quoteCrossChainRebalanceDispatchFee(
        address vaultCaller,
        uint32 dstDomain,
        bytes32 destinationAdapter,
        address fromProtocol,
        address toProtocol,
        address beneficiary,
        uint256 amount,
        bytes calldata hookMetadata
    ) external view returns (uint256) {
        if (trustedRemotes[dstDomain] == bytes32(0) || trustedRemotes[dstDomain] != destinationAdapter) {
            revert MissingTrustedRemote();
        }
        require(fromProtocol != address(0) && toProtocol != address(0), "ORCAOApp: invalid protocol");
        require(beneficiary != address(0), "ORCAOApp: invalid beneficiary");
        require(amount > 0, "ORCAOApp: invalid amount");

        (, bytes memory payload) = _buildTransferAndPayload(
            vaultCaller, dstDomain, destinationAdapter, fromProtocol, toProtocol, beneficiary, amount, hookMetadata
        );
        return mailbox.quoteDispatch(dstDomain, destinationAdapter, payload);
    }

    function executeCrossChainRebalance(
        uint32 dstDomain,
        bytes32 destinationAdapter,
        address fromProtocol,
        address toProtocol,
        address beneficiary,
        uint256 amount,
        bytes calldata hookMetadata
    ) external payable {
        if (msg.sender != executorVault) revert NotExecutorVault();
        if (trustedRemotes[dstDomain] == bytes32(0) || trustedRemotes[dstDomain] != destinationAdapter) {
            revert MissingTrustedRemote();
        }
        require(fromProtocol != address(0) && toProtocol != address(0), "ORCAOApp: invalid protocol");
        require(beneficiary != address(0), "ORCAOApp: invalid beneficiary");
        require(amount > 0, "ORCAOApp: invalid amount");

        (bytes32 transferId, bytes memory payload) = _buildTransferAndPayload(
            msg.sender, dstDomain, destinationAdapter, fromProtocol, toProtocol, beneficiary, amount, hookMetadata
        );
        bridgeGuard.requireApproval(transferId, amount);
        uint256 fee = mailbox.quoteDispatch(dstDomain, destinationAdapter, payload);
        if (msg.value < fee) revert InsufficientDispatchFee(fee, msg.value);
        bytes32 dispatchId = mailbox.dispatch{value: fee}(dstDomain, destinationAdapter, payload);

        uint256 refund = msg.value - fee;
        if (refund > 0) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            require(ok, "ORCAOApp: refund failed");
        }

        emit CrossChainRebalanceRequested(
            dstDomain, fromProtocol, toProtocol, amount, destinationAdapter, transferId, dispatchId, payload
        );
    }

    function _buildTransferAndPayload(
        address vaultCaller,
        uint32 dstDomain,
        bytes32 destinationAdapter,
        address fromProtocol,
        address toProtocol,
        address beneficiary,
        uint256 amount,
        bytes calldata hookMetadata
    ) internal view returns (bytes32 transferId, bytes memory payload) {
        transferId = keccak256(
            abi.encodePacked(
                block.chainid,
                localDomain,
                vaultCaller,
                dstDomain,
                destinationAdapter,
                fromProtocol,
                toProtocol,
                beneficiary,
                amount,
                keccak256(hookMetadata),
                block.timestamp
            )
        );
        payload = abi.encode(
            MESSAGE_VERSION, transferId, localDomain, fromProtocol, toProtocol, beneficiary, amount, block.timestamp
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
            address beneficiary,
            uint256 amount,
            uint256 timestamp
        ) = abi.decode(payload, (uint8, bytes32, uint32, address, address, address, uint256, uint256));
        if (version != MESSAGE_VERSION) revert InvalidPayload();
        require(sourceDomain == originDomain, "ORCAOApp: origin mismatch");
        require(
            fromProtocol != address(0) && toProtocol != address(0) && beneficiary != address(0), "ORCAOApp: invalid protocol"
        );
        require(amount > 0 && timestamp > 0, "ORCAOApp: invalid payload");
        require(!executedPayloads[transferId], "ORCAOApp: payload already processed");

        executedPayloads[transferId] = true;
        emit CrossChainMessageReceived(transferId, originDomain, payload);
    }
}
