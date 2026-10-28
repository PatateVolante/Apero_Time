"""Apéro Time v2 — backend Flask."""

import json
import os
import random
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from flask import Flask, abort, jsonify, render_template, request, send_from_directory
from flask_cors import CORS

from cities import CITIES

VERSION = "2.0.0"


def _env_hour(name, default, lo, hi):
    try:
        value = int(os.environ.get(name, default))
    except ValueError:
        return default
    return value if lo <= value <= hi else default


APERO_HOUR = _env_hour("APERO_HOUR", 18, 0, 23)          # début de l'apéro (heure locale)
APERO_END_HOUR = _env_hour("APERO_END_HOUR", 24, 1, 24)   # fin (24 = minuit)
if APERO_END_HOUR <= APERO_HOUR:
    APERO_END_HOUR = 24
GIPHY_API_KEY = os.environ.get("GIPHY_API_KEY", "").strip()
# Clé CARTO (gratuite, https://carto.com/basemaps/apikey/). Sans clé : tuiles OpenStreetMap.
# Une clé de tuiles est forcément visible côté navigateur (elle est dans chaque URL de tuile).
CARTO_API_KEY = os.environ.get("CARTO_API_KEY", "").strip()
GIPHY_RATING = os.environ.get("GIPHY_RATING", "pg")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS", "https://apero.mars.patatevolante.fr").split(",") if o.strip()]

VALID_TIMEZONES = available_timezones()

# Étapes du compte à rebours -> requête GIF (les seuils sont côté front).
GIF_STAGES = {
    "far": "office work bored",
    "waiting": "waiting forever",
    "soon": "impatient waiting",
    "close": "almost there excited",
    "final": "countdown hype",
    "live": "cheers drinks",
    "lastcall": "last call bar",
}
GIF_TTL = 3600
GIF_FAIL_TTL = 300

app = Flask(__name__)
app.json.ensure_ascii = False
CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})


# --------------------------------------------------------------------------- #
# Calcul de l'apéro
# --------------------------------------------------------------------------- #
def _parse_hour(raw):
    try:
        hour = int(raw)
    except (TypeError, ValueError):
        return APERO_HOUR
    return hour if 0 <= hour <= 23 else APERO_HOUR


def _get_zone(name):
    if name not in VALID_TIMEZONES:
        abort(400, description=f"Fuseau horaire inconnu : {name}")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        abort(400, description=f"Fuseau horaire inconnu : {name}")


def apero_status(now_utc, tz, start_hour, end_hour=APERO_END_HOUR):
    """Statut de l'apéro dans un fuseau à un instant donné."""
    if end_hour <= start_hour:
        end_hour = 24
    local = now_utc.astimezone(tz)
    is_apero = start_hour <= local.hour < end_hour
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    start = midnight + timedelta(hours=start_hour)
    if local >= start:
        start += timedelta(days=1)
    # astimezone() normalise un éventuel passage heure d'été/hiver
    seconds_until = 0 if is_apero else max(0, int((start.astimezone(timezone.utc) - now_utc).total_seconds()))
    return {
        "local_time": local.strftime("%H:%M"),
        "utc_offset": local.strftime("%z"),
        "is_apero_time": is_apero,
        "seconds_until": seconds_until,
    }


def cities_status(now_utc, start_hour):
    out = []
    for c in CITIES:
        status = apero_status(now_utc, ZoneInfo(c["timezone"]), start_hour)
        out.append({**c, **status})
    return out


def pick_featured(cities, now_utc):
    """Ville mise en avant : stable pendant une heure (pas de clignotement à chaque refresh)."""
    live = [c for c in cities if c["is_apero_time"]]
    if not live:
        return None
    seed = now_utc.strftime("%Y%m%d%H")
    return random.Random(seed).choice(live)


# --------------------------------------------------------------------------- #
# GIF (proxy Giphy avec cache — la clé reste côté serveur)
# --------------------------------------------------------------------------- #
_gif_cache = {}
_gif_lock = threading.Lock()


