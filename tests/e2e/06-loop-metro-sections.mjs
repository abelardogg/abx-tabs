/** Puntos 9, 10 y 11: metrónomo / compás de entrada, loop y secciones. */
import {
  openApp,
  loadTabFile,
  waitPlayerReady,
  transportSnapshot,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const { browser, page, logs } = await openApp();

await page.addInitScript(() => {
  window.__wmsgs = [];
  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    try {
      if (msg && typeof msg === 'object' && msg.cmd) {
        window.__wmsgs.push({ cmd: msg.cmd, value: JSON.stringify(msg.value ?? null) });
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

const errCount = () => logs.pageErrors.length + logs.consoleLogs.filter(l => l.type === 'error').length;

section('9. Metrónomo y compás de entrada');
const errBefore = errCount();
const metro = page.locator('.toggle:has-text("Click en cada pulso") input');
const countIn = page.locator('.toggle:has-text("Compás de entrada") input');
await metro.check();
await page.waitForTimeout(400);
await countIn.check();
await page.waitForTimeout(400);
check('metrónomo marcado', await metro.isChecked());
check('compás de entrada marcado', await countIn.isChecked());

let msgs = await page.evaluate(() => window.__wmsgs);
const metroMsgs = msgs.filter(m => m.cmd === 'alphaSynth.setMetronomeVolume');
const ciMsgs = msgs.filter(m => m.cmd === 'alphaSynth.setCountInVolume');
console.log('  setMetronomeVolume:', JSON.stringify(metroMsgs.map(m => m.value)));
console.log('  setCountInVolume:', JSON.stringify(ciMsgs.map(m => m.value)));
check('llega metronomeVolume=1 al sintetizador', metroMsgs.some(m => m.value === '1'));
check('llega countInVolume=1 al sintetizador', ciMsgs.some(m => m.value === '1'));

await page.locator('.transport__play').click();
await page.waitForTimeout(3000);
const withMetro = await transportSnapshot(page);
console.log('  reproduciendo con metrónomo:', JSON.stringify(withMetro));
check('reproduce con metrónomo/count-in sin romperse', withMetro.playLabel === '❚❚' && (withMetro.scrubValue ?? 0) > 0);
await page.locator('.transport__play').click();
await page.waitForTimeout(500);
await metro.uncheck();
await countIn.uncheck();
await page.waitForTimeout(500);
check('no se produjeron errores nuevos', errCount() === errBefore, `${errCount() - errBefore} nuevos`);

section('10. Loop por rango de compases');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(500);
const from = page.locator('.loopbars label:has-text("Desde") input');
const to = page.locator('.loopbars label:has-text("Hasta") input');
await from.fill('3');
await page.waitForTimeout(300);
await to.fill('5');
await page.waitForTimeout(500);
console.log('  rango en la UI:', await from.inputValue(), '-', await to.inputValue());
const repeat = page.locator('.toggle:has-text("Repetir segmento") input');
check('el checkbox de repetir se habilita al fijar rango', !(await repeat.isDisabled()));
await repeat.check();
check('repetir segmento activo', await repeat.isChecked());

msgs = await page.evaluate(() => window.__wmsgs);
const ranges = msgs.filter(m => m.cmd === 'alphaSynth.setPlaybackRange').map(m => m.value);
const loops = msgs.filter(m => m.cmd === 'alphaSynth.setIsLooping').map(m => m.value);
console.log('  setPlaybackRange:', JSON.stringify(ranges.slice(-4)));
console.log('  setIsLooping:', JSON.stringify(loops.slice(-4)));
check('se envió un playbackRange al sintetizador', ranges.some(r => r && r !== 'null'));
check('se envió isLooping=true', loops.some(l => l === 'true'));

// Saltar al compás 3 y reproducir: la posición debe quedar dentro del rango y
// volver al inicio al llegar al final.
await page.locator('.transport__play').click();
const barsSeen = [];
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(1000);
  const s = await transportSnapshot(page);
  barsSeen.push(s.bar);
}
await page.locator('.transport__play').click();
console.log('  compases observados:', JSON.stringify(barsSeen));
const nums = barsSeen.map(b => Number(/Compás (\d+)/.exec(b ?? '')?.[1] ?? NaN));
check('la reproducción se queda dentro de 3..5', nums.every(n => n >= 3 && n <= 5), JSON.stringify(nums));
let wrapped = false;
for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) wrapped = true;
check('vuelve al inicio del rango (loop real)', wrapped, JSON.stringify(nums));
await shot(page, '06-loop');

section('10b. Botón "Compás actual"');
await page.locator('.side__actions button:has-text("Quitar")').click();
await page.waitForTimeout(400);
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(400);
for (let i = 0; i < 7; i++) {
  await page.locator('.transport__buttons button[title="Compás siguiente (→)"]').click();
  await page.waitForTimeout(250);
}
const atBar = await transportSnapshot(page);
await page.locator('.side__actions button:has-text("Compás actual")').click();
await page.waitForTimeout(600);
console.log(`  estaba en ${atBar.bar}; loop quedó en ${await from.inputValue()}..${await to.inputValue()}`);
check('"Compás actual" fija el loop en el compás 8', (await from.inputValue()) === '8' && (await to.inputValue()) === '8');
check('"Compás actual" activa la repetición', await repeat.isChecked());

section('10c. Arrastrar sobre la tablatura del panel maestro');
await page.locator('.side__actions button:has-text("Quitar")').click();
await page.waitForTimeout(500);
const vp = await page.locator('.pane__viewport[data-pane="0"]').boundingBox();
const surface = await page.locator('.pane__viewport[data-pane="0"] svg').first().boundingBox();
console.log('  viewport:', JSON.stringify(vp), 'svg:', JSON.stringify(surface));
const y = vp.y + 260;
await page.mouse.move(vp.x + 150, y);
await page.mouse.down();
for (let x = 180; x <= 700; x += 40) {
  await page.mouse.move(vp.x + x, y, { steps: 2 });
  await page.waitForTimeout(40);
}
await page.mouse.up();
await page.waitForTimeout(1200);
const dragFrom = await from.inputValue();
const dragTo = await to.inputValue();
console.log(`  loop tras arrastrar: ${dragFrom} .. ${dragTo}`);
check('arrastrar marca un rango de loop', dragFrom !== dragTo || Number(dragFrom) > 1, `${dragFrom}..${dragTo}`);
await shot(page, '06-drag-loop');
check('arrastrar no provoca errores', logs.pageErrors.length === 0, JSON.stringify(logs.pageErrors.slice(0, 1)));

section('11. Secciones');
const sectionCount = await page.locator('.sections li').count();
const emptyMsg = await page.locator('.side__block:has(h2:text("Secciones")) .side__empty').textContent().catch(() => null);
console.log(`  elementos de sección: ${sectionCount}; mensaje: ${emptyMsg}`);
// Que este .gp5 no trae marcadores está comprobado aparte, parseándolo en
// node; aquí solo se observa lo que muestra la UI. Las secciones de verdad se
// prueban en `11-secciones.mjs` con un fixture que sí los lleva.
if (sectionCount > 0) {
  const labels = await page.locator('.sections li').allTextContents();
  console.log('  secciones:', JSON.stringify(labels));
  await page.locator('.sections li button').nth(Math.min(2, sectionCount - 1)).click();
  await page.waitForTimeout(1000);
  const s = await transportSnapshot(page);
  console.log('  tras clic en sección:', JSON.stringify(s));
  check('el clic en una sección salta de compás', !/Compás 1 \//.test(s.bar ?? ''), s.bar ?? '');
} else {
  console.log('  NO SE PUDO PROBAR: el archivo de prueba no trae marcadores de sección.');
}

dumpLogs(logs);
await browser.close();
