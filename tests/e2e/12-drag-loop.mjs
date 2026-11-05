/**
 * Punto 10, parte de arrastre: marcar el segmento arrastrando sobre la
 * tablatura del panel maestro.
 *
 * Se registran los `setPlaybackRange` en orden para poder distinguir el rango
 * que produce el arrastre del que luego sobrescribe la realimentación.
 */
import { openApp, loadTabFile, waitPlayerReady, section, check, dumpLogs, shot } from './harness.mjs';

const { browser, page, logs } = await openApp();
await page.addInitScript(() => {
  window.__ranges = [];
  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    try {
      if (msg?.cmd === 'alphaSynth.setPlaybackRange') window.__ranges.push(JSON.stringify(msg.value ?? null));
    } catch {
      /* ignorar */
    }
    return original.call(this, msg, ...rest);
  };
});
await page.reload({ waitUntil: 'load' });
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2500);

section('10c. Arrastre sobre la tablatura del panel maestro');
await page.evaluate(() => (window.__ranges = []));
const vp = await page.locator('.pane__viewport[data-pane="0"]').boundingBox();
// El primer sistema cae alrededor de y+150..y+320 del viewport.
const y = vp.y + 230;
await page.mouse.move(vp.x + 120, y);
await page.mouse.down();
for (let x = 160; x <= 760; x += 50) {
  await page.mouse.move(vp.x + x, y, { steps: 3 });
  await page.waitForTimeout(50);
}
await page.mouse.up();
await page.waitForTimeout(1200);

const ranges = await page.evaluate(() => window.__ranges.slice(0, 12));
console.log('  primeros rangos escritos tras el arrastre:', JSON.stringify(ranges));
const total = await page.evaluate(() => window.__ranges.length);
console.log('  total de escrituras:', total);
check('el arrastre produce un rango', ranges.length > 0);
check('el arrastre no deja un bucle de escrituras', total < 10, `${total} escrituras`);

const from = await page.locator('.loopbars input').nth(0).inputValue();
const to = await page.locator('.loopbars input').nth(1).inputValue();
console.log(`  rango que acaba en la UI: ${from} .. ${to}`);
check('el rango de la UI no abarca toda la obra', to !== '106', `${from}..${to}`);
check('el rango de la UI es un segmento corto', Number(to) - Number(from) >= 0 && Number(to) - Number(from) < 20, `${from}..${to}`);

const selection = await page.evaluate(() =>
  [...document.querySelectorAll('.pane__viewport[data-pane="0"] .at-selection div')].length,
);
console.log('  bloques de selección dibujados:', selection);
check('la selección se dibuja sobre la partitura', selection > 0, String(selection));
await shot(page, '12-drag');

dumpLogs(logs);
await browser.close();
