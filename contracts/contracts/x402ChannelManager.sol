// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";

contract x402ChannelManager is Ownable {
    enum ChannelStatus {
        NONE,
        OPEN,
        CLOSED
    }

    struct Channel {
        bytes32 channelId;
        bytes32 fromDid;
        bytes32 toDid;
        uint256 depositAmount;
        uint256 nonce;
        uint256 openedAt;
        uint256 closedAt;
        ChannelStatus status;
    }

    mapping(bytes32 => Channel) public channels;
    mapping(bytes32 => address) public didSigner;

    event ChannelOpened(bytes32 indexed channelId, bytes32 indexed fromDid, bytes32 indexed toDid, uint256 depositAmount);
    event ChannelUpdateAccepted(bytes32 indexed channelId, uint256 indexed nonce);
    event ChannelClosed(bytes32 indexed channelId, uint256 closedAt);
    event DidSignerSet(bytes32 indexed did, address signer);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setDidSigner(bytes32 did, address signer) external onlyOwner {
        require(did != bytes32(0), "x402ChannelManager: invalid did");
        require(signer != address(0), "x402ChannelManager: invalid signer");
        didSigner[did] = signer;
        emit DidSignerSet(did, signer);
    }

    function openChannel(bytes32 channelId, bytes32 fromDid, bytes32 toDid, uint256 depositAmount) external {
        require(channelId != bytes32(0), "x402ChannelManager: invalid channelId");
        require(fromDid != bytes32(0) && toDid != bytes32(0), "x402ChannelManager: invalid did");
        require(depositAmount > 0, "x402ChannelManager: invalid deposit");
        require(channels[channelId].status == ChannelStatus.NONE, "x402ChannelManager: channel exists");
        require(
            msg.sender == owner || msg.sender == didSigner[fromDid] || msg.sender == didSigner[toDid],
            "x402ChannelManager: unauthorized opener"
        );

        channels[channelId] = Channel({
            channelId: channelId,
            fromDid: fromDid,
            toDid: toDid,
            depositAmount: depositAmount,
            nonce: 0,
            openedAt: block.timestamp,
            closedAt: 0,
            status: ChannelStatus.OPEN
        });

        emit ChannelOpened(channelId, fromDid, toDid, depositAmount);
    }

    function acceptStateUpdate(bytes32 channelId, uint256 newNonce) external {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.OPEN, "x402ChannelManager: channel not open");
        require(newNonce > channel.nonce, "x402ChannelManager: stale nonce");
        require(
            msg.sender == owner || msg.sender == didSigner[channel.fromDid] || msg.sender == didSigner[channel.toDid],
            "x402ChannelManager: unauthorized updater"
        );
        channel.nonce = newNonce;
        emit ChannelUpdateAccepted(channelId, newNonce);
    }

    function closeChannel(bytes32 channelId) external {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.OPEN, "x402ChannelManager: channel not open");
        require(
            msg.sender == owner || msg.sender == didSigner[channel.fromDid] || msg.sender == didSigner[channel.toDid],
            "x402ChannelManager: unauthorized closer"
        );
        channel.status = ChannelStatus.CLOSED;
        channel.closedAt = block.timestamp;
        emit ChannelClosed(channelId, channel.closedAt);
    }
}
