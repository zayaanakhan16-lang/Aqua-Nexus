"""Regression tests for environment-file resolution and the Groq default.

These pin two behaviours that were wrong or under-specified:

* the backend resolves ``.env`` files relative to the package, not the current
  working directory, so a server-side secret in ``backend/.env`` (or a
  repository-root ``.env``/``.env.local``) is loaded regardless of where uvicorn
  was started, and a real environment variable always wins;
* the default ``GROQ_MODEL`` names a model Groq currently serves, so a fresh
  deployment does not ship a retired model id.
"""
from __future__ import annotations

from pathlib import Path

from app.config import Settings, get_settings

# A model id that Groq has retired must never be the shipped default.
RETIRED_GROQ_MODELS = {"qwen/qwen3-32b", "llama-3.3-70b-versatile"}


def test_default_groq_model_is_not_a_retired_id(monkeypatch):
    # Groq retired qwen/qwen3-32b (2026-07-17); llama-3.3-70b-versatile is
    # Enterprise-only. Shipping either as the default would 400 on a
    # developer-plan key.
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    monkeypatch.delenv("AQUANEXUS_GROQ_MODEL", raising=False)
    default = Settings(_env_file=None).groq_model
    assert default == "openai/gpt-oss-120b"
    assert default not in RETIRED_GROQ_MODELS


def test_env_file_paths_are_absolute_and_include_backend_env():
    # Relative paths would only resolve from backend/, silently loading nothing
    # when uvicorn is started from the repository root.
    files = [Path(p) for p in Settings.model_config["env_file"]]
    assert files, "expected at least one env_file entry"
    assert all(p.is_absolute() for p in files)
    assert files[-1].name == ".env" and files[-1].parent.name == "backend"


def test_groq_credential_loads_from_a_dotenv_file(tmp_path, monkeypatch):
    # Simulates the real deployment: the key lives in a file, not the process
    # environment. `validation_alias` must let the unprefixed GROQ_API_KEY
    # through despite the AQUANEXUS_ env_prefix.
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("AQUANEXUS_GROQ_API_KEY", raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "GROQ_API_KEY=gsk-from-file\nGROQ_MODEL=openai/gpt-oss-120b\n",
        encoding="utf-8",
    )
    settings = Settings(_env_file=env)
    assert settings.groq_api_key == "gsk-from-file"
    assert settings.resolved_ai_provider() == (
        "groq",
        "https://api.groq.com/openai/v1",
        "openai/gpt-oss-120b",
    )


def test_real_environment_variable_wins_over_dotenv_file(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("GROQ_API_KEY=gsk-from-file\n", encoding="utf-8")
    monkeypatch.setenv("GROQ_API_KEY", "gsk-from-env")
    assert Settings(_env_file=env).groq_api_key == "gsk-from-env"


def test_settings_cache_returns_one_instance():
    # get_settings() is cached for the process; tests clear it via conftest.
    assert get_settings() is get_settings()
