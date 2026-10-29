# Studio IA: notas para Claude

Editor de vídeo local de Luis (React + Vite en `src/`, servidor Express en `server/`, lógica común en `shared/`). Interfaz y textos en español.

## Editar vídeos de Luis (fase 1)

- Los proyectos están en `projects/<id>/project.json`. El editor vigila ese fichero: si lo modificas, la interfaz se recarga sola (el usuario puede deshacer con ⌘Z).
- Formato: `docs/PROJECT_FORMAT.md`; tipos exactos en `shared/types.ts`; catálogo de plantillas/efectos con sus props en `shared/registry.ts`.
- Para cambios no triviales, usa las operaciones de `shared/ops.ts` (`cutRange`, `removeSourceRanges`, `createTemplateClip`, `createEffectClip`, `generateCaptions`, `splitAt`...) desde un script con `npx tsx`, en lugar de calcular a mano. Lee y escribe el JSON completo.
- Transcripciones: `projects/<id>/media/<asset.transcript>` (palabras en tiempo de la **fuente**). Para tiempos en la línea de tiempo usa `wordsOnTimeline` de `shared/captions.ts`.
- Con el servidor en marcha también hay API: `POST /api/projects/:id/import-path {path}`, `POST /api/projects/:id/assets/:assetId/transcribe`, `POST /api/projects/:id/export {formats, fps, quality}`.
- Estilo de Luis: vidrio esmerilado, cromo líquido, grotesca en negrita, etiquetas blancas, ritmo de Reels. En talking head: punch-ins de 1.12–1.3 en frases clave, foco en la cara, rótulos en la zona libre de arriba, subtítulos "pop" hacia y≈0.73 en 9:16.
- Color: `grade` del clip (ver formato). Auto Reframe: `autoReframe: true` en el clip; necesita `asset.faceTrack` (lo calcula el editor con el botón Auto Reframe).
- Quitar silencios: usa `silencesFromPeaks` (energía del audio, umbral adaptativo) sobre la forma de onda del medio; los tiempos de palabra de Whisper no son fiables para detectar pausas.
- Orden de pistas: las visuales van primero en `tracks` y la primera es la de arriba. Los efectos afectan a las pistas inferiores: ponlos justo encima del vídeo y los gráficos por encima de los efectos.

## Desarrollo

- `npm run dev` (servidor 3210 + Vite 5173), `npm run typecheck`.
- Todos los checkouts y git worktrees comparten la carpeta `projects/` del checkout principal (la calcula `server/config.ts` con `git rev-parse --git-common-dir`; `STUDIO_PROJECTS_DIR` la sustituye). Al arrancar, el servidor muestra la carpeta en uso.
- El render de exportación abre `/?render=1&project=<id>&format=<f>` en Chrome sin ventana y llama a `window.__studio.seek(t)`; todo lo que se dibuje debe depender solo del tiempo (sin estado ni animaciones CSS/JS libres) para que preview y export coincidan.
- `scripts/bench-render.mjs <projectId>` mide la velocidad del render.
