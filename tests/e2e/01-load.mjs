/** Puntos 1-3: carga del archivo, render real, fuente Bravura y audio listo. */
import {
  openApp,
  loadTabFile,
  waitPlayerReady,
  paneRenderStats,
  transportSnapshot,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const { browser, page, logs } = await openApp();

section('1. Carga del archivo');
await shot(page, '01-inicial');

const t0 = Date.now();
let loadError = null;
try {
  await loadTabFile(page);
} catch (e) {
  loadError = e.message;
}
check('el panel maestro produce SVG/canvas', !loadError, loadError ?? `${Date.now() - t0}ms`);

// Dar tiempo al layout completo antes de medir.
await page.waitForTimeout(3000);

const stats = await paneRenderStats(page, 0);
console.log('  render panel 0:', JSON.stringify(stats && { ...stats, sampleTexts: stats.sampleTexts.slice(0, 15) }));
check('hay contenido dentro del SVG', (stats?.svgChildNodes ?? 0) > 50, `childNodes=${stats?.svgChildNodes}`);
check('hay paths (notación dibujada)', (stats?.pathCount ?? 0) > 20, `paths=${stats?.pathCount}`);
check('hay textos (números de traste / títulos)', (stats?.textCount ?? 0) > 10, `texts=${stats?.textCount}`);
check('no queda hint de error/carga', stats?.hint === null, `hint=${stats?.hint}`);

const tracks = await page.locator('.pane__track').first().locator('option').allTextContents();
console.log('  pistas en el select:', JSON.stringify(tracks));
check('se listan varias pistas', tracks.length > 1, `${tracks.length} pistas`);

const title = await page.locator('.topbar__name').textContent().catch(() => null);
console.log('  título mostrado:', title);

section('2. Fuente musical (Bravura)');
const fontReqs = logs.requests.filter(r => /Bravura/i.test(r.url));
for (const r of fontReqs) console.log(`  ${r.status}  ${r.url}`);
check('Bravura.woff2 pedido y 200', fontReqs.some(r => r.status === 200 && /\.woff2/.test(r.url)));

const fontLoaded = await page.evaluate(async () => {
  const fonts = [...document.fonts].map(f => ({ family: f.family, status: f.status }));
  return {
    fonts,
    bravuraReady: document.fonts.check('1em Bravura'),
  };
});
console.log('  document.fonts:', JSON.stringify(fontLoaded));
check('document.fonts.check("1em Bravura")', fontLoaded.bravuraReady);
console.log('  font-family usadas en los <text> del panel:', JSON.stringify(stats?.fontFamilies));

section('3. Audio listo (playerReady + soundfont)');
const sfReqs = logs.requests.filter(r => /\.sf2/.test(r.url));
for (const r of sfReqs) console.log(`  ${r.status}  ${r.url}`);
check('sonivox.sf2 respondió 200', sfReqs.some(r => r.status === 200));
console.log(`  peticiones de soundfont: ${sfReqs.length} (una por panel)`);

const ready = await waitPlayerReady(page, 60000);
check('botón de play habilitado (playerReady)', ready);
console.log('  transporte:', JSON.stringify(await transportSnapshot(page)));
await shot(page, '01-cargado');

dumpLogs(logs);
await browser.close();
