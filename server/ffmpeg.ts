import { spawn } from 'node:child_process';

export interface ProbeResult {
  duration: number;
  video?: { width: number; height: number; fps: number; codec: string; rotation: number };
  audio?: { codec: string; sampleRate: number; channels: number };
}

export function run(cmd: string, args: string[], onStderr?: (line: string) => void): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    const out: Buffer[] = [];
    let err = '';
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      if (err.length > 20000) err = err.slice(-10000);
      onStderr?.(s);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${cmd} terminó con código ${code}: ${err.slice(-1500)}`));
    });
  });
}

function parseRate(r?: string): number {
  if (!r) return 0;
  const [a, b] = r.split('/').map(Number);
  return b ? a / b : a;
}

export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]);
  const j = JSON.parse(stdout.toString());
  const v = j.streams.find((s: any) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = j.streams.find((s: any) => s.codec_type === 'audio');
  const res: ProbeResult = { duration: Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0) };
  if (v) {
    const rot = Number(v.side_data_list?.find((d: any) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0);
    const swap = Math.abs(rot) % 180 === 90;
    res.video = {
      width: swap ? v.height : v.width,
      height: swap ? v.width : v.height,
      fps: parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate) || 30,
      codec: v.codec_name,
      rotation: rot,
    };
  }
  if (a) res.audio = { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels };
  return res;
}

/** Ejecuta ffmpeg informando del progreso (0..1) a partir de la duración esperada. */
export function ffmpegWithProgress(args: string[], duration: number, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-progress', 'pipe:1', ...args]);
    let err = '';
    let last = 0;
    proc.stdout.on('data', (d) => {
      const m = /out_time_us=(\d+)/.exec(d.toString());
      if (m && duration > 0) {
        const p = Math.min(1, Number(m[1]) / 1e6 / duration);
        if (p - last > 0.02) {
          last = p;
          onProgress(p);
        }
      }
    });
    proc.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-10000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${err.slice(-1500)}`))));
  });
}

/** Decodifica audio a PCM float32 intercalado. */
export async function decodePcm(
  file: string,
  { start = 0, duration, sampleRate = 48000, channels = 2, tempo = 1, filters }: { start?: number; duration?: number; sampleRate?: number; channels?: number; tempo?: number; filters?: string },
): Promise<Float32Array> {
  const args = ['-v', 'error', '-ss', String(Math.max(0, start))];
  if (duration !== undefined) args.push('-t', String(duration));
  args.push('-i', file, '-vn', '-ac', String(channels), '-ar', String(sampleRate));
  const af = [filters, tempo !== 1 ? atempoChain(tempo) : ''].filter(Boolean).join(',');
  if (af) args.push('-af', af);
  args.push('-f', 'f32le', 'pipe:1');
  const { stdout } = await run('ffmpeg', args);
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
}

export function atempoChain(tempo: number): string {
  const parts: string[] = [];
  let t = tempo;
  while (t > 2) {
    parts.push('atempo=2');
    t /= 2;
  }
  while (t < 0.5) {
    parts.push('atempo=0.5');
    t /= 0.5;
  }
  parts.push(`atempo=${t.toFixed(5)}`);
  return parts.join(',');
}
