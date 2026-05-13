// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILayerZeroEndpointV2 {
    function isSupportedEid(uint32 eid) external view returns (bool);
}
