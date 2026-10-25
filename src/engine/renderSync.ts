// En modo exportación cada fotograma espera a que todos los vídeos, imágenes y
// shaders estén listos antes de hacer la captura.

const pending = new Set<Promise<unknown>>();

export const renderMode = new URLSearchParams(location.search).get('render') === '1';

export function track<T>(p: Promise<T>): Promise<T> {
  if (!renderMode) return p;
  pending.add(p);
  p.finally(() => pending.delete(p));
  return p;
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 4 && pending.size; i++) {
    await Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, 4000))]);
  }
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
