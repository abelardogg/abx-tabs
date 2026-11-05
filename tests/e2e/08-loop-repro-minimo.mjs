/**
 * Reproducción mínima del bucle de realimentación del loop.
 *
 * Una sola acción del usuario ("Compás actual") basta para que el par
 * efecto -> `playbackRange` -> evento `playbackRangeChanged` -> `setLoopState`
 * se realimente indefinidamente.
 */
import { openApp, loadTabFile, waitPlayerReady, section, check, dumpLogs, shot } from './harness.mjs';

const { browser, page, logs } = await openApp();

await page.addInitScript(() => {
  window.__ranges = [];
  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    try {
      if (msg?.cmd === 'alphaSynth.setPlaybackRange') {
        window.__ranges.push(JSON.stringify(msg.value ?? null));
      }
    } catch {
      /* ignorar */
    }
    return original.call(this, msg, ...rest);
  };
});
await page.reload({ waitUntil: 'load' });
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2000);

const n = () => page.evaluate(() => window.__ranges.length);
const uniq = () => page.evaluate(() => [...new Set(window.__ranges)].slice(0, 6));

section('A. En reposo, sin loop');
const a1 = await n();
await page.waitForTimeout(3000);
const a2 = await n();
console.log(`  setPlaybackRange: ${a1} -> ${a2}`);
check('sin loop no se escribe el rango en bucle', a2 - a1 <= 2, `+${a2 - a1}`);

section('B. Una sola acción: botón "Compás actual"');
await page.locator('.side__actions button:has-text("Compás actual")').click();
await page.waitForTimeout(1000);
const b1 = await n();
await page.waitForTimeout(3000);
const b2 = await n();
console.log(`  setPlaybackRange: ${b1} -> ${b2} en 3 s de reposo`);
console.log('  valores distintos enviados:', JSON.stringify(await uniq()));
check('un solo rango escrito tras "Compás actual"', b2 - b1 <= 2, `+${b2 - b1} mensajes en 3 s de reposo`);

const ui = await page.evaluate(() => ({
  desde: document.querySelector('.loopbars label:nth-child(1) input')?.value,
  hasta: document.querySelectorAll('.loopbars input')[1]?.value,
}));
console.log('  rango en la UI:', JSON.stringify(ui));
check('la UI muestra un rango de un solo compás', ui.desde === ui.hasta, JSON.stringify(ui));

section('C. ¿Se recupera al quitar el loop?');
await page.locator('.side__actions button:has-text("Quitar")').click();
await page.waitForTimeout(2000);
const c1 = await n();
await page.waitForTimeout(3000);
const c2 = await n();
console.log(`  setPlaybackRange: ${c1} -> ${c2} tras "Quitar"`);
check('"Quitar" corta el bucle', c2 - c1 <= 2, `+${c2 - c1}`);
const ui2 = await page.evaluate(() => ({
  desde: document.querySelectorAll('.loopbars input')[0]?.value,
  hasta: document.querySelectorAll('.loopbars input')[1]?.value,
  repetir: document.querySelector('.toggle input[type=checkbox]:not(:disabled)') ? 'n/a' : 'n/a',
}));
console.log('  rango en la UI tras quitar:', JSON.stringify(ui2));
await shot(page, '08-loop-repro');

section('D. ¿Responde aún la app?');
const before = await page.evaluate(() => document.querySelector('.transport__bar')?.textContent);
await page.locator('.transport__buttons button[title="Compás siguiente (→)"]').click();
await page.waitForTimeout(1500);
const after = await page.evaluate(() => document.querySelector('.transport__bar')?.textContent);
console.log(`  ${before} -> ${after}`);
check('el transporte vuelve a responder', before !== after, `${before} -> ${after}`);

dumpLogs(logs);
await browser.close();
