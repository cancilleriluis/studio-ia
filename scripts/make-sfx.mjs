// Sintetiza los efectos de sonido de la biblioteca (assets/sfx/*.wav).
// Son sonidos propios generados con ruido y osciladores: sin licencias de terceros.
// Uso: node scripts/make-sfx.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sfx');

/** Generador pseudoaleatorio con semilla: el mismo script da siempre los mismos ficheros. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Filtro biquad (fórmulas RBJ). `set` se puede llamar en cada muestra para barridos. */
class Biquad {
  constructor(type, freq, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(freq, q);
  }
  set(freq, q = this.q) {
    this.q = q;
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (this.type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha]; // paso banda
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Ruido que cambia suavemente (interpolado), para modular volumen y filtros. */
function smoothNoise(rand, rate) {
  let a = rand(), b = rand(), phase = 0;
  return () => {
    phase += rate / SR;
    if (phase >= 1) {
      phase -= 1;
      a = b;
      b = rand();
    }
    const k = (1 - Math.cos(Math.PI * phase)) / 2;
    return a + (b - a) * k;
  };
}

const bell = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)) ** 2);
const decay = (t, t0, tau) => (t < t0 ? 0 : Math.exp(-(t - t0) / tau));
/** Como `decay`, pero con un ataque suave (en segundos) para que no suene a chasquido. */
const swell = (t, t0, tau, attack) => (t < t0 ? 0 : Math.min(1, (t - t0) / attack) * Math.exp(-(t - t0) / tau));

function render(seconds, fn) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

/** Normaliza a -1 dBFS y suaviza los últimos 15 ms. */
function finish(buf) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.89 / peak : 1;
  const fade = Math.round(0.015 * SR);
  for (let i = 0; i < buf.length; i++) {
    const tail = buf.length - i;
    buf[i] *= g * (tail < fade ? tail / fade : 1);
  }
  return buf;
}

function writeWav(file, buf) {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

/* ── Clic de ratón: pulsación y soltado ── */
function clic() {
  const rand = rng(1);
  const press = new Biquad('bp', 3400, 1.4);
  const release = new Biquad('bp', 2600, 1.6);
  return render(0.12, (t) => {
    const n = rand() * 2 - 1;
    const p = press.run(n) * decay(t, 0, 0.0018) * 1.6 + Math.sin(2 * Math.PI * 1750 * t) * decay(t, 0, 0.01) * 0.35;
    const r = release.run(n) * decay(t, 0.045, 0.0015) * 0.7 + Math.sin(2 * Math.PI * 2300 * t) * decay(t, 0.045, 0.006) * 0.12;
    return p + r;
  });
}

/* ── Pasar página: roce que sube y chasquido final ── */
function pageTurn() {
  const rand = rng(2);
  const rustle = new Biquad('bp', 1500, 0.8);
  const snap = new Biquad('hp', 2200, 0.7);
  const air = new Biquad('lp', 700, 0.7);
  const grain = smoothNoise(rand, 70);
  return render(0.75, (t) => {
    const n = rand() * 2 - 1;
    rustle.set(1200 + 4200 * Math.min(1, t / 0.45), 0.8);
    const body = rustle.run(n) * (Math.min(1, t / 0.38) ** 2) * (t < 0.43 ? 1 : decay(t, 0.43, 0.05)) * (0.45 + 0.55 * grain());
    const flick = snap.run(n) * decay(t, 0.42, 0.012) * 1.4;
    const whoosh = air.run(n) * bell(t, 0.15, 0.55) * 0.5;
    return body + flick + whoosh;
  });
}

/* ── Abrir un libro: golpe de tapa, hojas y apoyo final ── */
function bookOpen() {
  const rand = rng(3);
  const thumpNoise = new Biquad('lp', 380, 0.8);
  const pages = new Biquad('bp', 2400, 0.9);
  const grain = smoothNoise(rand, 55);
  // Hojas sueltas que rozan en momentos distintos
  const flips = Array.from({ length: 7 }, (_, i) => ({ at: 0.14 + i * 0.09 + rand() * 0.05, tau: 0.03 + rand() * 0.06, amp: 0.4 + rand() * 0.6 }));
  return render(1.15, (t) => {
    const n = rand() * 2 - 1;
    const f = 95 - 35 * Math.min(1, t / 0.12);
    const thump = Math.sin(2 * Math.PI * f * t) * decay(t, 0, 0.09) * 0.9 + thumpNoise.run(n) * decay(t, 0, 0.035) * 0.9;
    let env = 0;
    for (const fl of flips) env += fl.amp * swell(t, fl.at, fl.tau, 0.018);
    const rustle = pages.run(n) * env * (0.5 + 0.5 * grain()) * 0.9;
    const settle = Math.sin(2 * Math.PI * 70 * t) * swell(t, 0.86, 0.06, 0.008) * 0.35;
    return thump + rustle + settle;
  });
}

/* ── Brisa: viento suave con ráfagas lentas ── */
function breeze() {
  const rand = rng(4);
  const tone = new Biquad('bp', 500, 0.6);
  const hiss = new Biquad('lp', 3200, 0.7);
  const gust = smoothNoise(rand, 0.6);
  const sweep = smoothNoise(rand, 0.25);
  let pink = 0;
  const dur = 5;
  return render(dur, (t) => {
    const n = rand() * 2 - 1;
    pink = pink * 0.97 + n * 0.03; // ruido más grave, tipo viento
    tone.set(380 + 900 * sweep(), 0.6);
    const g = 0.55 + 0.45 * gust();
    const fade = Math.min(1, t / 1.2) * Math.min(1, (dur - t) / 1.6);
    return (tone.run(pink * 8) * g + hiss.run(n) * 0.09 * g) * fade;
  });
}

/* ── Whoosh: barrido de aire para transiciones ── */
function whoosh() {
  const rand = rng(5);
  const band = new Biquad('bp', 300, 1.4);
  const rumble = new Biquad('lp', 260, 0.7);
  return render(0.85, (t) => {
    const n = rand() * 2 - 1;
    const k = t < 0.42 ? t / 0.42 : 1 - (t - 0.42) / 0.43;
    band.set(260 * Math.pow(11, Math.max(0, k)), 1.4);
    const env = t < 0.42 ? (t / 0.42) ** 2.2 : Math.exp(-(t - 0.42) / 0.12);
    return band.run(n) * env + rumble.run(n) * env * 0.35;
  });
}

const SOUNDS = { clic, 'pasar-pagina': pageTurn, 'abrir-libro': bookOpen, brisa: breeze, whoosh };

fs.mkdirSync(OUT, { recursive: true });
for (const [id, make] of Object.entries(SOUNDS)) {
  const buf = finish(make());
  writeWav(path.join(OUT, `${id}.wav`), buf);
  console.log(`${id}.wav · ${(buf.length / SR).toFixed(2)} s`);
}
