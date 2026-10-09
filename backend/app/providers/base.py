"""Shared HTTP client, retry policy, and a small in-process TTL cache.

The cache exists to avoid hammering public providers on every React render and
to respect provider terms. It is process-local and holds only public data; it
is never used for credentialed or restricted responses.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any, Mapping

import httpx

from app.config import Settings, get_settings
from app.errors import ProviderError, ProviderTimeoutError
from app.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class TTLCache:
    """A tiny thread-safe async TTL cache with a bounded entry count."""

    def __init__(self, ttl_seconds: int, max_entries: int) -> None:
        self._ttl = ttl_seconds
        self._max = max_entries
        self._store: dict[str, _CacheEntry] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _key(namespace: str, params: Mapping[str, Any]) -> str:
        blob = json.dumps(params, sort_keys=True, default=str)
        digest = hashlib.sha256(blob.encode()).hexdigest()[:24]
        return f"{namespace}:{digest}"

    async def get_or_set(self, namespace: str, params: Mapping[str, Any], factory) -> Any:
        key = self._key(namespace, params)
        async with self._lock:
            entry = self._store.get(key)
            if entry and entry.expires_at > time.monotonic():
                return entry.value
        # Compute outside the lock so a slow fetch does not block other keys.
        value = await factory()
        async with self._lock:
            if len(self._store) >= self._max:
                # Evict the soonest-to-expire entry.
                oldest = min(self._store, key=lambda k: self._store[k].expires_at)
                self._store.pop(oldest, None)
            self._store[key] = _CacheEntry(value, time.monotonic() + self._ttl)
        return value

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()


_cache: TTLCache | None = None
_client: httpx.AsyncClient | None = None


def get_cache() -> TTLCache:
    global _cache
    if _cache is None:
        settings = get_settings()
        _cache = TTLCache(settings.cache_ttl_seconds, settings.cache_max_entries)
    return _cache


def get_client() -> httpx.AsyncClient:
    """Return the shared HTTP client, creating it lazily."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.provider_timeout_seconds),
            headers={"User-Agent": settings.user_agent, "Accept": "application/json"},
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def request_json(
    url: str,
    *,
    params: Mapping[str, Any] | None = None,
    method: str = "GET",
    json_body: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
    provider_id: str = "unknown",
    settings: Settings | None = None,
    use_cache: bool = True,
) -> Any:
    """Fetch JSON from a provider with retries and normalized error handling.

    Raises ``ProviderTimeoutError`` / ``ProviderError`` rather than leaking the
    underlying httpx exception, so callers can render an honest failure state.
    """
    settings = settings or get_settings()
    cache = get_cache()
    cache_params = {"url": url, "params": params, "method": method, "body": json_body}

    async def _fetch() -> Any:
        client = get_client()
        last_exc: Exception | None = None
        for attempt in range(settings.provider_max_retries + 1):
            try:
                response = await client.request(
                    method, url, params=params, json=json_body, headers=headers
                )
                if response.status_code == 429:
                    # Respect a simple Retry-After when provided.
                    retry_after = float(response.headers.get("Retry-After", "1") or 1)
                    if attempt < settings.provider_max_retries:
                        await asyncio.sleep(min(retry_after, 5.0))
                        continue
                    raise ProviderError(
                        f"{provider_id} rate limited the request",
                        details={"provider": provider_id, "status": 429},
                    )
                if 500 <= response.status_code < 600 and attempt < settings.provider_max_retries:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                if response.status_code >= 400:
                    raise ProviderError(
                        f"{provider_id} returned HTTP {response.status_code}",
                        details={"provider": provider_id, "status": response.status_code},
                    )
                try:
                    return response.json()
                except ValueError as exc:  # invalid JSON
                    raise ProviderError(
                        f"{provider_id} returned a non-JSON response",
                        details={"provider": provider_id},
                    ) from exc
            except (httpx.TimeoutException,) as exc:
                last_exc = exc
                if attempt < settings.provider_max_retries:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                raise ProviderTimeoutError(
                    f"{provider_id} timed out", details={"provider": provider_id}
                ) from exc
            except (httpx.TransportError,) as exc:
                last_exc = exc
                if attempt < settings.provider_max_retries:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                raise ProviderError(
                    f"{provider_id} is unreachable", details={"provider": provider_id}
                ) from exc
        raise ProviderError(  # pragma: no cover - defensive
            f"{provider_id} failed after retries", details={"provider": provider_id}
        ) from last_exc

    if use_cache:
        return await cache.get_or_set(provider_id, cache_params, _fetch)
    return await _fetch()
