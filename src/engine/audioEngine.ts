// Mezclador de previsualización con Web Audio: ganancia por clip (también por
// encima del 100 %), cadena «Mejorar voz» y medidores VU del bus maestro.
// La exportación aplica lo mismo con ffmpeg en el servidor.

let ctx: AudioContext | null = null;
let master: GainNode;
let analysers: [AnalyserNode, AnalyserNode];

function context(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext({ latencyHint: 'interactive' });
  master = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
  for (const a of analysers) {
    a.fftSize = 1024;
    a.smoothingTimeConstant = 0;
  }
  master.connect(ctx.destination);
  master.connect(split);
  split.connect(analysers[0], 0);
  split.connect(analysers[1], 1);
  return ctx;
}

/** Hay que llamarlo desde un gesto del usuario (reproducir) para que suene. */
export function resumeAudio() {
  const c = context();
  if (c.state === 'suspended') c.resume().catch(() => {});
}

interface Channel {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  chainIn: AudioNode;
  chainOut: AudioNode;
  enhanced: boolean;
}

const channels = new WeakMap<HTMLMediaElement, Channel>();

function buildEnhance(c: AudioContext): { input: AudioNode; output: AudioNode } {
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 80;
  const mud = c.createBiquadFilter();
  mud.type = 'peaking';
  mud.frequency.value = 220;
  mud.Q.value = 1;
  mud.gain.value = -2.5;
  const presence = c.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3500;
  presence.Q.value = 0.9;
  presence.gain.value = 3;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.12;
  comp.knee.value = 6;
  const makeup = c.createGain();
  makeup.gain.value = 1.35;
  hp.connect(mud).connect(presence).connect(comp).connect(makeup);
  return { input: hp, output: makeup };
}

/** Conecta un elemento <video>/<audio> al mezclador (una sola vez por elemento). */
export function channelFor(el: HTMLMediaElement): Channel | null {
  let ch = channels.get(el);
  if (ch) return ch;
  try {
    const c = context();
    const source = c.createMediaElementSource(el);
    const gain = c.createGain();
    gain.gain.value = 0;
    const chain = buildEnhance(c);
    chain.output.connect(gain);
    source.connect(gain);
    gain.connect(master);
    ch = { source, gain, chainIn: chain.input, chainOut: chain.output, enhanced: false };
    channels.set(el, ch);
    el.volume = 1;
    return ch;
  } catch {
    return null;
  }
}

export function setChannel(el: HTMLMediaElement, gain: number, enhance: boolean) {
  const ch = channelFor(el);
  if (!ch) {
    el.volume = Math.max(0, Math.min(1, gain));
    return;
  }
  if (enhance !== ch.enhanced) {
    ch.source.disconnect();
    ch.source.connect(enhance ? ch.chainIn : ch.gain);
    ch.enhanced = enhance;
  }
  ch.gain.gain.setTargetAtTime(Math.max(0, gain), ch.gain.context.currentTime, 0.015);
}

const buf = new Float32Array(1024);

/** Pico actual (0..1+) de cada canal del bus maestro. */
export function meterLevels(): [number, number] {
  if (!ctx) return [0, 0];
  return analysers.map((a) => {
    a.getFloatTimeDomainData(buf);
    let m = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > m) m = v;
    }
    return m;
  }) as [number, number];
}
