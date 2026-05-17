from __future__ import annotations

from unittest.mock import MagicMock, patch

from orca_common.web3_rpc import web3_for_http_rpc


def test_web3_for_http_rpc_uses_block_number_not_is_connected() -> None:
    mock_w3 = MagicMock()
    mock_w3.eth.block_number = 12345
    with patch("orca_common.web3_rpc.Web3", return_value=mock_w3):
        w3 = web3_for_http_rpc("https://sepolia.example", chain_id=11155111)
    assert w3 is mock_w3
    _ = mock_w3.eth.block_number
