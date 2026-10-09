"""GES DISC temporary S3 credentials (AWS STS), memory-only and auto-refreshing.

Per the official documentation
(https://data.gesdisc.earthdata.nasa.gov/s3credentialsREADME) the
``/s3credentials`` endpoint dispenses short-lived credentials that are **valid
for 1 hour** (an AWS role-chaining limit). This module performs the Earthdata
Login OAuth exchange server-side, caches the credential bundle in memory, and
refreshes it proactively before it expires.

Security notes
--------------
* Username/password and the returned keys are secrets; they are never logged and
  never returned to the browser.
* The bundle is held only in process memory. The public TTL cache in
  ``providers/base.py`` is deliberately NOT used for credentialed responses.
"""
from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from app.config import Settings, get_settings
from app.errors import ProviderUnconfiguredError, ProviderError
from app.logging_config import get_logger

logger = get_logger(__name__)

# Refresh this long before the real expiry to avoid using a credential that
# lapses mid-request.
REFRESH_MARGIN = timedelta(minutes=5)


@dataclass(frozen=True)
class S3Credentials:
    access_key_id: str
    secret_access_key: str
    session_token: str
    expiration: datetime

    def is_valid(self, *, now: datetime | None = None) -> bool:
        now = now or datetime.now(tz=timezone.utc)
        return self.expiration - REFRESH_MARGIN > now


def _parse_expiration(raw: object) -> datetime:
    """Parse the ISO-8601 ``expiration`` from the STS payload."""
    if not isinstance(raw, str):
        raise ProviderError("GES DISC credentials response had no expiration.")
    text = raw.strip().replace(" ", "T")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProviderError("GES DISC credentials expiration was unparseable.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


_bundle: S3Credentials | None = None
_lock = asyncio.Lock()


def reset_cache() -> None:
    """Drop the cached credential bundle (used by tests)."""
    global _bundle
    _bundle = None


async def _exchange(settings: Settings) -> S3Credentials:
    """Perform the Earthdata OAuth exchange and return a fresh credential bundle."""
    endpoint = settings.gesdisc_s3credentials_url
    timeout = httpx.Timeout(settings.provider_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        # Step 1: hit the endpoint to obtain the EDL authorize redirect.
        login = await client.get(endpoint, headers={"Accept": "application/json"})
        location = login.headers.get("location")
        if login.status_code not in (301, 302, 303, 307, 308) or not location:
            raise ProviderError(
                "GES DISC credentials endpoint did not return an EDL redirect.",
                details={"status": login.status_code},
            )

        # Step 2: post base64(user:pass) to EDL to obtain an authorization code.
        encoded = base64.b64encode(
            f"{settings.earthdata_username}:{settings.earthdata_password}".encode("ascii")
        ).decode("ascii")
        grant = await client.post(
            location,
            data={"credentials": encoded},
            headers={"Origin": endpoint},
        )
        redirect = grant.headers.get("location")
        if not redirect:
            raise ProviderError(
                "Earthdata Login rejected the credential exchange.",
                details={"status": grant.status_code},
            )

        # Step 3: follow the redirect to receive the accessToken cookie.
        final = await client.get(redirect)
        token = final.cookies.get("accessToken")
        if not token:
            raise ProviderError("Earthdata Login did not return an access token.")

        # Step 4: call the endpoint again, authenticated, to get STS keys.
        result = await client.get(endpoint, cookies={"accessToken": token})

    result.raise_for_status()
    payload = result.json()

    access_key_id = payload.get("accessKeyId")
    secret_access_key = payload.get("secretAccessKey")
    session_token = payload.get("sessionToken")
    if not (access_key_id and secret_access_key and session_token):
        raise ProviderError("GES DISC credentials response was missing key fields.")

    bundle = S3Credentials(
        access_key_id=str(access_key_id),
        secret_access_key=str(secret_access_key),
        session_token=str(session_token),
        expiration=_parse_expiration(payload.get("expiration")),
    )
    logger.info(
        "Obtained GES DISC S3 credentials (valid until %s UTC)",
        bundle.expiration.isoformat(),
    )
    return bundle


async def get_s3_credentials(*, now: datetime | None = None) -> S3Credentials:
    """Return a valid credential bundle, refreshing it when near expiry.

    Single-flight: concurrent callers share one refresh rather than each
    performing the OAuth exchange.
    """
    settings = get_settings()
    if not (settings.earthdata_username and settings.earthdata_password):
        raise ProviderUnconfiguredError(
            "NASA Earthdata username/password are not configured; GPM IMERG "
            "access is unavailable.",
            details={"provider": "nasa_imerg"},
        )

    global _bundle
    if _bundle is not None and _bundle.is_valid(now=now):
        return _bundle

    async with _lock:
        # Re-check after acquiring the lock (another caller may have refreshed).
        if _bundle is not None and _bundle.is_valid(now=now):
            return _bundle
        _bundle = await _exchange(settings)
        return _bundle
