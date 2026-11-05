/**
 * ¿Pelea el `scrollToCursor()` de 20 Hz con el scroll manual del usuario?
 *
 * Se desplaza con ↓ en mitad de la reproducción y se observa durante varios
 * segundos qué hace el viewport, midiendo a la vez el tick para distinguir
 * "el auto-scroll no reacciona" de "la reproducción se paró".
 */
import { openApp, loadTabFile, waitPlayerReady, section, check, dumpLogs, shot } from './harness.mjs';

const { browser, page, logs } = await openApp();
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2500);

const probe = () =>
  page.evaluate(() => {
    const vp = document.querySelector('.pane__viewport[data-pane="0"]');
    const cur = vp?.querySelector('.at-cursor-bar');
    const vr = vp.getBoundingClientRect();
    const cr = cur?.getBoundingClientRect();
    return {
      scroll: Math.round(vp.scrollTop),
      tick: Number(document.querySelector('.transport__scrub input')?.value ?? -1),
      bar: document.querySelector('.transport__bar')?.textContent ?? null,
      curTop: cr ? Math.round(cr.top - vr.top) : null,
      visible: cr ? cr.top >= vr.top - 5 && cr.top <= vr.bottom : null,
    };
  });

section('R2b. Scroll manual en mitad de la reproducción');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(600);
await page.locator('.transport__play').click();
await page.evaluate(() => document.activeElement?.blur?.());
await page.waitForTimeout(2000);
console.log('  t=2s  ', JSON.stringify(await probe()));

for (let i = 0; i < 4; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
}
await page.waitForTimeout(700);
const justAfter = await probe();
console.log('  tras 4x ↓', JSON.stringify(justAfter));

const series = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(2000);
  series.push(await probe());
  console.log(`  +${(i + 1) * 2}s  `, JSON.stringify(series[i]));
}
await page.locator('.transport__play').click();

check('la reproducción no se detuvo con el scroll manual', series.at(-1).tick > justAfter.tick + 1000, `tick ${justAfter.tick} -> ${series.at(-1).tick}`);
check('el viewport vuelve a seguir al cursor', new Set(series.map(s => s.scroll)).size > 1, JSON.stringify(series.map(s => s.scroll)));
check('el cursor acaba visible otra vez', series.at(-1).visible === true, JSON.stringify(series.map(s => s.visible)));
await shot(page, '16-scroll-manual');

section('R2c. Scroll con la rueda del ratón en mitad de la reproducción');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(600);
await page.locator('.transport__play').click();
await page.waitForTimeout(2000);
const vpBox = await page.locator('.pane__viewport[data-pane="0"]').boundingBox();
await page.mouse.move(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(800);
const wheel0 = await probe();
console.log('  tras rueda:', JSON.stringify(wheel0));
// El reenganche ocurre al cambiar de SISTEMA; con 5-6 compases por fila eso
// puede tardar ~10 s, así que se muestrea con ventana suficiente.
const serie = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(2500);
  serie.push(await probe());
  console.log(`  +${((i + 1) * 2.5).toFixed(1)}s:`, JSON.stringify(serie[i]));
}
await page.locator('.transport__play').click();
check('la rueda desplaza la vista', wheel0.scroll > 200, String(wheel0.scroll));
check(
  'el auto-scroll recupera el cursor tras la rueda (al cambiar de sistema)',
  serie.some(s => s.visible === true),
  JSON.stringify(serie.map(s => `${s.bar}:${s.visible}`)),
);

dumpLogs(logs);
await browser.close();
