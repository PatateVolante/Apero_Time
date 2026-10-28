// Carte interactive : villes en néon selon le statut de l'apéro + zone de nuit.
/* global L */

let map, nightLayer, markersLayer, featuredMarker;
const markers = new Map();   // id -> circleMarker
let handlers = {};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function initMap(el, opts) {
    handlers = opts;
    map = L.map(el, {
        worldCopyJump: true,
        minZoom: 2,
        maxZoom: 9,
        zoomSnap: 0.5,
        maxBounds: [[-85, -Infinity], [85, Infinity]],
        attributionControl: true,
    }).setView([25, 10], 2);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    return map;
}

export function invalidate() {
    map?.invalidateSize();
}

export function setNight(enabled) {
    if (!map) return;
    if (enabled && !nightLayer) {
        nightLayer = L.terminator({
            fillColor: "#000",
            fillOpacity: 0.38,
            color: css("--b"),
            opacity: 0.35,
            weight: 1,
            interactive: false,
        }).addTo(map);
    } else if (!enabled && nightLayer) {
        nightLayer.remove();
        nightLayer = null;
    }
}

export function tickNight() {
    nightLayer?.setTime();
}

/**
 * @param {Array} cities  villes avec .status calculé côté client
 * @param {{onlyLive:boolean, featuredId:number|null, refId:number|null}} o
 */
export function renderCities(cities, o) {
    if (!map) return;
    const live = css("--a"), idle = css("--b"), ref = css("--c");
    const seen = new Set();
    for (const c of cities) {
        const visible = !o.onlyLive || c.status.live || c.id === o.refId;
        if (!visible) {
            const m = markers.get(c.id);
            if (m) { markersLayer.removeLayer(m); markers.delete(c.id); }
            continue;
        }
        seen.add(c.id);
        const color = c.id === o.refId ? ref : c.status.live ? live : idle;
        const style = {
            radius: c.status.live ? 7 : 4.5,
            color,
            weight: c.id === o.refId ? 3 : 1.5,
            fillColor: color,
            fillOpacity: c.status.live ? 0.9 : 0.35,
            className: "city-dot",
        };
        let m = markers.get(c.id);
        if (!m) {
            m = L.circleMarker([c.lat, c.lon], style)
                .bindPopup(() => popupFor(c), { maxWidth: 260 })
                .bindTooltip(c.city, { direction: "top", offset: [0, -6] });
            m.addTo(markersLayer);
            markers.set(c.id, m);
        } else {
            m.setStyle(style);
        }
        m.cityRef = c;
    }
    for (const [id, m] of markers) {
        if (!seen.has(id)) { markersLayer.removeLayer(m); markers.delete(id); }
    }

    // Ville mise en avant : halo pulsé
    const fc = cities.find((c) => c.id === o.featuredId);
    if (featuredMarker) { featuredMarker.remove(); featuredMarker = null; }
    if (fc) {
        featuredMarker = L.marker([fc.lat, fc.lon], {
            icon: L.divIcon({ className: "", html: '<div class="live-pulse"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
            interactive: false,
            keyboard: false,
        }).addTo(map);
    }
}

function popupFor(c) {
    // Construit avec le DOM (pas d'innerHTML sur les données).
    const wrap = document.createElement("div");
    const city = handlers.getCity?.(c.id) ?? c;
    const h = document.createElement("p");
    h.className = "pop-city";
    h.textContent = `${handlers.flag(city.country_code)} ${city.city}`;
    const meta = document.createElement("p");
    meta.className = "pop-meta";
    meta.textContent = `${city.country} · ${handlers.formatTime(city.timezone)} (${city.timezone})`;
    const drink = document.createElement("p");
    drink.className = "pop-drink";
    drink.append(`${city.drink.emoji} `);
    const strong = document.createElement("strong");
    strong.textContent = city.drink.name;
    drink.append(strong);
    if (city.drink.note) drink.append(document.createElement("br"), city.drink.note);
    const status = document.createElement("p");
    status.className = "pop-status" + (city.status.live ? " is-live" : "");
    status.textContent = city.status.live ? "L'apéro a commencé." : `Apéro dans ${handlers.formatDuration(city.status.remaining)}.`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-small";
    btn.textContent = "Suivre ce fuseau";
    btn.addEventListener("click", () => {
        handlers.onFollow?.(c.id);
        map.closePopup();
    });
    wrap.append(h, meta, drink, status, btn);
    return wrap;
}

export function focusCity(c) {
    if (!map) return;
    map.flyTo([c.lat, c.lon], Math.max(map.getZoom(), 4), { duration: 1.1 });
    const m = markers.get(c.id);
    if (m) setTimeout(() => m.openPopup(), 1150);
}
