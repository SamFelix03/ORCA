// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Ownable.sol";
import "./interfaces/ILayerZeroEndpointV2.sol";

contract ORCAOApp is Ownable {
    ILayerZeroEndpointV2 public immutable endpoint;
    address public executorVault;
    uint256 public bridgeGuardLimitUsdc;

    mapping(uint32 => bytes32) public trustedPeers;

    event TrustedPeerSet(uint32 indexed dstEid, bytes32 peer);
    event CrossChainRebalanceRequested(
        uint32 indexed dstEid,
        address indexed fromProtocol,
        address indexed toProtocol,
        uint256 amount,
        bytes options
    );

    error NotExecutorVault();
    error UnsupportedDestination();
    error MissingTrustedPeer();

    constructor(address initialOwner, address endpointV2, address initialExecutorVault, uint256 guardLimitUsdc)
        Ownable(initialOwner)
    {
        endpoint = ILayerZeroEndpointV2(endpointV2);
        executorVault = initialExecutorVault;
        bridgeGuardLimitUsdc = guardLimitUsdc;
    }

    function setExecutorVault(address newExecutorVault) external onlyOwner {
        require(newExecutorVault != address(0), "ORCAOApp: invalid executor vault");
        executorVault = newExecutorVault;
    }

    function setBridgeGuardLimitUsdc(uint256 newLimit) external onlyOwner {
        bridgeGuardLimitUsdc = newLimit;
    }

    function setTrustedPeer(uint32 dstEid, bytes32 peer) external onlyOwner {
        trustedPeers[dstEid] = peer;
        emit TrustedPeerSet(dstEid, peer);
    }

    function executeCrossChainRebalance(
        uint32 dstEid,
        address fromProtocol,
        address toProtocol,
        uint256 amount,
        bytes calldata options
    ) external {
        if (msg.sender != executorVault) revert NotExecutorVault();
        if (!endpoint.isSupportedEid(dstEid)) revert UnsupportedDestination();
        if (trustedPeers[dstEid] == bytes32(0)) revert MissingTrustedPeer();

        emit CrossChainRebalanceRequested(dstEid, fromProtocol, toProtocol, amount, options);
    }
}
