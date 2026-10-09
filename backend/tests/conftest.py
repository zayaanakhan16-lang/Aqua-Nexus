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
