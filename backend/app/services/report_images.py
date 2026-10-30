"""Fetch real satellite previews for embedding in the report.

The report embeds the *provider's own* rendered preview of a scene, never a
generated or stock image. Previews are fetched with a short timeout and a size
ceiling; any failure drops that image so the report can still be produced.
"""
from __future__ import annotations

import asyncio

import httpx

from app.models.report import ReportImage

# Catalogue previews are small JPEG/PNG thumbnails; anything larger is not a
# preview and is skipped rather than embedded.
MAX_IMAGE_BYTES = 3_000_000
ALLOWED_CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp")
FETCH_TIMEOUT_SECONDS = 8.0
MAX_IMAGES = 2


def _looks_like_image(body: bytes, content_type: str) -> bool:
    """Detect an image by content type or magic bytes.

    Some catalogues serve previews as ``application/octet-stream``, so a strict
    content-type allowlist would silently drop valid imagery. The magic-byte
    check keeps the allowlist honest without trusting the header alone.
    """
    if content_type in ALLOWED_CONTENT_TYPES:
        return True
    if body[:3] == b"\xff\xd8\xff":
        return True
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP":
        return True
    return False


def _attribution_for(collection: str) -> str:
    lowered = collection.lower()
    if "sentinel-2" in lowered or "s2" in lowered:
        return "Contains modified Copernicus Sentinel data (ESA), rendered by the catalogue."
    if "landsat" in lowered or "hls" in lowered:
        return "NASA/USGS Landsat and ESA Sentinel-2 (HLS), rendered by the catalogue."
    return "Provider-rendered catalogue preview."


async def _fetch_one(client: httpx.AsyncClient, candidate: dict) -> tuple[dict, bytes, str] | None:
    url = candidate.get("url")
    if not url:
        return None
    try:
        response = await client.get(url)
        response.raise_for_status()
    except (httpx.HTTPError, OSError):
        return None
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    body = response.content
    if not body or len(body) > MAX_IMAGE_BYTES:
        return None
    if not _looks_like_image(body, content_type):
        return None
    return candidate, body, content_type


async def collect_report_images(candidates: list[dict]) -> tuple[list[ReportImage], dict[str, bytes]]:
    """Fetch preview bytes for up to ``MAX_IMAGES`` candidates.

    Returns the image metadata (for the payload) and the raw bytes keyed by URL
    (for the PDF renderer). A candidate that fails to fetch is simply absent from
    both, so the caller can still cite its URL in text.
    """
    usable = [c for c in candidates if c.get("url")][:MAX_IMAGES]
    if not usable:
        return [], {}

    images: list[ReportImage] = []
    blobs: dict[str, bytes] = {}
    async with httpx.AsyncClient(
        timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True, headers={"User-Agent": "AquaNexus/1.0"}
    ) as client:
        results = await asyncio.gather(*(_fetch_one(client, c) for c in usable))

    for result in results:
        if result is None:
            continue
        candidate, body, _content_type = result
        url = candidate["url"]
        blobs[url] = body
        images.append(
            ReportImage(
                title=candidate.get("title") or "Satellite preview",
                url=url,
                attribution=candidate.get("attribution") or _attribution_for(candidate.get("collection", "")),
                captured_at=candidate.get("captured_at"),
                resolution=candidate.get("resolution"),
                note=candidate.get("note"),
            )
        )
    return images, blobs
