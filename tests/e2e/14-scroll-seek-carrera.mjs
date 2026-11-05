/**
 * Aísla por qué el seek no deja el cursor a la vista pese a `scrollToCursor()`.
 *
 * Hipótesis: `scrollToCursor()` se llama inmediatamente después de asignar
 * `tickPosition`, pero alphaTab mueve el cursor de forma asíncrona (pasa por
 * el worker del sintetizador). El scroll se hace entonces contra la posición
 * ANTERIOR del cursor. Si es así, repetir el mismo seek una segunda vez sí
 * debería dejar la vista en su sitio.
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
    if (!vp || !cur) return null;
    const vr = vp.getBoundingClientRect();
    const cr = cur.getBoundingClientRect();
    return {
      scrollTop: Math.round(vp.scrollTop),
      offset: Math.round(cr.top - vr.top),
      visible: cr.top >= vr.top - 5 && cr.top <= vr.bottom,
      bar: document.querySelector('.transport__bar')?.textContent ?? null,
    };
  });

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

section('A. Un solo seek largo');
console.log('  antes:', JSON.stringify(await probe()));
await seekTo(0.7);
await page.waitForTimeout(300);
console.log('  +300ms :', JSON.stringify(await probe()));
await page.waitForTimeout(2700);
const once = await probe();
console.log('  +3s    :', JSON.stringify(once));
check('tras un seek el cursor queda a la vista', once?.visible === true, JSON.stringify(once));

section('B. Repetir el MISMO seek (prueba de la carrera)');
await seekTo(0.7);
await page.waitForTimeout(3000);
const twice = await probe();
console.log('  tras repetir:', JSON.stringify(twice));
check('repetir el seek sí deja el cursor a la vista', twice?.visible === true, JSON.stringify(twice));
await shot(page, '14-seek-repetido');

section('C. Seek corto (compás siguiente) desde una vista ya desplazada');
await page.locator('.transport__buttons button[title="Compás siguiente (→)"]').click();
await page.waitForTimeout(2000);
const nextBar = await probe();
console.log('  tras compás siguiente:', JSON.stringify(nextBar));
check('el salto de un compás mantiene el cursor a la vista', nextBar?.visible === true, JSON.stringify(nextBar));

section('D. Stop: ¿vuelve la vista al principio?');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(2500);
const stopped = await probe();
console.log('  tras stop:', JSON.stringify(stopped));
check('stop deja el cursor (compás 1) a la vista', stopped?.visible === true, JSON.stringify(stopped));

section('E. Clic en sección desde el principio');
// Con el .gp5 real no hay secciones; se usa el salto de 4 compases del doble →.
await page.evaluate(() => document.activeElement?.blur?.());
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(100);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(2500);
const jumped = await probe();
console.log('  tras doble →:', JSON.stringify(jumped));
check('el salto de sección deja el cursor a la vista', jumped?.visible === true, JSON.stringify(jumped));

dumpLogs(logs);
await browser.close();
