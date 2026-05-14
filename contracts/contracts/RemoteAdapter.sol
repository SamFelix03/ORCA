// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./interfaces/IMailbox.sol";
import "./interfaces/IMessageRecipient.sol";

contract RemoteAdapter is Ownable, IMessageRecipient {
    IMailbox public immutable mailbox;
    mapping(uint32 => bytes32) public trustedSenders;
    mapping(bytes32 => bool) public processedMessageIds;
    bool private _locked;

    event TrustedSenderUpdated(uint32 indexed domain, bytes32 sender);
    event RemoteRebalanceExecuted(
        bytes32 indexed messageId,
        uint32 indexed sourceDomain,
        address indexed toProtocol,
        address fromProtocol,
        uint256 amountUsdc
    );

    constructor(address initialOwner, address mailboxAddress) Ownable(initialOwner) {
        require(mailboxAddress != address(0), "RemoteAdapter: invalid mailbox");
        mailbox = IMailbox(mailboxAddress);
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

    function handle(uint32 origin, bytes32 sender, bytes calldata body) external payable override nonReentrant {
        require(msg.sender == address(mailbox), "RemoteAdapter: mailbox only");
        require(trustedSenders[origin] == sender, "RemoteAdapter: untrusted sender");

        (
            uint8 version,
            bytes32 messageId,
            uint32 sourceDomain,
            address fromProtocol,
            address toProtocol,
            uint256 amountUsdc,
            uint256 timestamp
        ) = abi.decode(body, (uint8, bytes32, uint32, address, address, uint256, uint256));
        require(messageId != bytes32(0), "RemoteAdapter: invalid messageId");
        require(!processedMessageIds[messageId], "RemoteAdapter: message already processed");
        require(version == 1, "RemoteAdapter: unsupported payload version");
        require(sourceDomain == origin, "RemoteAdapter: origin mismatch");
        require(toProtocol != address(0), "RemoteAdapter: invalid target protocol");
        require(amountUsdc > 0, "RemoteAdapter: invalid amount");
        require(timestamp > 0, "RemoteAdapter: invalid timestamp");

        processedMessageIds[messageId] = true;
        emit RemoteRebalanceExecuted(messageId, sourceDomain, toProtocol, fromProtocol, amountUsdc);
    }
}
