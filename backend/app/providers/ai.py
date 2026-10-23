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
import re
from typing import Any

import httpx

from app.config import get_settings
from app.errors import ProviderError, ProviderUnconfiguredError
from app.logging_config import get_logger

logger = get_logger(__name__)

PROVIDER_ID = "ai_analysis"

# Reasoning models (Qwen 3, and others that expose a chain of thought) may emit
# a `` thinking…</think>`` block before the answer. It is stripped before JSON
# parsing so a valid object inside the answer is still found.
_THINK_BLOCK = re.compile(r"<think\b[^>]*>.*?</think>", re.DOTALL | re.IGNORECASE)


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


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Parse the first JSON object in ``text``, ignoring any surrounding prose.

    Returns ``None`` when no object can be parsed. This stops a reasoning model's
    preamble — or an answer wrapped in a Markdown code fence — from turning a
    valid response into a hard failure.
    """
    if not text:
        return None
    candidate = _THINK_BLOCK.sub("", text).strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*\s*", "", candidate)
        candidate = re.sub(r"\s*```$", "", candidate).strip()
    try:
        parsed = json.loads(candidate)
    except (TypeError, ValueError):
        parsed = None
    if isinstance(parsed, dict):
        return parsed
    # Fall back to the first balanced ``{…}`` span, ignoring braces inside strings.
    start = candidate.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escaped = False
        for idx in range(start, len(candidate)):
            ch = candidate[idx]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        parsed = json.loads(candidate[start : idx + 1])
                    except (TypeError, ValueError):
                        parsed = None
                    if isinstance(parsed, dict):
                        return parsed
                    break
        start = candidate.find("{", start + 1)
    return None


def _looks_like_model_error(status_code: int, body: str) -> bool:
    """Whether a 400 response is about the model id rather than the request."""
    if status_code != 400:
        return False
    lowered = (body or "").lower()
    if "model" not in lowered:
        return False
    return any(
        token in lowered
        for token in (
            "does not exist",
            "not found",
            "decommissioned",
            "no longer",
            "unknown model",
            "invalid model",
            "unsupported model",
        )
    )


def _looks_like_response_format_error(status_code: int, body: str) -> bool:
    """Whether a 400 response means JSON-object mode is unsupported."""
    if status_code != 400:
        return False
    lowered = (body or "").lower()
    return "response_format" in lowered or "json_object" in lowered


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

    def _build_body(*, json_mode: bool) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": model,
            "temperature": 0.2,
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
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        return body

    async def _post(json_mode: bool) -> httpx.Response:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.ai_timeout_seconds)
        ) as client:
            return await client.post(
                _endpoint(base_url),
                headers={
                    "Authorization": f"Bearer {credential}",
                    "Content-Type": "application/json",
                },
                json=_build_body(json_mode=json_mode),
            )

    try:
        response = await _post(json_mode=True)
        # Some models (notably a few reasoning models) reject JSON-object mode.
        # Retry once without it rather than failing the whole analysis; the
        # system prompt still demands a single JSON object and the parser is
        # tolerant of surrounding prose.
        if _looks_like_response_format_error(response.status_code, response.text):
            logger.info("AI model %s rejected json_object mode; retrying without it", model)
            response = await _post(json_mode=False)
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
    if _looks_like_model_error(response.status_code, response.text):
        # Actionable without echoing the upstream body: the model id is
        # deployment configuration, not a secret.
        raise ProviderError(
            f"The AI provider does not recognise the configured model '{model}'. "
            "Set GROQ_MODEL to a currently supported model id (for example "
            "'openai/gpt-oss-120b') and restart the backend.",
            details={"provider": PROVIDER_ID, "status": 400, "model": model},
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
    parsed = _extract_json_object(content)
    if parsed is None:
        raise ProviderError(
            "The AI provider did not return valid JSON.",
            details={"provider": PROVIDER_ID},
        )
    return parsed
