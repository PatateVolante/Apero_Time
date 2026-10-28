// Explosion de confettis néon (canvas, sans dépendance).

const canvas = document.getElementById("confetti");
const ctx = canvas.getContext("2d");
let particles = [];
let running = false;
let dpr = 1;

function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener("resize", resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);

function spawn(x, y, angle, spread, speed, count, colors, emojis) {
    for (let i = 0; i < count; i++) {
        const a = angle + rand(-spread, spread);
        const v = speed * rand(0.45, 1.1);
        const isEmoji = emojis.length && Math.random() < 0.12;
        particles.push({
            x, y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            rot: rand(0, Math.PI * 2),
            vr: rand(-0.3, 0.3),
            size: isEmoji ? rand(18, 30) : rand(5, 11),
            color: colors[(Math.random() * colors.length) | 0],
            shape: isEmoji ? "emoji" : (Math.random() < 0.6 ? "rect" : "circle"),
            emoji: isEmoji ? emojis[(Math.random() * emojis.length) | 0] : null,
            life: 0,
            ttl: rand(140, 220),
            wobble: rand(0, Math.PI * 2),
        });
    }
}

function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = "lighter";
    particles = particles.filter((p) => p.life < p.ttl && p.y < window.innerHeight + 60);
    for (const p of particles) {
        p.life++;
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.22;               // gravité
        p.wobble += 0.12;
        p.x += p.vx + Math.sin(p.wobble) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        const alpha = Math.max(0, 1 - Math.max(0, p.life - p.ttl * 0.7) / (p.ttl * 0.3));
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === "emoji") {
            ctx.globalCompositeOperation = "source-over";
            ctx.font = `${p.size}px serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(p.emoji, 0, 0);
            ctx.globalCompositeOperation = "lighter";
        } else {
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fillStyle = p.color;
            if (p.shape === "rect") {
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.wobble)) + 1);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.restore();
    if (particles.length) {
        requestAnimationFrame(frame);
    } else {
        running = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

/**
 * @param {{amount?: number, colors?: string[], emojis?: string[]}} opts
 */
export function explode({ amount = 300, colors = ["#FF2E88", "#21E6F0", "#FFB000"], emojis = [] } = {}) {
    const w = window.innerWidth, h = window.innerHeight;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const n = reduced ? Math.min(amount, 80) : amount;
    const palette = [...colors, "#ffffff"];
    // Deux canons latéraux + une gerbe centrale, en trois salves.
    const salvo = (k) => {
        spawn(0, h * 0.85, -Math.PI / 3, 0.35, 19, Math.round(n * 0.3 * k), palette, emojis);
        spawn(w, h * 0.85, -Math.PI * 2 / 3, 0.35, 19, Math.round(n * 0.3 * k), palette, emojis);
        spawn(w / 2, h * 0.35, -Math.PI / 2, Math.PI, 12, Math.round(n * 0.4 * k), palette, emojis);
    };
    salvo(0.6);
    if (!reduced) {
        setTimeout(() => salvo(0.25), 350);
        setTimeout(() => salvo(0.15), 800);
    }
    if (!running) {
        running = true;
        requestAnimationFrame(frame);
    }
}