def _fetch_giphy(stage):
    params = urllib.parse.urlencode({
        "api_key": GIPHY_API_KEY,
        "q": GIF_STAGES[stage],
        "limit": 25,
        "rating": GIPHY_RATING,
        "lang": "en",
    })
    req = urllib.request.Request(
        f"https://api.giphy.com/v1/gifs/search?{params}",
        headers={"User-Agent": f"AperoTime/{VERSION}"},
    )
    with urllib.request.urlopen(req, timeout=4) as resp:
        payload = json.load(resp)
    gifs = []
    for item in payload.get("data", []):
        images = item.get("images", {})
        img = images.get("downsized_medium") or images.get("fixed_height") or {}
        url = img.get("url", "")
        host = urllib.parse.urlparse(url).hostname or ""
        if url.startswith("https://") and host.endswith(".giphy.com"):
            gifs.append({"url": url, "title": item.get("title", "")})
    return gifs


def get_gif(stage):
    now = time.time()
    with _gif_lock:
        entry = _gif_cache.get(stage)
    if not entry or entry["expires"] < now:
        try:
            gifs = _fetch_giphy(stage)
            ttl = GIF_TTL if gifs else GIF_FAIL_TTL
        except Exception as exc:  # réseau, quota, JSON invalide…
            app.logger.warning("Giphy indisponible (%s) : %s", stage, exc)
            gifs, ttl = [], GIF_FAIL_TTL
        entry = {"gifs": gifs, "expires": now + ttl}
        with _gif_lock:
            _gif_cache[stage] = entry
    return random.choice(entry["gifs"]) if entry["gifs"] else None


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.route("/")
def index():
    return render_template(
        "index.html",
        version=VERSION,
        apero_hour=APERO_HOUR,
        gif_enabled=bool(GIPHY_API_KEY),
        carto_key=CARTO_API_KEY,
    )


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(app.static_folder, "favicon.ico", mimetype="image/vnd.microsoft.icon")


@app.route("/healthz")
def healthz():
    return jsonify({"status": "ok", "version": VERSION})


@app.route("/api/apero-time", methods=["GET"])
def get_apero_time():
    tz_name = request.args.get("timezone", "Europe/Paris")
    start_hour = _parse_hour(request.args.get("hour"))
    tz = _get_zone(tz_name)
    now_utc = datetime.now(timezone.utc)

    me = apero_status(now_utc, tz, start_hour)
    cities = cities_status(now_utc, start_hour)
    featured = pick_featured(cities, now_utc)

    return jsonify({
        "version": VERSION,
        "server_time_utc": now_utc.isoformat(timespec="seconds"),
        "apero_hour": start_hour,
        "apero_end_hour": APERO_END_HOUR,
        "timezone": tz_name,
        # champs historiques (v1) conservés pour compatibilité
        "is_apero_time": me["is_apero_time"],
        "apero_now_city": featured,
        # nouveautés v2
        "me": me,
        "apero_now_count": sum(1 for c in cities if c["is_apero_time"]),
        "cities": cities,
    })


@app.route("/api/gif", methods=["GET"])
def gif():
    stage = request.args.get("stage", "")
    if stage not in GIF_STAGES:
        abort(400, description="Étape inconnue")
    if not GIPHY_API_KEY:
        return jsonify({"enabled": False}), 200
    found = get_gif(stage)
    if not found:
        return jsonify({"enabled": True, "gif": None}), 200
    return jsonify({"enabled": True, "gif": found, "source": "GIPHY"})


@app.errorhandler(400)
def bad_request(err):
    return jsonify({"error": err.description}), 400


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("Content-Security-Policy", "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        # https: pour les GIF Giphy et les GIF perso définis dans les réglages
        "img-src 'self' data: blob: https:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]))
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
    return resp


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)))
