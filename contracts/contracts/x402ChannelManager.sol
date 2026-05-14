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

    event ChannelOpened(bytes32 indexed channelId, bytes32 indexed fromDid, bytes32 indexed toDid, uint256 depositAmount);
    event ChannelUpdateAccepted(bytes32 indexed channelId, uint256 indexed nonce);
    event ChannelClosed(bytes32 indexed channelId, uint256 closedAt);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function openChannel(bytes32 channelId, bytes32 fromDid, bytes32 toDid, uint256 depositAmount) external onlyOwner {
        require(channelId != bytes32(0), "x402ChannelManager: invalid channelId");
        require(fromDid != bytes32(0) && toDid != bytes32(0), "x402ChannelManager: invalid did");
        require(depositAmount > 0, "x402ChannelManager: invalid deposit");
        require(channels[channelId].status == ChannelStatus.NONE, "x402ChannelManager: channel exists");

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

    function acceptStateUpdate(bytes32 channelId, uint256 newNonce) external onlyOwner {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.OPEN, "x402ChannelManager: channel not open");
        require(newNonce > channel.nonce, "x402ChannelManager: stale nonce");
        channel.nonce = newNonce;
        emit ChannelUpdateAccepted(channelId, newNonce);
    }

    function closeChannel(bytes32 channelId) external onlyOwner {
        Channel storage channel = channels[channelId];
        require(channel.status == ChannelStatus.OPEN, "x402ChannelManager: channel not open");
        channel.status = ChannelStatus.CLOSED;
        channel.closedAt = block.timestamp;
        emit ChannelClosed(channelId, channel.closedAt);
    }
}
