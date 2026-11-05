/**
 * Detalle del punto 6: ¿el viewport de cada panel sigue al cursor?
 *
 * El cursor puede moverse en el DOM y aun así quedar fuera de la zona visible
 * si el panel no hace scroll. Aquí se mide scrollTop y la posición del cursor
 * respecto al viewport, que es lo que el usuario realmente ve.
 */
import { openApp, loadTabFile, waitPlayerReady, section, check, dumpLogs, shot } from './harness.mjs';

const { browser, page, logs } = await openApp();
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(1500);

await page.locator('.topbar__split button:has-text("3")').click();
await page.waitForTimeout(6000);
// Pistas con contenido denso en los tres paneles.
const selects = page.locator('.pane__track');
await selects.nth(2).selectOption('3'); // Bass Guitar
await page.waitForTimeout(3500);

const probe = () =>
  page.evaluate(() =>
    [0, 1, 2].map(p => {
      const vp = document.querySelector(`.pane__viewport[data-pane="${p}"]`);
      if (!vp) return null;
      const cur = vp.querySelector('.at-cursor-bar');
      const vr = vp.getBoundingClientRect();
      const cr = cur?.getBoundingClientRect();
      return {
        scrollTop: Math.round(vp.scrollTop),
        scrollHeight: vp.scrollHeight,
        cursorTopInViewport: cr ? Math.round(cr.top - vr.top) : null,
        // Visible si el cursor cae dentro del alto del viewport.
        visible: cr ? cr.top >= vr.top - 5 && cr.top <= vr.bottom : null,
      };
    }),
  );

section('6d. Scroll de seguimiento durante la reproducción');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(800);
const samples = [await probe()];
await page.locator('.transport__play').click();
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(3000);
  samples.push(await probe());
}
await page.locator('.transport__play').click();

samples.forEach((s, i) =>
  console.log(
    `  t${i * 3}s  ` +
      s
        .map(
          (p, idx) =>
            `P${idx}{scroll=${p.scrollTop} curTop=${p.cursorTopInViewport} vis=${p.visible}}`,
        )
        .join('  '),
  ),
);
await shot(page, '04-scroll-playing');

for (let p = 0; p < 3; p++) {
  const scrolls = samples.map(s => s[p].scrollTop);
  const moved = new Set(scrolls).size > 1;
  const visibleAll = samples.every(s => s[p].visible);
  check(`panel ${p}: el viewport hace scroll siguiendo al cursor`, moved, `scrollTop=${JSON.stringify(scrolls)}`);
  check(`panel ${p}: el cursor se mantiene visible todo el rato`, visibleAll, JSON.stringify(samples.map(s => s[p].visible)));
}

section('6e. Scroll tras un seek manual (sin reproducir)');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(1500);
const beforeSeek = await probe();
const scrub = page.locator('.transport__scrub input[type=range]');
const max = Number(await scrub.getAttribute('max'));
await scrub.evaluate((el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, Math.round(max * 0.7));
await page.waitForTimeout(4000);
const afterSeek = await probe();
console.log('  antes:', JSON.stringify(beforeSeek));
console.log('  después:', JSON.stringify(afterSeek));
console.log('  compás:', await page.locator('.transport__bar').textContent());
for (let p = 0; p < 3; p++) {
  check(`panel ${p}: el viewport salta a la zona del seek`, afterSeek[p].visible === true, `curTop=${afterSeek[p].cursorTopInViewport} scroll=${afterSeek[p].scrollTop}`);
}
await shot(page, '04-scroll-seek');

section('6f. ¿El seguidor sigue en el MISMO compás que el maestro?');
// Se compara el número de compás que alphaTab pinta junto al cursor de cada
// panel, buscando el `.at-cursor-bar` y el número de compás más cercano.
const bars = await page.evaluate(() =>
  [0, 1, 2].map(p => {
    const vp = document.querySelector(`.pane__viewport[data-pane="${p}"]`);
    const cur = vp?.querySelector('.at-cursor-bar');
    if (!vp || !cur) return null;
    const cr = cur.getBoundingClientRect();
    // Los números de compás son textos pequeños a la izquierda de cada sistema.
    const nums = [...vp.querySelectorAll('svg text')]
      .filter(t => /^\d{1,3}$/.test((t.textContent ?? '').trim()))
      .map(t => {
        const r = t.getBoundingClientRect();
        return { n: Number(t.textContent.trim()), x: r.x, y: r.y };
      });
    // El marcador de compás del sistema donde cae el cursor.
    const sameRow = nums.filter(n => Math.abs(n.y - cr.y) < 40).sort((a, b) => a.x - b.x);
    return { cursorY: Math.round(cr.y), nearestBarLabels: sameRow.slice(0, 4).map(n => n.n) };
  }),
);
console.log('  etiquetas de compás junto al cursor por panel:', JSON.stringify(bars));

dumpLogs(logs);
await browser.close();
