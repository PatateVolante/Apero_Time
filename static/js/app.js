// Apéro Time v2 — contrôleur principal.
import * as S from "./settings.js";
import { explode } from "./confetti.js";
import * as M from "./map.js";

const $ = (sel) => document.querySelector(sel);
const boot = JSON.parse($("#boot").textContent);
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";

let settings = S.load(boot);
let cities = [];
const byId = new Map();
let featuredId = null;
let endHour = 24;
let mapReady = false;
let lastStage = null;
let lastLive = null;
let lastSecond = -1;
let gifToken = 0;

const STAGES = {
    far:      { text: "Encore loin. On tient bon.", glyph: "💼" },
    waiting:  { text: "Ça approche, doucement.", glyph: "⏳" },
    soon:     { text: "Moins de 3 h : on commence à y penser.", glyph: "🫠" },
    close:    { text: "Moins d'une heure. Les glaçons au congélateur.", glyph: "👀" },
    final:    { text: "Dernière ligne droite !", glyph: "🚨" },
    live:     { text: "L'apéro est ouvert. Santé ! 🍻", glyph: "🍻" },
    lastcall: { text: "Dernière tournée avant la fermeture.", glyph: "🔔" },
};

// ------------------------------------------------------------------ //
// Temps
// ------------------------------------------------------------------ //
const fmtCache = new Map();
function partsIn(tz, date = new Date()) {
    let f = fmtCache.get(tz);
    if (!f) {
        try {
            f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
        } catch {
            f = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
        }
        fmtCache.set(tz, f);
    }
    const p = {};
    for (const x of f.formatToParts(date)) p[x.type] = x.value;
    return { h: Number(p.hour) % 24, m: Number(p.minute), s: Number(p.second) };
}

function effectiveEnd() {
    return endHour > settings.aperoHour ? endHour : 24;
}

function statusIn(tz, date) {
    const { h, m, s } = partsIn(tz, date);
    const sod = h * 3600 + m * 60 + s;
    const start = settings.aperoHour * 3600;
    const end = effectiveEnd() * 3600;
    const live = sod >= start && sod < end;
    const remaining = live ? 0 : sod < start ? start - sod : 86400 - sod + start;
    return { sod, live, remaining, lastcall: live && sod >= end - 3600, elapsed: live ? sod - start : 0 };
}

function stageFor(st) {
    if (st.live) return st.lastcall ? "lastcall" : "live";
    const r = st.remaining;
    if (r >= 6 * 3600) return "far";
    if (r >= 3 * 3600) return "waiting";
    if (r >= 3600) return "soon";
    if (r >= 15 * 60) return "close";
    return "final";
}

const pad = (n) => String(n).padStart(2, "0");

export function formatDuration(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? `${h} h ${pad(m)}` : `${m} min`;
}

function formatClock(tz) {
    try {
        return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: !settings.clock24 }).format(new Date());
    } catch {
        return "--:--";
    }
}

function formatHour(hour) {
    const d = new Date(Date.UTC(2000, 0, 1, hour, 0));
    return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: !settings.clock24 }).format(d);
}

const flag = (cc) => (cc && cc.length === 2)
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65))
    : "🏳️";

// ------------------------------------------------------------------ //
// Référence (fuseau suivi)
// ------------------------------------------------------------------ //
function reference() {
    if (settings.refTz.startsWith("city:")) {
        const c = byId.get(Number(settings.refTz.slice(5)));
        if (c) return { tz: c.timezone, label: c.city, city: c };
    }
    const sameTz = cities.find((c) => c.timezone === browserTz);
    const label = sameTz ? sameTz.city : browserTz.split("/").pop().replaceAll("_", " ");
    return { tz: browserTz, label, city: sameTz ?? null };
}

