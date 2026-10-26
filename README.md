# Studio IA

Editor de vídeo local con motion graphics e IA integrada, hecho a medida para vídeos *talking head* de YouTube, Reels, Shorts y TikTok.

- **Línea de tiempo** con pistas ilimitadas, cuchilla, recorte por los bordes, imán, ripple delete, recorte al cabezal (Q/W), copiar/pegar, deshacer ilimitado y atajos tipo Premiere.
- **Plantillas animadas**: rótulo de vidrio esmerilado, pantalla dividida con marco cromado, tríptico con etiquetas, título de cromo líquido (shader WebGL), título grande palabra a palabra, texto, etiqueta, botón de suscripción y barra de progreso.
- **Efectos** como capas de ajuste: punch-in (zoom), temblor, destello, desenfoque, corrección de color y viñeta. **Transiciones**: fundidos, zoom, deslizar, barrido rápido y desenfoque.
- **Multiformato**: 16:9, 9:16, 1:1 y 4:5, con encuadre independiente por formato y exportación de varias versiones a la vez.
- **Audio**: volumen, fundidos, velocidad, ducking automático de la música bajo la voz y normalización a −14 LUFS.
- **Subtítulos automáticos** con Whisper local, palabra a palabra, en 5 estilos (Pop, Karaoke, Vidrio, Limpio, Minimal) y editables.
- **Quitar silencios** (jump cuts) en un clic.
- **Fotogramas clave** con cronómetro por propiedad (posición, escala, rotación, opacidad, volumen), rombos arrastrables en la línea de tiempo y navegación entre claves.
- **Caja de transformación** en el monitor: mover, escalar y rotar desde el centro del elemento; **recorte, esquinas, borde y sombra** con un clic para *picture-in-picture*.
- **Monitor de origen** con entrada/salida e **insertar / sobrescribir**; **levantar / extraer** con marcas en el programa; **menú contextual**, **desvincular audio** y desplazamiento fino de clips.
- **Audio con Web Audio**: medidores VU, ganancia hasta 200 % y **Mejorar voz** (graves, reducción de ruido, compresor y presencia) en preview y exportación.
- **Edición basada en texto** (panel Texto → Transcripción): borra palabras de la transcripción y desaparecen del vídeo; búsqueda, quitar muletillas y palabras repetidas.
- **Color tipo Lumetri** en WebGL: looks de un clic, exposición, contraste, luces y sombras, temperatura, matiz, saturación e intensidad, **LUTs `.cube`**, ruedas de color (sombras, medios, luces) y **scopes** (forma de onda y vectorscopio). Idéntico en preview y exportación.
- **Auto Reframe**: detecta tu cara en local (MediaPipe) y el encuadre la sigue con movimiento suave en 16:9, 9:16, 1:1 y 4:5.
- **Historial de versiones** automático (también antes de cada cambio de la IA) con restauración.
- **IA**: Claude edita el proyecto por ti (ver más abajo).
- **Exportación MP4** fotograma a fotograma con el mismo motor que la previsualización: lo que ves es lo que exportas. Preajustes (YouTube 1080p/4K, Reels…), H.264 o HEVC acelerado por el Mac, rango I/O, capítulos de YouTube a partir de los marcadores y **captura del fotograma en PNG** para miniaturas.
- **Seguro por defecto**: el servidor solo escucha en `127.0.0.1` y rechaza peticiones de otros orígenes.

## Requisitos

- macOS (probado en Apple Silicon) o Linux
- Node.js 20+
- ffmpeg: `brew install ffmpeg`
- Para subtítulos: `brew install whisper-cpp` y un modelo (`npm run setup:whisper`)

## Puesta en marcha

```bash
npm install             # también prepara la detección de caras (MediaPipe + modelo BlazeFace, ~230 KB)
npm run setup:whisper   # opcional: descarga el modelo de subtítulos (small, ~470 MB)
cp .env.example .env    # opcional: configuración y API key de Claude
npm run dev
```

Abre <http://localhost:5173>. La primera vez, `npm install` descarga el Chrome que se usa para exportar.

- `npm run dev`: servidor local (puerto 3210) + interfaz con recarga en caliente (5173)
- `npm start`: compila la interfaz y la sirve desde el servidor en <http://localhost:3210>
- `npm run typecheck`: comprobación de tipos

## Dónde se guarda todo

Cada proyecto es una carpeta en `projects/<id>/` (configurable con `STUDIO_PROJECTS_DIR`):

```
projects/<id>/
  project.json     ← toda la edición, en JSON legible
  media/           ← tus archivos originales + .proxy/ (versiones de edición, miniaturas, ondas, transcripciones)
  exports/         ← los MP4 exportados
```

`projects/` está en `.gitignore`: el código va a GitHub y tus vídeos se quedan en tu ordenador.

## IA

**Fase 1 · Claude Code.** Abre Claude Code en esta carpeta y pídele cambios («quita los silencios», «pon un rótulo de vidrio cuando digo *skills*», «haz la versión 16:9»). Claude edita `projects/<id>/project.json` y el editor se recarga solo. El formato está documentado en [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md) y las instrucciones para Claude en [`CLAUDE.md`](CLAUDE.md).

**Fase 2 · Chat integrado.** Añade `ANTHROPIC_API_KEY` a `.env` y reinicia. La pestaña **Asistente IA** usa Claude con herramientas de edición (cortar, quitar silencios, añadir plantillas y efectos, subtítulos, formatos…).

## Atajos

| Tecla | Acción |
| --- | --- |
| Espacio · J/K/L | Reproducir/pausa · atrás 1 s/pausa/reproducir |
| ← / → (⇧) | Fotograma anterior/siguiente (1 s) |
| ↑ / ↓ | Corte anterior/siguiente |
| S · ⌘K | Cortar en el cabezal |
| C · V | Cuchilla · selección |
| Q · W | Recortar inicio/final del clip hasta el cabezal (ripple) |
| ⌫ · ⇧⌫ | Borrar · borrar cerrando el hueco |
| ⌘Z · ⇧⌘Z | Deshacer · rehacer |
| ⌘C · ⌘V · ⌘D | Copiar · pegar en el cabezal · duplicar |
| M | Marcador |
| I · O · ⌥X | Entrada · salida · borrar marcas (en el monitor activo) |
| , · . | Insertar · sobrescribir desde el monitor de origen |
| ; · ' | Levantar · extraer el tramo entre entrada y salida |
| ⌥ ← / → (⇧) | Desplazar los clips seleccionados 1 fotograma (1 s) |
| Clic derecho | Menú del clip: desvincular audio, Mejorar voz, PiP, transiciones… |
| ⌘ + rueda · + / − | Zoom de la línea de tiempo |
| ⌥ + rueda (monitor) | Zoom del encuadre / escala del gráfico |

## Arquitectura

```
shared/   modelo de datos, operaciones de edición, catálogo, audio y subtítulos (común a todo)
server/   API local (Express): proyectos, importación y proxies (ffmpeg), Whisper, exportación (Puppeteer + ffmpeg), IA
src/      interfaz (React + Vite)
  engine/     compositor: Stage, medios, shader de cromo líquido, subtítulos
  templates/  plantillas de motion graphics
  editor/     paneles, monitor, línea de tiempo, inspector, exportación, chat
```
