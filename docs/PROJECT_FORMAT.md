# Formato del proyecto (`project.json`)

Cada proyecto vive en `projects/<id>/` con `project.json`, `media/` (originales y `.proxy/`) y `exports/`.
Los tipos exactos están en `shared/types.ts`. Resumen:

- `format`: `"16:9" | "9:16" | "1:1" | "4:5"`. Tamaños: 1920×1080, 1080×1920, 1080×1080, 1080×1350.
- `fps`: fotogramas por segundo de la línea de tiempo (30 por defecto).
- `assets[]`: medios importados. `id`, `type` (`video|audio|image|lut`), `duration`, `hasAudio`, `transcript` (ruta a JSON con palabras en tiempo de la fuente), `faceTrack` `{ rate, points: [x, y][] }` (cara detectada y suavizada, 0..1 del fotograma; la calcula el editor). Las `lut` son ficheros `.cube` que se aplican desde el color, no van en la línea de tiempo.
  `folder` (id de carpeta del panel de medios), `removed` (eliminado del panel: se oculta, pero se conserva para deshacer y restaurar versiones; no lo uses en clips nuevos), `sfx` (id del efecto de sonido de la biblioteca de `SOUND_EFFECTS` en `shared/registry.ts`).
- `mediaFolders[]`: carpetas del panel de medios `{ id, name }`. `mediaSort`: orden del panel (`added|recent|name|type|duration`).
- Efectos de sonido: `POST /api/projects/:id/sfx {id}` copia uno de la biblioteca (`assets/sfx/`, generados con `node scripts/make-sfx.mjs`) como asset de audio, o devuelve el que ya esté en el proyecto.
- `tracks[]`: en orden de pantalla. Primero las visuales (la primera es la de **arriba**, se dibuja encima), luego las de audio. `kind`: `visual|audio`. `muted`, `hidden`, `locked`.
- `clips[]`: lista plana; cada clip tiene `trackId`, `start` y `duration` (segundos de la línea de tiempo). Nunca se solapan dos clips en la misma pista.
  - `video` / `image`: `assetId`, `in` (segundo de la fuente), `speed`, `volume` (0–1+), `fadeIn`, `fadeOut`, `fit` (`cover|contain`),
    `framing` por formato `{ "9:16": { x, y, zoom } }` (x,y = punto de foco 0..1 de la fuente; zoom ≥ 1),
    `transform` `{ x, y, scale, rotation, opacity }` (x,y en fracción del lienzo), `transitionIn` `{ type, duration }`, `color` `{ brightness, contrast, saturation, warmth }`, `look` (nombre del look aplicado), `kenBurns` (imágenes),
    `crop` `{ l, t, r, b }` (fracción del propio medio por cada lado), `radius` (px en lienzo de 1080), `border` `{ width, color }`, `shadow` (0..1), `enhance` (Mejorar voz),
    `autoReframe` (el encuadre sigue `asset.faceTrack` en cualquier formato),
    `grade` (color tipo Lumetri, WebGL): `{ exposure (−2..2), contrast, highlights, shadows, temperature, tint (−1..1), saturation (0..2), vibrance (−1..1), lift, gamma, gain ([tono 0..360, cantidad 0..1]), fade (0..1), lut (id de asset lut), lutAmount (0..1) }`.
  - `audio`: `assetId`, `in`, `speed`, `volume`, `fadeIn`, `fadeOut`, `duck` (bajar el volumen cuando hay voz; para música), `enhance`.
  - `template`: `template` (id del catálogo), `props`, `transform`, `animIn`, `animOut`, `inDuration`, `outDuration`.
  - Fotogramas clave (vídeo, imagen, audio y plantillas): `keyframes` `{ x?, y?, scale?, rotation?, opacity?, volume?: [{ t, v, ease? }] }`. `t` en segundos desde el inicio del clip; `ease`: `ease` (por defecto), `linear` o `hold`. Si una propiedad tiene claves, su valor de `transform`/`volume` se ignora.
  - `effect`: `effect` (id del catálogo), `props`. Afecta a todo lo que hay en las pistas **inferiores** mientras dura (como una capa de ajuste).
- `captions`: `enabled`, `style` `{ preset, font, size, color, highlight, y (0..1), uppercase, maxWords }`, `segments[]` `{ id, start, end, text, words[{start,end,text}] }` en tiempo de la línea de tiempo.
- `audio`: `{ duckLevel, master }`.
- `markers[]`: `{ id, time, label }`.

Reglas prácticas:
- El vídeo principal (talking head) va en la pista visual más baja (`v1`). Gráficos y efectos en las pistas superiores.
- Para un punch-in: clip `effect` con `effect: "zoom"` encima del vídeo, `props: { scale: 1.2, x: 0.5, y: 0.38 }`.
- Picture-in-picture: `transform: { scale: 0.36, x: 0.27, y: -0.25 }`, `radius: 36`, `shadow: 0.8`, `border: { width: 4, color: "#ffffff" }`.
- Animar una entrada: `keyframes: { scale: [{ t: 0, v: 0.8 }, { t: 0.4, v: 1 }], opacity: [{ t: 0, v: 0 }, { t: 0.3, v: 1 }] }`.
- Fuentes disponibles: `Inter Variable`, `Space Grotesk Variable`, `Bebas Neue`, `Playfair Display Variable`, `JetBrains Mono Variable`.
- Los paneles de `split-screen` y `triptych` referencian medios por `assetId` con su `in`.