// ------------------------------------------------------------------ //
// Données serveur
// ------------------------------------------------------------------ //
let fetchTimer;
async function fetchData() {
    clearTimeout(fetchTimer);
    const ref = reference();
    const url = `/api/apero-time?timezone=${encodeURIComponent(ref.tz)}&hour=${settings.aperoHour}`;
    try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        cities = data.cities;
        byId.clear();
        for (const c of cities) byId.set(c.id, c);
        featuredId = data.apero_now_city?.id ?? null;
        endHour = data.apero_end_hour ?? 24;
        fillRefSelect();
        renderWorld();
        fetchTimer = setTimeout(fetchData, 5 * 60 * 1000);
    } catch (err) {
        console.error("Apéro Time :", err);
        $("#world-count").textContent = `Serveur injoignable (${err.message}). Nouvel essai dans 30 s.`;
        fetchTimer = setTimeout(fetchData, 30 * 1000);
    }
}

// ------------------------------------------------------------------ //
// Compte à rebours
// ------------------------------------------------------------------ //
const cdEl = $("#countdown");
const cdParts = {
    h: cdEl.querySelector('[data-unit="h"]'),
    m: cdEl.querySelector('[data-unit="m"]'),
    s: cdEl.querySelector('[data-unit="s"]'),
};

function tick() {
    const now = new Date();
    const sec = Math.floor(now.getTime() / 1000);
    if (sec === lastSecond) return;
    lastSecond = sec;

    const ref = reference();
    const st = statusIn(ref.tz, now);
    const stage = stageFor(st);

    // Affichage HH:MM:SS (figé à 00:00:00 pendant l'apéro, comme une enseigne « open »)
    const r = st.remaining;
    cdParts.h.textContent = pad(Math.floor(r / 3600));
    cdParts.m.textContent = pad(Math.floor((r % 3600) / 60));
    cdParts.s.textContent = pad(r % 60);
    cdEl.classList.toggle("is-live", st.live);
    cdEl.classList.toggle("is-final", stage === "final");

    // Ligne de contexte
    const where = $("#where");
    where.replaceChildren(
        "À ", strong(ref.label), `, il est ${formatClock(ref.tz)}. Apéro à ${formatHour(settings.aperoHour)}.`,
    );

    // Barre de charge
    const startS = settings.aperoHour * 3600, endS = effectiveEnd() * 3600;
    let pct, label;
    if (st.live) {
        pct = Math.min(100, (st.elapsed / (endS - startS)) * 100);
        label = `Ouvert depuis ${formatDuration(st.elapsed)}`;
    } else {
        const wait = 86400 - (endS - startS);
        pct = Math.max(0, Math.min(100, ((wait - r) / wait) * 100));
        label = `Charge ${Math.floor(pct)} %`;
    }
    $("#charge-fill").style.width = `${pct}%`;
    $("#charge-label").textContent = label;

    // Changement d'étape : texte, GIF, glitch
    if (stage !== lastStage) {
        $("#stage-text").textContent = STAGES[stage].text;
        $("#sr-status").textContent = st.live
            ? STAGES[stage].text
            : `${STAGES[stage].text} Apéro dans ${formatDuration(r)}.`;
        if (lastStage !== null && settings.fx.glitch) retrigger(cdEl, "glitch");
        lastStage = stage;
        loadGif(stage);
    }

    // Bip des 10 dernières secondes
    if (!st.live && r <= 10 && r > 0 && settings.sound) beep(660 + (10 - r) * 40, 0.09);

    // Passage à 00:00:00 → explosion
    if (lastLive === false && st.live) celebrate();
    lastLive = st.live;

    // Rafraîchit la liste/carte toutes les 30 s
    if (sec % 30 === 0) renderWorld();
    if (sec % 60 === 0) M.tickNight();
}

function strong(text) {
    const el = document.createElement("strong");
    el.textContent = text;
    return el;
}

function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

function celebrate() {
    const css = getComputedStyle(document.documentElement);
    const drink = reference().city?.drink.emoji;
    explode({
        amount: settings.confetti.amount,
        colors: ["--a", "--b", "--c"].map((v) => css.getPropertyValue(v).trim()),
        emojis: settings.confetti.drinks ? [drink ?? "🍷", "🍻", "🥂"].filter(Boolean) : [],
    });
    retrigger(cdEl, "ignite");
    if (settings.sound) chord();
    renderWorld();
}

