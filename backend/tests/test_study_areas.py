"""Study-area persistence and CRUD API tests.

The store is file-backed, so each test points ``AQUANEXUS_DATA_DIR`` at a fresh
temporary directory and clears the settings singleton, guaranteeing isolation.
"""
from __future__ import annotations

import httpx
import pytest


@pytest.fixture
async def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AQUANEXUS_DATA_DIR", str(tmp_path))
    from app.config import get_settings

    get_settings.cache_clear()

    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    get_settings.cache_clear()


async def test_study_areas_start_empty(client):
    r = await client.get("/api/v1/study-areas")
    assert r.status_code == 200
    assert r.json() == {"count": 0, "study_areas": []}


async def test_create_then_list_and_fetch(client):
    payload = {
        "name": "Lagos Lagoon",
        "latitude": 6.45,
        "longitude": 3.39,
        "label": "Lagos, Nigeria",
        "place": {
            "id": "1",
            "name": "Lagos",
            "display_name": "Lagos, Nigeria",
            "latitude": 6.45,
            "longitude": 3.39,
            "source_id": "open_meteo_geocoding",
        },
    }
    created = await client.post("/api/v1/study-areas", json=payload)
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Lagos Lagoon"
    assert body["location"] == {"latitude": 6.45, "longitude": 3.39}
    assert body["place"]["name"] == "Lagos"
    area_id = body["id"]

    listed = await client.get("/api/v1/study-areas")
    assert listed.json()["count"] == 1

    fetched = await client.get(f"/api/v1/study-areas/{area_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == area_id


async def test_create_rejects_blank_name(client):
    r = await client.post(
        "/api/v1/study-areas",
        json={"name": "   ", "latitude": 1.0, "longitude": 2.0},
    )
    assert r.status_code == 422


async def test_create_rejects_out_of_range_coordinates(client):
    r = await client.post(
        "/api/v1/study-areas",
        json={"name": "Nowhere", "latitude": 120.0, "longitude": 2.0},
    )
    assert r.status_code == 422


async def test_rename_study_area(client):
    created = await client.post(
        "/api/v1/study-areas",
        json={"name": "Old name", "latitude": 10.0, "longitude": 20.0},
    )
    area_id = created.json()["id"]
    renamed = await client.patch(
        f"/api/v1/study-areas/{area_id}", json={"name": "New name"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "New name"
    # Renaming must not move the location.
    assert renamed.json()["location"] == {"latitude": 10.0, "longitude": 20.0}


async def test_delete_study_area(client):
    created = await client.post(
        "/api/v1/study-areas",
        json={"name": "Temporary", "latitude": 1.0, "longitude": 2.0},
    )
    area_id = created.json()["id"]
    deleted = await client.delete(f"/api/v1/study-areas/{area_id}")
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/study-areas/{area_id}")).status_code == 404
    assert (await client.get("/api/v1/study-areas")).json()["count"] == 0


async def test_unknown_study_area_is_404(client):
    assert (await client.get("/api/v1/study-areas/nope")).status_code == 404


async def test_study_areas_persist_across_reads(client):
    # Two separate create calls must both survive; the store is a document, not
    # in-memory component state.
    await client.post(
        "/api/v1/study-areas", json={"name": "A", "latitude": 1.0, "longitude": 1.0}
    )
    await client.post(
        "/api/v1/study-areas", json={"name": "B", "latitude": 2.0, "longitude": 2.0}
    )
    r = await client.get("/api/v1/study-areas")
    names = {a["name"] for a in r.json()["study_areas"]}
    assert names == {"A", "B"}
