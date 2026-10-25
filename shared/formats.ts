import type { FormatId } from './types';

export interface FormatInfo {
  id: FormatId;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const FORMATS: Record<FormatId, FormatInfo> = {
  '16:9': { id: '16:9', label: '16:9', hint: 'YouTube', width: 1920, height: 1080 },
  '9:16': { id: '9:16', label: '9:16', hint: 'Reels · Shorts · TikTok', width: 1080, height: 1920 },
  '1:1': { id: '1:1', label: '1:1', hint: 'Cuadrado', width: 1080, height: 1080 },
  '4:5': { id: '4:5', label: '4:5', hint: 'Feed Instagram', width: 1080, height: 1350 },
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

/** Factor para escalar tamaños expresados para un lienzo de 1080 px en su lado corto. */
export function unitScale(format: FormatId): number {
  const f = FORMATS[format];
  return Math.min(f.width, f.height) / 1080;
}

export function isVertical(format: FormatId): boolean {
  return FORMATS[format].height > FORMATS[format].width;
}