// ------------------------------------------------------------------ //
// Son (Web Audio, débloqué au premier clic)
// ------------------------------------------------------------------ //
let audio;
function audioCtx() {
    if (!audio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audio = new AC();
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
}
document.addEventListener("pointerdown", () => { if (settings.sound) audioCtx(); }, { once: true });

function beep(freq, dur, when = 0, type = "square", vol = 0.06) {
    const ac = audioCtx();
    if (!ac || ac.state !== "running") return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
}
function chord() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep(f, 0.9, i * 0.07, "sawtooth", 0.04));
}

// ------------------------------------------------------------------ //
// GIF
// ------------------------------------------------------------------ //
const gifImg = $("#gif");
const gifFallback = $("#gif-fallback");

function showFallback(stage) {
    gifImg.hidden = true;
    gifImg.removeAttribute("src");
    gifFallback.hidden = false;
    gifFallback.textContent = STAGES[stage].glyph;
    $("#gif-credit").textContent = "";
}

async function loadGif(stage = lastStage) {
    if (!stage) return;
    document.body.classList.toggle("no-gif", !settings.gif.enabled);
    if (!settings.gif.enabled) return;
    const token = ++gifToken;
    const custom = settings.gif.custom[stage];
    $("#gif-next").hidden = Boolean(custom) || !boot.gifEnabled;

    let src = null, credit = "", alt = "";
    if (custom) {
        src = custom;
        credit = "GIF personnalisé";
    } else if (boot.gifEnabled) {
        try {
            const r = await fetch(`/api/gif?stage=${stage}`);
            const data = await r.json();
            if (data.gif) {
                src = data.gif.url;
                alt = data.gif.title || "";
                credit = "Via GIPHY";
            }
        } catch { /* repli sur l'emoji animé */ }
    }
    if (token !== gifToken) return;           // une requête plus récente a gagné
    if (!src) return showFallback(stage);

    gifImg.onload = () => {
        if (token !== gifToken) return;
        gifFallback.hidden = true;
        gifImg.hidden = false;
    };
    gifImg.onerror = () => { if (token === gifToken) showFallback(stage); };
    gifImg.alt = alt;
    gifImg.src = src;
    $("#gif-credit").textContent = credit;
}

// ------------------------------------------------------------------ //
// Monde : carte + liste
// ------------------------------------------------------------------ //
function computeStatuses() {
    const now = new Date();
    for (const c of cities) c.status = statusIn(c.timezone, now);
}

function renderWorld() {
    if (!cities.length) return;
    computeStatuses();
    const ref = reference();
    const live = cities.filter((c) => c.status.live);

    $("#world-count").replaceChildren(
        strong(String(live.length)), ` ${live.length > 1 ? "villes trinquent" : "ville trinque"} sur ${cities.length}.`,
    );

    // Boisson de la ville suivie
    const myDrink = $("#my-drink");
    if (ref.city) {
        const d = ref.city.drink;
        myDrink.replaceChildren(`${d.emoji} À ${ref.city.city}, l'apéro local : `, strong(d.name), d.note ? `. ${d.note}` : ".");
        myDrink.hidden = false;
    } else {
        myDrink.hidden = true;
    }

    // Ville mise en avant (choix serveur, revalidé côté client)
    let featured = byId.get(featuredId);
    if (!featured?.status.live) featured = live[0];
    $("#featured").hidden = !featured;
    $("#featured-empty").hidden = Boolean(featured);
    if (featured) {
        $("#featured-flag").textContent = flag(featured.country_code);
        $("#featured-name").textContent = `${featured.city}, ${featured.country}`;
        $("#featured-time").textContent = `Il y est ${formatClock(featured.timezone)}, apéro ouvert depuis ${formatDuration(featured.status.elapsed)}.`;
        $("#featured-emoji").textContent = featured.drink.emoji;
        $("#featured-drink-name").textContent = featured.drink.name;
        $("#featured-note").textContent = featured.drink.note || "";
    }

    // Liste : les apéros les plus récents d'abord
    const list = $("#live-list");
    const others = live.filter((c) => c !== featured).sort((a, b) => a.status.elapsed - b.status.elapsed);
    list.replaceChildren(...others.map((c) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        const f = document.createElement("span");
        f.textContent = flag(c.country_code);
        f.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.className = "l-name";
        name.textContent = `${c.city} `;
        const dr = document.createElement("span");
        dr.className = "l-drink";
        dr.textContent = `${c.drink.emoji} ${c.drink.name}`;
        name.append(dr);
        const t = document.createElement("span");
        t.className = "l-time";
        t.textContent = formatClock(c.timezone);
        btn.append(f, name, t);
        btn.addEventListener("click", () => {
            if (!settings.map.show) return;
            M.focusCity(c);
            $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
        });
        li.append(btn);
        return li;
    }));
    if (!others.length) {
        const li = document.createElement("li");
        li.className = "hint";
        li.textContent = featured ? "Aucune autre ville pour l'instant." : "Personne pour l'instant.";
        list.append(li);
    }

    if (settings.map.show) {
        ensureMap();
        M.renderCities(cities, {
            onlyLive: settings.map.onlyLive,
            featuredId: featured?.id ?? null,
            refId: ref.city?.id ?? null,
        });
    }
}

