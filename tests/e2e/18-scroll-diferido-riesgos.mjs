/**
 * Riesgos del scroll diferido (`scrollToCursorWhenSettled`: inmediato + rAF +
 * 150 ms).
 *
 * 1. Que los reintentos pendientes no den un tirón de vista si el usuario
 *    desplaza a mano o pulsa play justo después de un salto.
 * 2. Que cerrar el archivo justo después de un seek no deje errores ni la
 *    vista en un estado raro cuando los reintentos caen sobre una instancia
 *    ya destruida.
 */
import {
  openApp,
  loadTabFile,
  waitPlayerReady,
  transportSnapshot,
  paneRenderStats,
  TAB_FILE,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const { browser, page, logs } = await openApp();
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2500);

const probe = (pane = 0) =>
  page.evaluate(p => {
    const vp = document.querySelector(`.pane__viewport[data-pane="${p}"]`);
    if (!vp) return null;
    const cur = vp.querySelector('.at-cursor-bar');
    const vr = vp.getBoundingClientRect();
    const cr = cur?.getBoundingClientRect();
    return {
      scroll: Math.round(vp.scrollTop),
      offset: cr ? Math.round(cr.top - vr.top) : null,
      visible: cr ? cr.top >= vr.top - 5 && cr.top <= vr.bottom : null,
      bar: document.querySelector('.transport__bar')?.textContent ?? null,
    };
  }, pane);

const seekTo = async fraction => {
  const scrub = page.locator('.transport__scrub input[type=range]');
  const max = Number(await scrub.getAttribute('max'));
  await scrub.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, Math.round(max * fraction));
};

const errCount = () =>
  logs.pageErrors.length + logs.consoleLogs.filter(l => l.type === 'error').length;

section('S1. Scroll manual DENTRO de la ventana de reintentos (0-150 ms)');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(1500);
await page.evaluate(() => document.activeElement?.blur?.());
await seekTo(0.5);
// Sin esperar: el reintento de rAF y el de 150 ms siguen pendientes.
await page.mouse.move(400, 500);
await page.mouse.wheel(0, 900);
const t0 = await probe();
await page.waitForTimeout(400);
const t400 = await probe();
await page.waitForTimeout(2600);
const t3s = await probe();
await page.waitForTimeout(3000);
const t6s = await probe();
console.log('  justo tras la rueda:', JSON.stringify(t0));
console.log('  +400ms            :', JSON.stringify(t400));
console.log('  +3s               :', JSON.stringify(t3s));
console.log('  +6s (reposo)      :', JSON.stringify(t6s));
check(
  'la vista se estabiliza: no hay tirones tardíos tras los reintentos',
  t3s.scroll === t6s.scroll,
  `+3s=${t3s.scroll} +6s=${t6s.scroll}`,
);
check('el seek acaba dejando el cursor a la vista', t3s.visible === true, JSON.stringify(t3s));
await shot(page, '18-seek-rueda');

section('S2. Play DENTRO de la ventana de reintentos');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(1500);
await seekTo(0.5);
await page.locator('.transport__play').click(); // sin esperar a los reintentos
await page.waitForTimeout(500);
const p0 = await probe();
await page.waitForTimeout(3000);
const p3 = await probe();
await page.waitForTimeout(3000);
const p6 = await probe();
await page.locator('.transport__play').click();
console.log('  +0.5s:', JSON.stringify(p0));
console.log('  +3.5s:', JSON.stringify(p3));
console.log('  +6.5s:', JSON.stringify(p6));
const barOf = s => Number(/Compás (\d+)/.exec(s.bar ?? '')?.[1] ?? NaN);
check('la reproducción arranca desde el punto del seek', barOf(p0) > 40, String(p0.bar));
check('y sigue avanzando', barOf(p6) > barOf(p3), `${p3.bar} -> ${p6.bar}`);
check('el cursor queda visible mientras reproduce', p3.visible === true && p6.visible === true, `${p3.visible} / ${p6.visible}`);

