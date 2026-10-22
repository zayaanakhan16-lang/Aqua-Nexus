"""AI analysis provider (Groq, with an OpenAI-compatible fallback).

AquaNexus uses an optional, deployment-configured language model to explain the
evidence it has already assembled. Groq is the preferred provider and is reached
through its OpenAI-compatible chat-completions endpoint; any other
OpenAI-compatible endpoint is used only when no Groq credential is present. The
provider is deliberately narrow:

* It only ever sends a **grounded evidence package** built from real provider
  responses (see ``app.services.ai_analysis``). The model is instructed to treat
  that package as its sole source of fact.
* The API key is read from settings and used server-side only; it is never
  logged and never reaches the browser.
* With no key configured the caller receives an explicit
  ``ProviderUnconfiguredError`` rather than a fabricated report.

The transport is a plain JSON POST so the integration works without adding a
vendor SDK dependency.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import get_settings
from app.errors import ProviderError, ProviderUnconfiguredError
from app.logging_config import get_logger

logger = get_logger(__name__)

PROVIDER_ID = "ai_analysis"


def provider_name() -> str:
    """Human-readable name of the resolved AI provider.

    Resolved at call time so the reported name always matches the credential
    actually in use, rather than a name fixed at import.
    """
    resolved = get_settings().resolved_ai_provider()
    if resolved is None:
        return "AI analysis (unconfigured)"
    return "Groq" if resolved[0] == "groq" else "AI analysis (OpenAI-compatible)"


# Retained for callers that want a stable identifier; prefer ``provider_name()``
# when reporting which provider actually answered.
PROVIDER_NAME = "AI analysis"


def is_configured() -> bool:
    return get_settings().resolved_ai_provider() is not None


def _endpoint(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


async def complete_json(
    *,
    system_prompt: str,
    user_payload: dict[str, Any],
    schema_hint: dict[str, Any],
) -> dict[str, Any]:
    """Request a single JSON object from the resolved model.

    Returns the parsed JSON object. Raises ``ProviderUnconfiguredError`` when no
    credential is set and ``ProviderError`` for any transport/format failure, so
    the caller can render an honest state without inventing a report.
    """
    settings = get_settings()
    resolved = settings.resolved_ai_provider()
    credential = settings.ai_credential()
    if resolved is None or not credential:
        raise ProviderUnconfiguredError(
            "AI analysis is not configured for this deployment.",
            details={"provider": PROVIDER_ID},
        )
    _, base_url, model = resolved

    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "Evidence package (JSON):\n"
                    + json.dumps(user_payload, ensure_ascii=False)
                    + "\n\nReturn a single JSON object with this shape:\n"
                    + json.dumps(schema_hint, ensure_ascii=False)
                ),
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.ai_timeout_seconds)) as client:
            response = await client.post(
                _endpoint(base_url),
                headers={
                    "Authorization": f"Bearer {credential}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
    except httpx.TimeoutException as exc:
        raise ProviderError(
            "The AI provider timed out.", details={"provider": PROVIDER_ID}
        ) from exc
    except httpx.TransportError as exc:
        raise ProviderError(
            "The AI provider is unreachable.", details={"provider": PROVIDER_ID}
        ) from exc

    if response.status_code in (401, 403):
        raise ProviderUnconfiguredError(
            "The AI provider rejected the configured credential.",
            details={"provider": PROVIDER_ID},
        )
    if response.status_code == 429:
        raise ProviderError(
            "The AI provider rate-limited this request.",
            details={"provider": PROVIDER_ID, "status": 429},
        )
    if response.status_code >= 400:
        # Never surface the raw upstream body (it can echo request content).
        raise ProviderError(
            f"The AI provider returned HTTP {response.status_code}.",
            details={"provider": PROVIDER_ID, "status": response.status_code},
        )

    try:
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ProviderError(
            "The AI provider returned an unexpected response shape.",
            details={"provider": PROVIDER_ID},
        ) from exc

    if isinstance(content, list):
        # Some providers return content as a list of parts.
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    try:
        parsed = json.loads(content)
    except (TypeError, ValueError) as exc:
        raise ProviderError(
            "The AI provider did not return valid JSON.",
            details={"provider": PROVIDER_ID},
        ) from exc
    if not isinstance(parsed, dict):
        raise ProviderError(
            "The AI provider did not return a JSON object.",
            details={"provider": PROVIDER_ID},
        )
    return parsed
