import type { Asset, FormatId, Project, TranscriptFile } from '../shared/types';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? res.statusText);
  return data as T;
}

export interface ProjectSummary {
  id: string;
  name: string;
  format: FormatId;
  updatedAt: number;
  clips: number;
  thumb: string | null;
  thumbInfo: { tileW: number; tileH: number } | null;
}

export interface ServerStatus {
  ffmpeg: boolean;
  whisper: { binary: string | null; model: string | null };
  ai: boolean;
  projectsDir: string;
}

export interface ExportJob {
  id: string;
  projectId: string;
  format: FormatId;
  status: 'queued' | 'rendering' | 'audio' | 'encoding' | 'done' | 'error' | 'cancelled';
  progress: number;
  file?: string;
  url?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  fps?: number;
}

export interface AiTurn {
  reply: string;
  actions: { tool: string; input: Record<string, unknown>; ok: boolean; result: string }[];
}

export const api = {
  status: () => req<ServerStatus>('GET', '/api/status'),
  projects: () => req<ProjectSummary[]>('GET', '/api/projects'),
  createProject: (name: string, format: FormatId) => req<Project>('POST', '/api/projects', { name, format }),
  project: (id: string) => req<Project>('GET', `/api/projects/${id}`),
  save: (p: Project) => req<{ updatedAt: number }>('PUT', `/api/projects/${p.id}`, p),
  upload: (id: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    return req<Asset[]>('POST', `/api/projects/${id}/upload`, fd);
  },
  importPath: (id: string, path: string) => req<Asset>('POST', `/api/projects/${id}/import-path`, { path }),
  transcribe: (id: string, assetId: string, language = 'auto') =>
    req<{ ok: true }>('POST', `/api/projects/${id}/assets/${assetId}/transcribe`, { language }),
  transcript: (id: string, assetId: string) => req<TranscriptFile | null>('GET', `/api/projects/${id}/assets/${assetId}/transcript`),
  export: (id: string, opts: { formats: FormatId[]; fps: number; quality: string; normalize: boolean; range?: [number, number] }) =>
    req<ExportJob[]>('POST', `/api/projects/${id}/export`, opts),
  exports: (id: string) => req<ExportJob[]>('GET', `/api/projects/${id}/exports`),
  cancelJob: (jobId: string) => req('POST', `/api/jobs/${jobId}/cancel`),
  reveal: (path: string) => req('POST', '/api/reveal', { path }),
  ai: (id: string, message: string, context?: string) => req<AiTurn>('POST', `/api/projects/${id}/ai`, { message, context }),
  aiReset: (id: string) => req('POST', `/api/projects/${id}/ai/reset`),
};