section('S3. Seek con 3 paneles: ¿los tres siguen al primer intento?');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(1000);
await page.locator('.topbar__split button:has-text("3")').click();
await page.waitForTimeout(7000);
await seekTo(0.7);
await page.waitForTimeout(3000);
const panes = [await probe(0), await probe(1), await probe(2)];
console.log('  tras un solo seek:', JSON.stringify(panes));
for (let p = 0; p < 3; p++) {
  check(`panel ${p}: cursor visible tras el primer seek`, panes[p].visible === true, JSON.stringify(panes[p]));
}
await shot(page, '18-seek-3paneles');

section('S4. Cerrar el archivo JUSTO después de un seek');
const errBefore = errCount();
await seekTo(0.35);
await page.locator('.topbar__close').click(); // sin esperar: reintentos en vuelo
await page.waitForTimeout(3000);
// Cerrar vuelve a un solo panel, así que los paneles 2 y 3 ya no existen.
const paneCount = await page.locator('.pane').count();
const closed = [await paneRenderStats(page, 0)];
check('cerrar vuelve a un solo panel', paneCount === 1, `${paneCount} paneles`);
const tr = await transportSnapshot(page);
console.log('  paneles tras cerrar:', JSON.stringify(closed.map(c => ({ p: c?.pathCount, t: c?.textCount, hint: c?.hint }))));
console.log('  transporte:', JSON.stringify(tr));
check('ningún panel conserva partitura', closed.every(c => (c?.pathCount ?? 0) === 0 && (c?.textCount ?? 0) === 0), JSON.stringify(closed.map(c => c?.textCount)));
check('se ve el hint inicial', /Abre un archivo/.test(closed[0]?.hint ?? ''), String(closed[0]?.hint));
check('el transporte queda limpio', tr.playDisabled === true && (tr.scrubValue ?? 1) === 0 && tr.time === '0:00', JSON.stringify(tr));
check('aparece el dropzone', (await page.locator('.dropzone').count()) === 1);
check('cerrar tras un seek no lanza errores', errCount() === errBefore, JSON.stringify(logs.pageErrors.slice(0, 1)));
await shot(page, '18-cerrado-tras-seek');

section('S5. Cerrar y reabrir en bucle rápido con seeks de por medio');
for (let i = 0; i < 3; i++) {
  await page.locator('input[type=file]').setInputFiles(TAB_FILE);
  await page.locator('.pane__viewport[data-pane="0"] svg').first().waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await seekTo(0.2 + i * 0.2);
  await page.waitForTimeout(100); // cierre dentro de la ventana de 150 ms
  await page.locator('.topbar__close').click();
  await page.waitForTimeout(1500);
}
console.log(`  errores acumulados: pageerror=${logs.pageErrors.length}, console.error=${logs.consoleLogs.filter(l => l.type === 'error').length}`);
check('el bucle no lanza errores', errCount() === errBefore, JSON.stringify(logs.pageErrors.slice(0, 1)));
const afterLoop = await paneRenderStats(page, 0);
check('la vista queda limpia al final', (afterLoop?.textCount ?? 0) === 0, `texts=${afterLoop?.textCount}`);

section('S6. Tras todo eso, la app sigue usable');
await page.locator('input[type=file]').setInputFiles(TAB_FILE);
await page.locator('.pane__viewport[data-pane="0"] svg').first().waitFor({ state: 'attached', timeout: 60000 });
const ready = await waitPlayerReady(page, 60000);
await page.waitForTimeout(2000);
check('el player vuelve a estar listo', ready);
await page.locator('.transport__play').click();
await page.waitForTimeout(2500);
const finalPlay = await transportSnapshot(page);
await page.locator('.transport__play').click();
console.log('  ', JSON.stringify(finalPlay));
check('reproduce normalmente', finalPlay.playLabel === '❚❚' && (finalPlay.scrubValue ?? 0) > 100, `tick=${finalPlay.scrubValue}`);
await shot(page, '18-final');

dumpLogs(logs);
await browser.close();
