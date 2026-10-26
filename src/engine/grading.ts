// Corrección de color tipo Lumetri en WebGL. Cada clip corregido dibuja su
// fotograma en un <canvas> pasando por este shader (también al exportar).

import type { Grade, Wheel } from '../../shared/types';
import { defaultGrade } from '../../shared/grade';
import { mediaFileUrl } from './media';

const VERT = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
precision highp float;
varying vec2 uv;
uniform sampler2D src;
uniform sampler2D lut;
uniform float lutSize;
uniform float lutAmount;
uniform float hasLut;
uniform float exposure, contrast, highlights, shadows, temperature, tint, saturation, vibrance, fade;
uniform vec3 liftC, gammaC, gainC;

float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }

vec3 sampleLut(vec3 c){
  float n = lutSize;
  c = clamp(c, 0., 1.);
  float b = c.b * (n - 1.);
  float b0 = floor(b);
  float b1 = min(b0 + 1., n - 1.);
  vec2 o = vec2((c.r * (n - 1.) + .5) / (n * n), (c.g * (n - 1.) + .5) / n);
  vec3 lo = texture2D(lut, o + vec2(b0 / n, 0.)).rgb;
  vec3 hi = texture2D(lut, o + vec2(b1 / n, 0.)).rgb;
  return mix(lo, hi, b - b0);
}

void main(){
  vec3 c = texture2D(src, uv).rgb;
  c *= exp2(exposure);
  c += vec3(temperature * .08, -tint * .06, -temperature * .08);
  float l = luma(c);
  c += shadows * .25 * (1. - smoothstep(0., .55, l));
  c += highlights * .25 * smoothstep(.45, 1., l);
  c = (c - .5) * (1. + contrast) + .5;
  l = clamp(luma(c), 0., 1.);
  c += liftC * (1. - l) * .18;
  c += gammaC * (1. - abs(2. * l - 1.)) * .14;
  c *= 1. + gainC * l * .25;
  l = luma(c);
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  c = mix(vec3(l), c, saturation * (1. + vibrance * (1. - clamp(sat * 1.5, 0., 1.))));
  c = mix(c, c * .84 + .09, fade);
  c = clamp(c, 0., 1.);
  if (hasLut > .5) c = mix(c, sampleLut(c), lutAmount);
  gl_FragColor = vec4(c, 1.);
}`;

/** Rueda (tono, cantidad) → desplazamiento de color neutro en luminancia. */
export function wheelColor([hue, amount]: Wheel): [number, number, number] {
  if (!amount) return [0, 0, 0];
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const m = (r + g + b) / 3;
  return [(r - m) * amount * 2, (g - m) * amount * 2, (b - m) * amount * 2];
}

/* ───────── LUTs .cube ───────── */

export interface LutData {
  size: number;
  data: Uint8Array; // atlas RGBA: ancho size*size, alto size
}

const lutCache = new Map<string, Promise<LutData>>();

export function parseCube(text: string): LutData {
  let size = 0;
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('LUT_3D_SIZE')) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (/^[A-Z_]/.test(line)) continue; // TITLE, DOMAIN_MIN, LUT_1D_SIZE...
    const p = line.split(/\s+/).map(Number);
    if (p.length >= 3 && p.every((v) => Number.isFinite(v))) values.push(p[0], p[1], p[2]);
  }
  if (!size || values.length < size * size * size * 3) throw new Error('LUT .cube no válida (se necesita una LUT 3D)');
  const data = new Uint8Array(size * size * size * 4);
  // .cube: el rojo varía más rápido, luego el verde y luego el azul
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const src = (r + g * size + b * size * size) * 3;
        const x = b * size + r;
        const dst = (g * size * size + x) * 4;
        data[dst] = Math.round(Math.min(1, Math.max(0, values[src])) * 255);
        data[dst + 1] = Math.round(Math.min(1, Math.max(0, values[src + 1])) * 255);
        data[dst + 2] = Math.round(Math.min(1, Math.max(0, values[src + 2])) * 255);
        data[dst + 3] = 255;
      }
  return { size, data };
}

export function loadLut(projectId: string, file: string): Promise<LutData> {
  const url = mediaFileUrl(projectId, file);
  let p = lutCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.text())
      .then(parseCube);
    lutCache.set(url, p);
    p.catch(() => lutCache.delete(url));
  }
  return p;
}

/* ───────── Renderizador ───────── */

export class GradeRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private srcTex: WebGLTexture;
  private lutTex: WebGLTexture;
  private lutRef: LutData | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL no disponible');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    this.srcTex = tex();
    this.lutTex = tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    for (const n of ['src', 'lut', 'lutSize', 'lutAmount', 'hasLut', 'exposure', 'contrast', 'highlights', 'shadows', 'temperature', 'tint', 'saturation', 'vibrance', 'fade', 'liftC', 'gammaC', 'gainC'])
      this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.src, 0);
    gl.uniform1i(this.u.lut, 1);
  }

  /** Dibuja el fotograma actual del elemento con la corrección indicada. */
  render(el: HTMLVideoElement | HTMLImageElement, grade: Grade, lut: LutData | null): boolean {
    const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!w || !h) return false;
    if (el instanceof HTMLVideoElement && el.readyState < 2) return false;
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    if (lut && lut !== this.lutRef) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lut.size * lut.size, lut.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data);
      this.lutRef = lut;
    }
    const g = { ...defaultGrade(), ...grade };
    const u = this.u;
    gl.uniform1f(u.lutSize, lut?.size ?? 2);
    gl.uniform1f(u.lutAmount, g.lutAmount ?? 1);
    gl.uniform1f(u.hasLut, lut ? 1 : 0);
    gl.uniform1f(u.exposure, g.exposure);
    gl.uniform1f(u.contrast, g.contrast);
    gl.uniform1f(u.highlights, g.highlights);
    gl.uniform1f(u.shadows, g.shadows);
    gl.uniform1f(u.temperature, g.temperature);
    gl.uniform1f(u.tint, g.tint);
    gl.uniform1f(u.saturation, g.saturation);
    gl.uniform1f(u.vibrance, g.vibrance);
    gl.uniform1f(u.fade, g.fade);
    gl.uniform3fv(u.liftC, wheelColor(g.lift));
    gl.uniform3fv(u.gammaC, wheelColor(g.gamma));
    gl.uniform3fv(u.gainC, wheelColor(g.gain));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
