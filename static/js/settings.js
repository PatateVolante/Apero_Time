// Réglages persistants (localStorage, par navigateur) + application du thème.

const KEY = "aperoTime.settings.v2";

// hue = rotation appliquée aux tuiles de la carte (sepia -> teinte du thème)
export const THEMES = {
    akihabara: { label: "Nuit d'Akihabara", bg: "#120A24", a: "#FF2E88", b: "#21E6F0", c: "#FFB000", ink: "#E9E3FF", hue: 230 },
    synthwave: { label: "Synthwave", bg: "#1A0B2E", a: "#FF6AD5", b: "#8B5CFF", c: "#FF9A3C", ink: "#F6E8FF", hue: 250 },
    terminal: { label: "Terminal", bg: "#06120C", a: "#39FF88", b: "#7DF9C2", c: "#FFD23F", ink: "#D8FFE9", hue: 100 },
    arasaka: { label: "Arasaka", bg: "#140607", a: "#FF2A2A", b: "#F2F2F2", c: "#FF7A1A", ink: "#F7E9E9", hue: 330 },
    neokyoto: { label: "Néo-Kyoto", bg: "#04161A", a: "#FFC857", b: "#2EE6C5", c: "#FF5E5B", ink: "#E3FBF6", hue: 140 },
};

export const FONTS = {
    tilt: '"Tilt Neon", "Chakra Petch", system-ui, sans-serif',
    vt: '"VT323", ui-monospace, monospace',
    mono: '"Major Mono Display", ui-monospace, monospace',
    petch: '"Chakra Petch", system-ui, sans-serif',
};

export const GIF_STAGES = [
    { key: "far", label: "Plus de 6 h" },
    { key: "waiting", label: "3 à 6 h" },
    { key: "soon", label: "1 à 3 h" },
    { key: "close", label: "15 min à 1 h" },
    { key: "final", label: "Moins de 15 min" },
    { key: "live", label: "Apéro en cours" },
    { key: "lastcall", label: "Dernière heure" },
];

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function defaults(boot) {
    const t = THEMES.akihabara;
    return {
        aperoHour: boot?.aperoHour ?? 18,
        refTz: "auto",              // "auto" = fuseau du navigateur, sinon "city:<id>"
        clock24: true,
        theme: "akihabara",
        color: { bg: t.bg, a: t.a, b: t.b, c: t.c },
        font: "tilt",
        glow: 1,
        fx: { rain: !reducedMotion, scanlines: true, flicker: !reducedMotion, glitch: !reducedMotion },
        confetti: { amount: reducedMotion ? 100 : 300, drinks: true },
        sound: false,
        gif: { enabled: true, custom: {} },
        map: { show: true, night: true, onlyLive: false, light: 1 },
    };
}

// Fusion récursive limitée aux clés connues (import / ancienne version).
function merge(base, incoming) {
    if (!incoming || typeof incoming !== "object") return base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(base)) {
        if (!(k in incoming)) continue;
        const b = base[k], v = incoming[k];
        if (k === "custom" && v && typeof v === "object") {
            out[k] = sanitizeGifs(v);
        } else if (b && typeof b === "object" && !Array.isArray(b)) {
            out[k] = merge(b, v);
        } else if (typeof v === typeof b) {
            out[k] = v;
        }
    }
    return out;
}

function sanitizeGifs(obj) {
    const out = {};
    for (const s of GIF_STAGES) {
        const url = String(obj[s.key] ?? "").trim();
        if (isSafeImageUrl(url)) out[s.key] = url;
    }
    return out;
}

export function isSafeImageUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === "https:";
    } catch {
        return false;
    }
}

const HEX = /^#[0-9a-f]{6}$/i;

function validate(s, boot) {
    const d = defaults(boot);
    if (!Number.isInteger(s.aperoHour) || s.aperoHour < 0 || s.aperoHour > 23) s.aperoHour = d.aperoHour;
    if (!(s.theme in THEMES) && s.theme !== "custom") s.theme = d.theme;
    if (!(s.font in FONTS)) s.font = d.font;
    for (const k of ["bg", "a", "b", "c"]) if (!HEX.test(s.color[k])) s.color[k] = d.color[k];
    s.glow = Math.min(2, Math.max(0, Number(s.glow) || 0));
    s.confetti.amount = Math.min(600, Math.max(50, Number(s.confetti.amount) || d.confetti.amount));
    s.map.light = Math.min(2, Math.max(0.5, Number(s.map.light) || 1));
    if (typeof s.refTz !== "string") s.refTz = "auto";
    return s;
}

export function load(boot) {
    const d = defaults(boot);
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return d;
        return validate(merge(d, JSON.parse(raw)), boot);
    } catch {
        return d;
    }
}

export function save(settings) {
    try {
        localStorage.setItem(KEY, JSON.stringify(settings));
        return true;
    } catch {
        return false;
    }
}

export function importJSON(text, boot) {
    const parsed = JSON.parse(text);  // lève une erreur si invalide
    return validate(merge(defaults(boot), parsed), boot);
}

// Applique thème, police et effets au document.
export function apply(s) {
    const root = document.documentElement;
    const theme = THEMES[s.theme] ?? THEMES.akihabara;
    root.style.setProperty("--bg", s.color.bg);
    root.style.setProperty("--a", s.color.a);
    root.style.setProperty("--b", s.color.b);
    root.style.setProperty("--c", s.color.c);
    root.style.setProperty("--ink", theme.ink);
    root.style.setProperty("--bg-2", mix(s.color.bg, "#3a2d63", 0.35));
    root.style.setProperty("--glow", String(s.glow));
    root.style.setProperty("--map-light", String(s.map.light));
    root.style.setProperty("--sign-font", FONTS[s.font]);
    root.style.setProperty("--map-filter", `sepia(.75) hue-rotate(${theme.hue}deg) saturate(2.2) brightness(.95)`);
    root.dataset.theme = s.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", s.color.bg);

    const b = document.body.classList;
    b.toggle("no-rain", !s.fx.rain);
    b.toggle("no-scanlines", !s.fx.scanlines);
    b.toggle("flicker", s.fx.flicker);
    b.toggle("no-map", !s.map.show);
}

function mix(hexA, hexB, t) {
    const pa = parseInt(hexA.slice(1), 16), pb = parseInt(hexB.slice(1), 16);
    const ch = (p, sh) => (p >> sh) & 255;
    const m = (sh) => Math.round(ch(pa, sh) * (1 - t) + ch(pb, sh) * t);
    return "#" + [16, 8, 0].map((sh) => m(sh).toString(16).padStart(2, "0")).join("");
}
