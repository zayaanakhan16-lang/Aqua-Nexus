"""File-backed persistence for saved study areas.

This is the smallest appropriate persistence mechanism for the current product:
study areas are user-authored labels and coordinates, they are few, and they do
not need spatial querying yet. A single JSON document under
``settings.data_dir`` is written atomically (temp file + replace) so a crash
cannot leave a truncated file, and an in-process lock serializes writers.

When the product grows to geographic queries or multi-user workspaces this store
should be replaced by a real database (PostGIS is the natural fit); the route
and service surface is deliberately small so that swap stays local.
"""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
import uuid
from pathlib import Path

from app.config import get_settings
from app.errors import NotFoundError, ValidationError
from app.logging_config import get_logger
from app.models.common import GeoPoint, PlaceResult, utcnow
from app.models.study_area import StudyArea

logger = get_logger(__name__)

_STORE_FILENAME = "study_areas.json"
_lock = asyncio.Lock()


def _store_path() -> Path:
    return Path(get_settings().data_dir) / _STORE_FILENAME


def _read_raw() -> list[dict]:
    path = _store_path()
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (json.JSONDecodeError, OSError) as exc:
        # A corrupt store must not take the API down; report and start empty so
        # the user can continue. The unreadable file is left on disk for triage.
        logger.warning("Study-area store unreadable (%s); starting empty.", exc)
        return []
    if isinstance(data, dict):
        data = data.get("study_areas", [])
    return data if isinstance(data, list) else []


def _write_raw(records: list[dict]) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Atomic replace so readers never observe a half-written file.
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"study_areas": records}, handle, indent=2, default=str)
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def _normalize_name(name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ValidationError("A study-area name is required.")
    if len(cleaned) > 120:
        raise ValidationError("Study-area name is too long (max 120 characters).")
    return cleaned


def _to_model(record: dict) -> StudyArea | None:
    try:
        return StudyArea.model_validate(record)
    except Exception:  # skip a malformed record rather than failing the list
        return None


def _load_all() -> list[StudyArea]:
    return [model for model in (_to_model(r) for r in _read_raw()) if model is not None]


async def list_study_areas() -> list[StudyArea]:
    async with _lock:
        areas = _load_all()
    # Most recently updated first — the natural "recent investigations" order.
    return sorted(areas, key=lambda a: a.updated_at, reverse=True)


async def get_study_area(study_area_id: str) -> StudyArea:
    async with _lock:
        for area in _load_all():
            if area.id == study_area_id:
                return area
    raise NotFoundError(f"No study area with id '{study_area_id}'.")


async def create_study_area(
    *,
    name: str,
    latitude: float,
    longitude: float,
    label: str | None = None,
    place: PlaceResult | None = None,
) -> StudyArea:
    cleaned = _normalize_name(name)
    area = StudyArea(
        id=uuid.uuid4().hex,
        name=cleaned,
        location=GeoPoint(latitude=latitude, longitude=longitude),
        label=label,
        place=place,
    )
    async with _lock:
        records = _read_raw()
        records.append(area.model_dump(mode="json"))
        _write_raw(records)
    logger.info("Created study area %s", area.id)
    return area


async def rename_study_area(study_area_id: str, name: str) -> StudyArea:
    cleaned = _normalize_name(name)
    async with _lock:
        records = _read_raw()
        for record in records:
            if record.get("id") == study_area_id:
                record["name"] = cleaned
                record["updated_at"] = utcnow().isoformat()
                _write_raw(records)
                model = _to_model(record)
                if model is None:
                    raise ValidationError("Stored study area is malformed.")
                return model
    raise NotFoundError(f"No study area with id '{study_area_id}'.")


async def delete_study_area(study_area_id: str) -> None:
    async with _lock:
        records = _read_raw()
        remaining = [r for r in records if r.get("id") != study_area_id]
        if len(remaining) == len(records):
            raise NotFoundError(f"No study area with id '{study_area_id}'.")
        _write_raw(remaining)
    logger.info("Deleted study area %s", study_area_id)
