# Formato del proyecto (`project.json`)

Cada proyecto vive en `projects/<id>/` con `project.json`, `media/` (originales y `.proxy/`) y `exports/`.
Los tipos exactos están en `shared/types.ts`. Resumen:

- `format`: `"16:9" | "9:16" | "1:1" | "4:5"`. Tamaños: 1920×1080, 1080×1920, 1080×1080, 1080×1350.
- `fps`: fotogramas por segundo de la línea de tiempo (30 por defecto).
- `assets[]`: medios importados. `id`, `type` (`video|audio|image`), `duration`, `hasAudio`, `transcript` (ruta a JSON con palabras en tiempo de la fuente).
- `tracks[]`: en orden de pantalla. Primero las visuales (la primera es la de **arriba**, se dibuja encima), luego las de audio. `kind`: `visual|audio`. `muted`, `hidden`, `locked`.
- `clips[]`: lista plana; cada clip tiene `trackId`, `start` y `duration` (segundos de la línea de tiempo). Nunca se solapan dos clips en la misma pista.
  - `video` / `image`: `assetId`, `in` (segundo de la fuente), `speed`, `volume` (0–1+), `fadeIn`, `fadeOut`, `fit` (`cover|contain`),
    `framing` por formato `{ "9:16": { x, y, zoom } }` (x,y = punto de foco 0..1 de la fuente; zoom ≥ 1),
    `transform` `{ x, y, scale, rotation, opacity }` (x,y en fracción del lienzo), `transitionIn` `{ type, duration }`, `color` `{ brightness, contrast, saturation, warmth }`, `kenBurns` (imágenes).
  - `audio`: `assetId`, `in`, `speed`, `volume`, `fadeIn`, `fadeOut`, `duck` (bajar el volumen cuando hay voz; para música).
  - `template`: `template` (id del catálogo), `props`, `transform`, `animIn`, `animOut`, `inDuration`, `outDuration`.
  - `effect`: `effect` (id del catálogo), `props`. Afecta a todo lo que hay en las pistas **inferiores** mientras dura (como una capa de ajuste).
- `captions`: `enabled`, `style` `{ preset, font, size, color, highlight, y (0..1), uppercase, maxWords }`, `segments[]` `{ id, start, end, text, words[{start,end,text}] }` en tiempo de la línea de tiempo.
- `audio`: `{ duckLevel, master }`.
- `markers[]`: `{ id, time, label }`.

Reglas prácticas:
- El vídeo principal (talking head) va en la pista visual más baja (`v1`). Gráficos y efectos en las pistas superiores.
- Para un punch-in: clip `effect` con `effect: "zoom"` encima del vídeo, `props: { scale: 1.2, x: 0.5, y: 0.38 }`.
- Fuentes disponibles: `Inter Variable`, `Space Grotesk Variable`, `Bebas Neue`, `Playfair Display Variable`, `JetBrains Mono Variable`.
- Los paneles de `split-screen` y `triptych` referencian medios por `assetId` con su `in`.
