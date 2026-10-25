// Mide el coste por fotograma del render (búsqueda + captura) con distintas opciones de Chrome.
// Uso: node scripts/bench-render.mjs <projectId> [segundoInicial]
import puppeteer from 'puppeteer';

const [, , projectId, startArg] = process.argv;
const start = Number(startArg ?? 4);
const variants = {
  software: ['--enable-unsafe-swiftshader'],
  gpu: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-zero-copy'],
};

for (const [name, extra] of Object.entries(variants)) {
  for (const headless of [true, 'shell']) {
    let browser;
    try {
      browser = await puppeteer.launch({ headless, args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--force-color-profile=srgb', ...extra] });
    } catch (e) {
      console.log(name, headless, 'no disponible:', e.message.split('\n')[0]);
      continue;
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.goto(`http://localhost:5173/?render=1&project=${projectId}&format=9:16`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__studio && window.__studio.ready === true', { timeout: 60000 });
    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl');
      const d = c && c.getExtension('WEBGL_debug_renderer_info');
      return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/d';
    });
    let seek = 0;
    let shot = 0;
    const N = 30;
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      await page.evaluate((t) => window.__studio.seek(t), start + i / 30);
      const t1 = performance.now();
      await page.screenshot({ type: 'jpeg', quality: 93, optimizeForSpeed: true });
      const t2 = performance.now();
      seek += t1 - t0;
      shot += t2 - t1;
    }
    console.log(`${name.padEnd(8)} headless=${String(headless).padEnd(5)} seek ${(seek / N).toFixed(0)} ms · captura ${(shot / N).toFixed(0)} ms · ${(1000 / ((seek + shot) / N)).toFixed(1)} fps · ${gl}`);
    await browser.close();
  }
}
