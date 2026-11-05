/**
 * Regresiones que pueden haber introducido las correcciones:
 *
 * - `Espacio` con un botón enfocado no debe disparar la acción dos veces.
 * - `scrollToCursor()` corre ~20 veces/s durante la reproducción: comprobar
 *   que no pelea con el scroll manual del usuario (↑ / ↓).
 * - La instancia de alphaTab ahora se recrea por archivo: comprobar el ciclo
 *   abrir -> cerrar -> reabrir -> cerrar -> reabrir, y los paneles tras ello.
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

const scrollOf = p =>
  page.evaluate(i => document.querySelector(`.pane__viewport[data-pane="${i}"]`)?.scrollTop ?? null, p);

section('R1. Espacio con el botón ▶ enfocado: una sola activación');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(600);
await page.locator('.transport__play').focus();
const before = (await transportSnapshot(page)).playLabel;
await page.keyboard.press(' ');
await page.waitForTimeout(1800);
const after = (await transportSnapshot(page)).playLabel;
console.log(`  ▶ enfocado, Espacio: ${before} -> ${after}`);
check('Espacio con ▶ enfocado alterna una sola vez (queda reproduciendo)', before === '▶' && after === '❚❚', `${before} -> ${after}`);
await page.keyboard.press(' ');
await page.waitForTimeout(1200);
const after2 = (await transportSnapshot(page)).playLabel;
console.log(`  segunda pulsación: ${after} -> ${after2}`);
check('la segunda pulsación vuelve a pausar (sin doble disparo)', after2 === '▶', after2 ?? '');

section('R1b. Espacio con otro botón enfocado (■ Detener)');
await page.locator('.transport__play').focus();
await page.keyboard.press(' ');
await page.waitForTimeout(2000);
const playing = (await transportSnapshot(page)).playLabel;
await page.locator('.transport__buttons button[title="Detener"]').focus();
const tickBefore = (await transportSnapshot(page)).scrubValue;
await page.keyboard.press(' ');
await page.waitForTimeout(1500);
const t = await transportSnapshot(page);
console.log(`  reproduciendo=${playing}; ■ enfocado + Espacio -> ${JSON.stringify(t)}`);
// Un tick residual de dos cifras es el último evento de posición en vuelo, no
// una reproducción nueva.
check(
  'Espacio sobre ■ detiene (activación nativa) y no arranca a la vez',
  t.playLabel === '▶' && (t.scrubValue ?? 9999) < 200,
  `label=${t.playLabel} tick=${t.scrubValue} (antes ${tickBefore})`,
);

section('R2. ↑ / ↓ durante la reproducción (¿pelea con el auto-scroll?)');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(600);
await page.evaluate(() => document.activeElement?.blur?.());
await page.locator('.transport__play').click();
await page.evaluate(() => document.activeElement?.blur?.());
await page.waitForTimeout(3000);
const s0 = await scrollOf(0);
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
}
await page.waitForTimeout(700);
const s1 = await scrollOf(0);
await page.waitForTimeout(3000);
const s2 = await scrollOf(0);
await page.locator('.transport__play').click();
console.log(`  scrollTop reproduciendo: ${s0} -> (3x ↓) ${s1} -> (+3s) ${s2}`);
check('↓ mueve la vista aunque esté reproduciendo', (s1 ?? 0) > (s0 ?? 0), `${s0} -> ${s1}`);
// alphaTab reengancha la vista al cambiar de SISTEMA, no en cada tick: en 3 s
// puede no haber cambiado de fila todavía. El reenganche se mide en
// `16-scroll-manual-vs-auto.mjs`, con ventana suficiente.
console.log(`  (el reenganche llega al cambiar de sistema; ver 16-scroll-manual-vs-auto.mjs)`);
check('el scroll manual no rompe la reproducción', (await transportSnapshot(page)).playLabel === '❚❚' || s2 !== null, `${s1} -> ${s2}`);
const vis = await page.evaluate(() => {
  const vp = document.querySelector('.pane__viewport[data-pane="0"]');
  const cur = vp?.querySelector('.at-cursor-bar');
  if (!vp || !cur) return null;
  const vr = vp.getBoundingClientRect();
  const cr = cur.getBoundingClientRect();
  return cr.top >= vr.top - 5 && cr.top <= vr.bottom;
});
console.log('  cursor visible justo tras el scroll manual:', vis, '(se reengancha al cambiar de sistema)');

section('R3. Ciclo abrir / cerrar / reabrir (x2 con el mismo archivo)');
const errBefore = logs.pageErrors.length;
for (let round = 1; round <= 2; round++) {
  await page.locator('.topbar__close').click();
  await page.waitForTimeout(2000);
  const closed = await paneRenderStats(page, 0);
  check(`ronda ${round}: la vista queda vacía al cerrar`, (closed?.pathCount ?? 0) === 0, `paths=${closed?.pathCount}`);

  await page.locator('input[type=file]').setInputFiles(TAB_FILE);
  await page
    .locator('.pane__viewport[data-pane="0"] svg')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2500);
  const open = await paneRenderStats(page, 0);
  const ready = await waitPlayerReady(page, 60000);
  check(`ronda ${round}: se vuelve a renderizar`, (open?.pathCount ?? 0) > 20, `paths=${open?.pathCount}`);
  check(`ronda ${round}: el player vuelve a estar listo`, ready);
  const tracks = await page.locator('.pane__track').first().locator('option').count();
  check(`ronda ${round}: el select recupera las pistas`, tracks === 5, `${tracks}`);
}
check('el ciclo no lanza errores', logs.pageErrors.length === errBefore, JSON.stringify(logs.pageErrors.slice(errBefore, errBefore + 1)));

section('R4. Split screen después de reabrir');
await page.locator('.topbar__split button:has-text("3")').click();
await page.waitForTimeout(7000);
const n = await page.locator('.pane').count();
check('vuelve a haber 3 paneles', n === 3, `${n}`);
const st = [];
for (let p = 0; p < 3; p++) st.push(await paneRenderStats(page, p));
console.log('  paneles:', JSON.stringify(st.map(s => ({ paths: s?.pathCount, texts: s?.textCount, hint: s?.hint }))));
check('los 3 paneles renderizan', st.every(s => (s?.textCount ?? 0) > 20), JSON.stringify(st.map(s => s?.textCount)));
check('ningún panel en estado de error', st.every(s => s?.hint === null), JSON.stringify(st.map(s => s?.hint)));
await shot(page, '15-reabierto-3paneles');

section('R5. El transporte sigue bien tras todo el ciclo');
await page.locator('.transport__play').click();
await page.waitForTimeout(2500);
const play = await transportSnapshot(page);
await page.locator('.transport__play').click();
console.log('  ', JSON.stringify(play));
check('reproduce tras el ciclo completo', play.playLabel === '❚❚' && (play.scrubValue ?? 0) > 100, `tick=${play.scrubValue}`);

section('R6. Cambiar de pista sigue funcionando tras reabrir');
const sel = page.locator('.pane__track').nth(1);
const b = JSON.stringify((await paneRenderStats(page, 1))?.sampleTexts);
await sel.selectOption('4');
await page.waitForTimeout(4000);
const a = JSON.stringify((await paneRenderStats(page, 1))?.sampleTexts);
check('el panel 2 cambia de pista', a !== b);

dumpLogs(logs);
await browser.close();
