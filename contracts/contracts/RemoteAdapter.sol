// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IMailbox.sol";
import "./interfaces/IMessageRecipient.sol";
import "./interfaces/IInterchainSecurityModule.sol";

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IOrcaStubYieldVault {
    function depositFor(address beneficiary, uint256 amount) external;
}

contract RemoteAdapter is Ownable, IMessageRecipient {
    uint8 public constant PAYLOAD_VERSION = 2;

    IMailbox public immutable mailbox;
    /// @notice Bridged / local stablecoin on this chain (same token the stub vault uses as `usdt`).
    /// Beneficiary must `approve` this adapter for `collateralToken` before `handle` can pull and `depositFor`.
    address public immutable collateralToken;
    /// @notice Per-recipient ISM override for Hyperlane delivery (e.g. NoopISM on testnet).
    address public ism;
    mapping(uint32 => bytes32) public trustedSenders;
    mapping(bytes32 => bool) public processedMessageIds;
    bool private _locked;

    event TrustedSenderUpdated(uint32 indexed domain, bytes32 sender);
    event IsmUpdated(address indexed previousIsm, address indexed newIsm);
    event RemoteRebalanceExecuted(
        bytes32 indexed messageId,
        uint32 indexed sourceDomain,
        address indexed toProtocol,
        address fromProtocol,
        address beneficiary,
        uint256 amountUsdc
    );

    constructor(address initialOwner, address mailboxAddress, address collateralToken_) Ownable(initialOwner) {
        require(mailboxAddress != address(0), "RemoteAdapter: invalid mailbox");
        require(collateralToken_ != address(0), "RemoteAdapter: invalid collateral");
        mailbox = IMailbox(mailboxAddress);
        collateralToken = collateralToken_;
    }

    modifier nonReentrant() {
        require(!_locked, "RemoteAdapter: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    function setTrustedSender(uint32 domain, bytes32 sender) external onlyOwner {
        require(sender != bytes32(0), "RemoteAdapter: invalid sender");
        trustedSenders[domain] = sender;
        emit TrustedSenderUpdated(domain, sender);
    }

    function setIsm(address ism_) external onlyOwner {
        require(ism_ != address(0), "RemoteAdapter: invalid ism");
        emit IsmUpdated(ism, ism_);
        ism = ism_;
    }

    function interchainSecurityModule() external view returns (address) {
        return ism;
    }

    function handle(uint32 origin, bytes32 sender, bytes calldata body) external payable override nonReentrant {
        require(msg.sender == address(mailbox), "RemoteAdapter: mailbox only");
        require(trustedSenders[origin] == sender, "RemoteAdapter: untrusted sender");

        (
            uint8 version,
            bytes32 messageId,
            uint32 sourceDomain,
            address fromProtocol,
            address toProtocol,
            address beneficiary,
            uint256 amountUsdc,
            uint256 timestamp
        ) = abi.decode(body, (uint8, bytes32, uint32, address, address, address, uint256, uint256));
        require(messageId != bytes32(0), "RemoteAdapter: invalid messageId");
        require(!processedMessageIds[messageId], "RemoteAdapter: message already processed");
        require(version == PAYLOAD_VERSION, "RemoteAdapter: unsupported payload version");
        require(sourceDomain == origin, "RemoteAdapter: origin mismatch");
        require(toProtocol != address(0), "RemoteAdapter: invalid target protocol");
        require(beneficiary != address(0), "RemoteAdapter: invalid beneficiary");
        require(amountUsdc > 0, "RemoteAdapter: invalid amount");
        require(timestamp > 0, "RemoteAdapter: invalid timestamp");

        processedMessageIds[messageId] = true;

        require(
            IERC20(collateralToken).transferFrom(beneficiary, address(this), amountUsdc),
            "RemoteAdapter: pull beneficiary"
        );

        require(IERC20Approve(collateralToken).approve(toProtocol, amountUsdc), "RemoteAdapter: approve");
        IOrcaStubYieldVault(toProtocol).depositFor(beneficiary, amountUsdc);

        emit RemoteRebalanceExecuted(messageId, sourceDomain, toProtocol, fromProtocol, beneficiary, amountUsdc);
    }
}