function ensureMap() {
    if (mapReady || !window.L) return;
    try {
        M.initMap($("#map"), {
            flag,
            formatTime: formatClock,
            formatDuration,
            getCity: (id) => byId.get(id),
            onFollow: (id) => updateSettings({ refTz: `city:${id}` }),
        });
        M.setNight(settings.map.night);
        mapReady = true;
    } catch (err) {
        console.error("Carte indisponible :", err);
    }
}

// ------------------------------------------------------------------ //
// Réglages
// ------------------------------------------------------------------ //
const form = $("#settings-form");

function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
    target[last] = value;
}

function buildForm() {
    const hourSel = $("#set-hour");
    for (let h = 0; h < 24; h++) hourSel.add(new Option(formatHour(h), String(h)));

    const themes = $("#set-themes");
    for (const [key, t] of Object.entries(S.THEMES)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "theme-swatch";
        b.setAttribute("role", "radio");
        b.dataset.theme = key;
        const sw = document.createElement("span");
        sw.className = "sw";
        for (const col of [t.bg, t.a, t.b, t.c]) {
            const s = document.createElement("span");
            s.style.background = col;
            sw.append(s);
        }
        b.append(sw, t.label);
        b.addEventListener("click", () => updateSettings({ theme: key, color: { bg: t.bg, a: t.a, b: t.b, c: t.c } }));
        themes.append(b);
    }

    const gifs = $("#set-gifs");
    for (const s of S.GIF_STAGES) {
        const l = document.createElement("label");
        l.className = "field";
        l.textContent = s.label;
        const inp = document.createElement("input");
        inp.type = "url";
        inp.name = `gif.custom.${s.key}`;
        inp.placeholder = "https://…/mon-gif.gif";
        inp.inputMode = "url";
        l.append(inp);
        gifs.append(l);
    }
    fillRefSelect();
}

function fillRefSelect() {
    const sel = $("#set-ref");
    sel.replaceChildren(new Option(`Automatique (navigateur : ${browserTz})`, "auto"));
    const groups = new Map();
    for (const c of [...cities].sort((a, b) => a.country.localeCompare(b.country, "fr") || a.city.localeCompare(b.city, "fr"))) {
        if (!groups.has(c.country)) {
            const g = document.createElement("optgroup");
            g.label = `${flag(c.country_code)} ${c.country}`;
            groups.set(c.country, g);
            sel.append(g);
        }
        groups.get(c.country).append(new Option(`${c.city} (${c.timezone})`, `city:${c.id}`));
    }
    sel.value = settings.refTz;
    if (sel.value !== settings.refTz) sel.value = "auto";
}

function fillForm() {
    for (const el of form.elements) {
        if (!el.name || el.type === "file") continue;
        const v = getPath(settings, el.name);
        if (el.type === "checkbox") el.checked = Boolean(v);
        else if (el.name.startsWith("gif.custom.")) el.value = v ?? "";
        else if (v !== undefined) el.value = String(v);
    }
    form.elements.glowOut.value = Number(settings.glow).toFixed(1);
    form.elements.confettiOut.value = settings.confetti.amount;
    for (const b of document.querySelectorAll(".theme-swatch")) {
        b.setAttribute("aria-checked", String(b.dataset.theme === settings.theme));
    }
}

