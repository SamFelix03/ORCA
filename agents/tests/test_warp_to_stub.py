from __future__ import annotations

import pytest

from orca_executor import spoke_prep


def test_resolve_destination_stub_address() -> None:
    addr = spoke_prep.resolve_destination_stub_address("0x649b4D29aCd10eaBCF10d94f40405c36e8158C27")
    assert addr.lower() == "0x649b4d29acd10eabcf10d94f40405c36e8158c27"


def test_resolve_destination_stub_address_rejects_invalid() -> None:
    with pytest.raises(ValueError):
        spoke_prep.resolve_destination_stub_address("not-an-address")
