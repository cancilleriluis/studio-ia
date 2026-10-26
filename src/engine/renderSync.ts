// En modo exportación cada fotograma espera a que todos los vídeos, imágenes y
// shaders estén listos antes de hacer la captura.

const pending = new Set<Promise<unknown>>();

export const renderMode = new URLSearchParams(location.search).get('render') === '1';
/** Exportación por encima de 1080p: usar las copias de vídeo a resolución completa. */
export const renderHires = renderMode && new URLSearchParams(location.search).get('hires') === '1';

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
  // Esperar a que se pinte un fotograma. Chrome no pinta las pestañas en segundo
  // plano (al exportar hay varias a la vez), así que se limita la espera: la
  // captura de pantalla fuerza el pintado igualmente.
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 50);
  });
}
