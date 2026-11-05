/**
 * Diagnóstico del punto 10: por qué el loop no repite.
 *
 * Se cuentan los mensajes `alphaSynth.setPlaybackRange` que salen hacia el
 * worker mientras la app está quieta. Si siguen saliendo sin que el usuario
 * toque nada, hay realimentación entre `playbackRangeChanged` y el efecto que
 * escribe `playbackRange`.
 */
import { openApp, loadTabFile, waitPlayerReady, transportSnapshot, section, check, dumpLogs, shot } from './harness.mjs';

const { browser, page, logs } = await openApp();

await page.addInitScript(() => {
  window.__wmsgs = [];
  window.__renders = 0;
  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    try {
      if (msg && typeof msg === 'object' && msg.cmd) {
        window.__wmsgs.push({ t: performance.now(), cmd: msg.cmd, value: JSON.stringify(msg.value ?? null) });
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

const count = cmd => page.evaluate(c => window.__wmsgs.filter(m => m.cmd === c).length, cmd);
const tail = (cmd, n = 6) =>
  page.evaluate(
    ({ c, n }) =>
      window.__wmsgs
        .filter(m => m.cmd === c)
        .slice(-n)
        .map(m => `${Math.round(m.t)}:${m.value}`),
    { c: cmd, n },
  );

section('10d. ¿Hay realimentación de playbackRange?');
const from = page.locator('.loopbars label:has-text("Desde") input');
const to = page.locator('.loopbars label:has-text("Hasta") input');
await from.fill('3');
await page.waitForTimeout(400);
await to.fill('5');
await page.waitForTimeout(1500);

const n1 = await count('alphaSynth.setPlaybackRange');
await page.waitForTimeout(5000); // nadie toca nada
const n2 = await count('alphaSynth.setPlaybackRange');
console.log(`  setPlaybackRange: ${n1} -> ${n2} tras 5 s de inactividad`);
console.log('  últimos valores:', JSON.stringify(await tail('alphaSynth.setPlaybackRange', 8)));
check('el rango se escribe una sola vez (sin bucle)', n2 === n1, `+${n2 - n1} mensajes en reposo`);
console.log('  rango en la UI tras reposo:', await from.inputValue(), '..', await to.inputValue());
check('la UI conserva el rango 3..5', (await from.inputValue()) === '3' && (await to.inputValue()) === '5');

section('10e. ¿El rango que queda en el sintetizador es el pedido?');
const last = (await tail('alphaSynth.setPlaybackRange', 1))[0];
console.log('  último setPlaybackRange:', last);
// Compás 3 empieza en 7680 y el compás 6 en 19200 (4/4, 3840 ticks/compás).
check('el último rango enviado es 7680..19200 (compases 3-5)', /7680.*19200/.test(last ?? ''), last ?? '');

section('10f. Reproducción dentro del loop');
const repeat = page.locator('.toggle:has-text("Repetir segmento") input');
await repeat.check();
await page.waitForTimeout(800);
const ticks = [];
await page.locator('.transport__play').click();
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(700);
  const s = await transportSnapshot(page);
  ticks.push(s.scrubValue);
}
await page.locator('.transport__play').click();
console.log('  ticks observados:', JSON.stringify(ticks));
const advanced = Math.max(...ticks) - Math.min(...ticks);
check('la posición se mueve dentro del rango', advanced > 1000, `recorrido=${advanced} ticks`);
const wrapped = ticks.some((t, i) => i > 0 && t < ticks[i - 1] - 500);
check('vuelve al principio del rango al llegar al final', wrapped, JSON.stringify(ticks));
check('no se sale del rango 7680..19200', ticks.every(t => t >= 7000 && t <= 19800), JSON.stringify(ticks));
await shot(page, '07-loop-run');

section('10g. Navegar por compases con el loop quitado');
await page.locator('.side__actions button:has-text("Quitar")').click();
await page.waitForTimeout(800);
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(800);
for (let i = 0; i < 7; i++) {
  await page.locator('.transport__buttons button[title="Compás siguiente (→)"]').click();
  await page.waitForTimeout(500);
}
const s = await transportSnapshot(page);
console.log('  tras 7 clics de compás siguiente:', JSON.stringify(s));
check('llega al compás 8', /Compás 8 \//.test(s.bar ?? ''), s.bar ?? '');

await page.locator('.side__actions button:has-text("Compás actual")').click();
await page.waitForTimeout(800);
console.log('  loop tras "Compás actual":', await from.inputValue(), '..', await to.inputValue());
check('"Compás actual" fija 8..8', (await from.inputValue()) === '8' && (await to.inputValue()) === '8');

dumpLogs(logs);
await browser.close();
