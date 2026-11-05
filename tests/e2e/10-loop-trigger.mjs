/** Aísla qué acción concreta dispara el bucle de `playbackRange`. */
import { openApp, loadTabFile, waitPlayerReady, section, check, dumpLogs } from './harness.mjs';

const { browser, page, logs } = await openApp();
await page.addInitScript(() => {
  window.__ranges = [];
  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    try {
      if (msg?.cmd === 'alphaSynth.setPlaybackRange') window.__ranges.push(JSON.stringify(msg.value ?? null));
      if (msg?.cmd === 'alphaSynth.setIsLooping') window.__ranges.push(`looping:${msg.value}`);
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
const step = async (label, action) => {
  const a = await n();
  await action();
  await page.waitForTimeout(1200);
  const b = await n();
  await page.waitForTimeout(3000);
  const c = await n();
  console.log(`  ${label}: +${b - a} al actuar, +${c - b} en 3 s de reposo`);
  check(`${label} -> no deja bucle`, c - b <= 3, `+${c - b} mensajes en reposo`);
  return c - b;
};

const from = page.locator('.loopbars input').nth(0);
const to = page.locator('.loopbars input').nth(1);
const repeat = page.locator('.toggle:has-text("Repetir segmento") input');

section('Qué dispara el bucle');
await step('Fijar "Desde" = 3 (rango 3..106, sin repetir)', async () => {
  await from.fill('3');
});
await step('Fijar "Hasta" = 5 (rango 3..5, sin repetir)', async () => {
  await to.fill('5');
});
await step('Activar "Repetir segmento"', async () => {
  await repeat.check().catch(() => {});
});
console.log('  últimos mensajes:', JSON.stringify(await page.evaluate(() => window.__ranges.slice(-10))));
console.log('  rango en la UI:', await from.inputValue(), '..', await to.inputValue());

dumpLogs(logs);
await browser.close();
