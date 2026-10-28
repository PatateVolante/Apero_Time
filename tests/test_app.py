from datetime import datetime, timezone
from zoneinfo import ZoneInfo, available_timezones

import pytest

import app as apero
from cities import CITIES


@pytest.fixture
def client():
    apero.app.config["TESTING"] = True
    return apero.app.test_client()


def test_all_city_timezones_exist():
    tzs = available_timezones()
    assert all(c["timezone"] in tzs for c in CITIES)


def test_cities_data_is_sane():
    for c in CITIES:
        assert -90 <= c["lat"] <= 90 and -180 <= c["lon"] <= 180, c["city"]
        assert c["drink"]["name"] and c["drink"]["emoji"], c["city"]
        assert len(c["country_code"]) == 2, c["city"]


def test_status_before_apero():
    now = datetime(2026, 10, 28, 14, 30, tzinfo=timezone.utc)  # 15:30 à Paris
    s = apero.apero_status(now, ZoneInfo("Europe/Paris"), 18)
    assert not s["is_apero_time"]
    assert s["seconds_until"] == 2 * 3600 + 30 * 60


def test_status_during_apero():
    now = datetime(2026, 10, 28, 18, 0, tzinfo=timezone.utc)  # 19:00 à Paris
    s = apero.apero_status(now, ZoneInfo("Europe/Paris"), 18)
    assert s["is_apero_time"] and s["seconds_until"] == 0


def test_status_across_dst_change():
    # 25/10/2026 : passage à l'heure d'hiver à Paris (journée de 25 h)
    now = datetime(2026, 10, 24, 22, 30, tzinfo=timezone.utc)  # 00:30 le 25 à Paris (UTC+2)
    s = apero.apero_status(now, ZoneInfo("Europe/Paris"), 18)
    # 18:00 le 25 à Paris = 17:00 UTC -> 18 h 30 plus tard
    assert s["seconds_until"] == 18 * 3600 + 30 * 60


def test_api_shape(client):
    r = client.get("/api/apero-time?timezone=America/New_York&hour=17")
    assert r.status_code == 200
    data = r.get_json()
    assert data["apero_hour"] == 17
    assert len(data["cities"]) == len(CITIES)
    assert "is_apero_time" in data and "apero_now_city" in data  # compat v1
    if data["apero_now_city"]:
        assert data["apero_now_city"]["is_apero_time"]


def test_api_rejects_bad_timezone(client):
    r = client.get("/api/apero-time?timezone=../../etc/passwd")
    assert r.status_code == 400


def test_api_bad_hour_falls_back(client):
    r = client.get("/api/apero-time?hour=99")
    assert r.get_json()["apero_hour"] == apero.APERO_HOUR


def test_gif_unknown_stage(client):
    assert client.get("/api/gif?stage=nope").status_code == 400


def test_gif_disabled_without_key(client, monkeypatch):
    monkeypatch.setattr(apero, "GIPHY_API_KEY", "")
    assert client.get("/api/gif?stage=live").get_json() == {"enabled": False}


def test_security_headers_and_favicon(client):
    r = client.get("/favicon.ico")
    assert r.status_code == 200
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


def test_gif_proxy_uses_cache(client, monkeypatch):
    calls = []

    def fake_fetch(stage):
        calls.append(stage)
        return [{"url": "https://media1.giphy.com/media/x/giphy.gif", "title": "cheers"}]

    monkeypatch.setattr(apero, "GIPHY_API_KEY", "dummy")
    monkeypatch.setattr(apero, "_fetch_giphy", fake_fetch)
    apero._gif_cache.clear()
    for _ in range(3):
        data = client.get("/api/gif?stage=live").get_json()
        assert data["gif"]["url"].startswith("https://media1.giphy.com/")
    assert calls == ["live"]  # une seule requête Giphy grâce au cache


def test_gif_proxy_survives_giphy_failure(client, monkeypatch):
    def boom(stage):
        raise OSError("network down")

    monkeypatch.setattr(apero, "GIPHY_API_KEY", "dummy")
    monkeypatch.setattr(apero, "_fetch_giphy", boom)
    apero._gif_cache.clear()
    assert client.get("/api/gif?stage=far").get_json() == {"enabled": True, "gif": None}
