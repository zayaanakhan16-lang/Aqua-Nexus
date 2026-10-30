"""Shared test fixtures.

External providers are always mocked so tests are deterministic and require no
live credentials or network access.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Ensure the backend package root is importable when running pytest from anywhere.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("AQUANEXUS_ENVIRONMENT", "development")
os.environ.setdefault("AQUANEXUS_CACHE_TTL_SECONDS", "1")


def pytest_collection_modifyitems(config, items):
    """Skip ``live`` tests unless ``--run-live`` is passed.

    The default suite stays deterministic and offline; the live tests exist to
    verify the real provider integration on demand.
    """
    if config.getoption("-k") or "--run-live" in config.invocation_params.args:
        return
    skip = pytest.mark.skip(reason="live provider test; pass --run-live to run")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)


def pytest_addoption(parser):
    parser.addoption(
        "--run-live", action="store_true", default=False, help="run live provider tests"
    )


@pytest.fixture(autouse=True)
def _reset_caches():
    """Clear process-wide caches so tests cannot leak state into each other."""
    from app.config import get_settings
    from app.providers import base

    get_settings.cache_clear()
    base._cache = None
    base._client = None
    yield
    get_settings.cache_clear()
    base._cache = None
    base._client = None
