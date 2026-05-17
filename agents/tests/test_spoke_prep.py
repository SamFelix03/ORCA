from __future__ import annotations

import pytest
from eth_account import Account
from web3 import Web3

from orca_executor import spoke_prep

_OAPP = Web3().eth.contract(address=Web3.to_checksum_address("0x" + "1" * 40), abi=spoke_prep._OAPP_REBALANCE_ABI)


def test_decode_cross_chain_beneficiary() -> None:
    beneficiary = Account.create().address
    calldata = _OAPP.encode_abi(
        "executeCrossChainRebalance",
        args=[11155111, "0x" + "00" * 32, Web3.to_checksum_address("0x" + "2" * 40), Web3.to_checksum_address("0x" + "3" * 40), beneficiary, 10_000, b""],
    )
    decoded = spoke_prep.decode_cross_chain_beneficiary(calldata)
    assert decoded is not None
    assert decoded.lower() == beneficiary.lower()


def test_assert_spoke_beneficiary_rejects_vault() -> None:
    signer = Account.create().address
    vault = Account.create().address
    with pytest.raises(RuntimeError, match="SCOUT_CROSS_CHAIN_BENEFICIARY"):
        spoke_prep.assert_spoke_beneficiary_can_approve(
            beneficiary=vault,
            signer_address=signer,
            vault_address=vault,
            logger=__import__("logging").getLogger("test"),
        )
