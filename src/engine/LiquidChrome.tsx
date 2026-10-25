// Metal líquido con un shader WebGL (ruido con deformación de dominio mapeado a
// un degradado cromado). Un único contexto WebGL compartido dibuja en un lienzo
// oculto y se copia a cada <canvas> visible, opcionalmente recortado a un texto.

import { useLayoutEffect, useRef } from 'react';

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uTint;
uniform float uSeed;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.)), c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 r = mat2(.8,.6,-.6,.8);
  for(int i=0;i<5;i++){ v += a*noise(p); p = r*p*2.02 + 3.1; a *= .5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  // Escala en unidades de altura: ondas grandes y suaves como el metal líquido real
  float sc = clamp(uRes.y / 260., .35, 1.);
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y) * .62 * sc + uSeed;
  float t = uTime * .18;
  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 1.8*q + vec2(1.7, 9.2) + .5*t), fbm(p + 1.8*q + vec2(8.3, 2.8) - .4*t));
  float f = fbm(p + 1.6*r);
  float v = f * 1.7 + uv.y * .35 + q.x * .3;
  float band = .5 + .5 * sin(v * 6.2831 * .62);
  vec3 dark = vec3(.16, .17, .19);
  vec3 mid = vec3(.52, .54, .58);
  vec3 lite = vec3(.93, .94, .95);
  vec3 col = mix(dark, mid, smoothstep(.0, .6, band));
  col = mix(col, lite, smoothstep(.68, 1., band));
  col += pow(max(0., sin(v * 5.3 + 1.3)), 18.) * .35;
  col += smoothstep(.75, 1., uv.y) * .12;
  col *= mix(vec3(1.), uTint * 1.2, .6);
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

let glCanvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let uniforms: Record<string, WebGLUniformLocation | null> = {};

function init(): WebGLRenderingContext | null {
  if (gl) return gl;
  glCanvas = document.createElement('canvas');
  gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) console.error(gl!.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['uRes', 'uTime', 'uTint', 'uSeed']) uniforms[n] = gl.getUniformLocation(prog, n);
  return gl;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function drawChrome(w: number, h: number, time: number, tint: string, seed = 0): HTMLCanvasElement | null {
  const g = init();
  if (!g || !glCanvas) return null;
  if (glCanvas.width !== w || glCanvas.height !== h) {
    glCanvas.width = w;
    glCanvas.height = h;
  }
  g.viewport(0, 0, w, h);
  g.uniform2f(uniforms.uRes, w, h);
  g.uniform1f(uniforms.uTime, time);
  g.uniform3f(uniforms.uTint, ...hexToRgb(tint));
  g.uniform1f(uniforms.uSeed, seed);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  return glCanvas;
}

interface Props {
  width: number;
  height: number;
  time: number;
  tint?: string;
  radius?: number;
  /** Si se indica, el metal se recorta a este texto. */
  text?: string;
  font?: string;
  seed?: number;
  /** Resolución interna relativa (1 = nativa). */
  quality?: number;
  style?: React.CSSProperties;
}

export function LiquidChrome({ width, height, time, tint = '#c9ced6', radius = 0, text, font, seed = 0, quality = 1, style }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = Math.max(2, Math.round(width * quality));
    const h = Math.max(2, Math.round(height * quality));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const src = drawChrome(w, h, time, tint, seed);
    if (!src) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if (text) {
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#000';
      ctx.font = font ?? `800 ${Math.round(h * 0.8)}px "Inter Variable"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + h * 0.04);
    } else {
      const r = Math.min(radius * quality, h / 2, w / 2);
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, r);
      ctx.clip();
      ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
  });
  return <canvas ref={ref} style={{ width, height, display: 'block', ...style }} />;
}