function readForm(changed) {
    const next = structuredClone(settings);
    const el = changed;
    if (!el?.name || el.type === "file") return next;
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "range") v = Number(el.value);
    else if (el.name === "aperoHour") v = Number(el.value);
    else v = el.value;

    if (el.name.startsWith("gif.custom.")) {
        const stage = el.name.slice("gif.custom.".length);
        const url = String(v).trim();
        if (!url) delete next.gif.custom[stage];
        else if (S.isSafeImageUrl(url)) next.gif.custom[stage] = url;
        else { msg("L'URL du GIF doit commencer par https://"); return next; }
    } else {
        setPath(next, el.name, v);
    }
    return next;
}

function updateSettings(patch) {
    const prev = settings;
    settings = { ...structuredClone(settings), ...patch };
    S.save(settings);
    applyAll(prev);
    fillForm();
}

function applyAll(prev = null) {
    S.apply(settings);
    document.body.classList.toggle("no-gif", !settings.gif.enabled);

    const refetch = !prev || prev.aperoHour !== settings.aperoHour || prev.refTz !== settings.refTz;
    if (prev && prev.map.show !== settings.map.show && settings.map.show) {
        renderWorld();
        setTimeout(M.invalidate, 50);
    }
    if (prev && prev.map.night !== settings.map.night) M.setNight(settings.map.night);
    if (prev && (prev.clock24 !== settings.clock24)) {
        const sel = $("#set-hour");
        [...sel.options].forEach((o, h) => { o.text = formatHour(h); });
    }
    if (prev && (prev.gif.enabled !== settings.gif.enabled || JSON.stringify(prev.gif.custom) !== JSON.stringify(settings.gif.custom))) {
        loadGif();
    }
    if (prev && refetch) {
        lastLive = null;                      // pas de confettis parce qu'on a changé d'heure
        lastStage = null;
        lastSecond = -1;
        fetchData();
    } else if (prev) {
        renderWorld();
    }
    lastSecond = -1;
    tick();
}

form.addEventListener("input", (e) => {
    if (e.target.type === "url") return;      // validé au "change"
    const prev = settings;
    settings = readForm(e.target);
    S.save(settings);
    if (e.target.name === "glow") form.elements.glowOut.value = Number(settings.glow).toFixed(1);
    if (e.target.name === "confetti.amount") form.elements.confettiOut.value = settings.confetti.amount;
    applyAll(prev);
});
form.addEventListener("change", (e) => {
    if (e.target.type !== "url") return;
    const prev = settings;
    settings = readForm(e.target);
    S.save(settings);
    applyAll(prev);
});
form.addEventListener("submit", (e) => e.preventDefault());

let msgTimer;
function msg(text) {
    const el = $("#settings-msg");
    el.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.textContent = ""; }, 4000);
}

$("#test-confetti").addEventListener("click", () => {
    if (settings.sound) audioCtx();
    celebrate();
});
$("#gif-next").addEventListener("click", () => loadGif());

$("#export-settings").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "apero-time-reglages.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg("Réglages exportés.");
});
$("#import-settings").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
        const prev = settings;
        settings = S.importJSON(await file.text(), boot);
        S.save(settings);
        fillForm();
        applyAll(prev);
        msg("Réglages importés.");
    } catch {
        msg("Fichier illisible : exportez d'abord des réglages depuis Apéro Time.");
    }
});
$("#reset-settings").addEventListener("click", () => {
    const prev = settings;
    settings = S.defaults(boot);
    S.save(settings);
    fillForm();
    applyAll(prev);
    msg("Réglages réinitialisés.");
});

// Tiroir
const drawer = $("#settings"), backdrop = $("#settings-backdrop"), openBtn = $("#open-settings");
function setDrawer(open) {
    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    backdrop.hidden = !open;
    openBtn.setAttribute("aria-expanded", String(open));
    if (open) setTimeout(() => $("#close-settings").focus(), 50);
    else openBtn.focus();
}
openBtn.addEventListener("click", () => setDrawer(true));
$("#close-settings").addEventListener("click", () => setDrawer(false));
backdrop.addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) setDrawer(false);
});

// ------------------------------------------------------------------ //
// Démarrage
// ------------------------------------------------------------------ //
buildForm();
fillForm();
applyAll();
fetchData();
setInterval(tick, 250);
