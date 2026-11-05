/** Punto 4: play/pause, stop, slider, compás anterior/siguiente, presets de velocidad. */
import {
  openApp,
  loadTabFile,
  waitPlayerReady,
  transportSnapshot,
  cursorPos,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const { browser, page, logs } = await openApp();
await loadTabFile(page);
const ready = await waitPlayerReady(page);
check('player listo', ready);
await page.waitForTimeout(1500);

const play = page.locator('.transport__play');
const stopBtn = page.locator('.transport__buttons button[title="Detener"]');
const prevBar = page.locator('.transport__buttons button[title="Compás anterior (←)"]');
const nextBar = page.locator('.transport__buttons button[title="Compás siguiente (→)"]');
const scrub = page.locator('.transport__scrub input[type=range]');

section('4a. Play -> la posición avanza');
console.log('  antes:', JSON.stringify(await transportSnapshot(page)));
const cursorBefore = await cursorPos(page, 0);
await play.click();
await page.waitForTimeout(2500);
const during = await transportSnapshot(page);
console.log('  durante:', JSON.stringify(during));
const cursorDuring = await cursorPos(page, 0);
check('el botón muestra pausa (estado playing)', during.playLabel === '❚❚', `label=${during.playLabel}`);
check('el tick avanzó', (during.scrubValue ?? 0) > 100, `tick=${during.scrubValue}`);
check('el tiempo avanzó', during.time !== '0:00', `time=${during.time}`);
check(
  'el cursor de compás se movió',
  JSON.stringify(cursorBefore?.bar) !== JSON.stringify(cursorDuring?.bar),
  `${JSON.stringify(cursorBefore?.bar)} -> ${JSON.stringify(cursorDuring?.bar)}`,
);
await shot(page, '02-playing');

section('4b. Pause');
await play.click();
await page.waitForTimeout(800);
const paused1 = await transportSnapshot(page);
await page.waitForTimeout(1200);
const paused2 = await transportSnapshot(page);
console.log('  pausa:', JSON.stringify(paused1), '->', JSON.stringify(paused2));
check('el botón vuelve a play', paused2.playLabel === '▶', `label=${paused2.playLabel}`);
check('la posición se congela al pausar', paused1.scrubValue === paused2.scrubValue, `${paused1.scrubValue} vs ${paused2.scrubValue}`);

section('4c. Stop vuelve a 0');
await stopBtn.click();
await page.waitForTimeout(1200);
const stopped = await transportSnapshot(page);
console.log('  stop:', JSON.stringify(stopped));
check('tick vuelve a 0', (stopped.scrubValue ?? -1) <= 1, `tick=${stopped.scrubValue}`);
check('compás vuelve a 1', /Compás 1 \//.test(stopped.bar ?? ''), stopped.bar ?? '');
check('tiempo vuelve a 0:00', stopped.time === '0:00', stopped.time ?? '');

section('4d. Compás siguiente / anterior');
await nextBar.click();
await page.waitForTimeout(600);
const b2 = await transportSnapshot(page);
await nextBar.click();
await page.waitForTimeout(600);
const b3 = await transportSnapshot(page);
await prevBar.click();
await page.waitForTimeout(600);
const b2b = await transportSnapshot(page);
console.log(`  ${stopped.bar} -> ${b2.bar} -> ${b3.bar} -> ${b2b.bar}`);
check('siguiente avanza un compás', b2.bar?.includes('Compás 2 /') === true, b2.bar ?? '');
check('siguiente avanza otro', b3.bar?.includes('Compás 3 /') === true, b3.bar ?? '');
check('anterior retrocede', b2b.bar?.includes('Compás 2 /') === true, b2b.bar ?? '');

const cursorBar2 = await cursorPos(page, 0);
console.log('  cursor tras navegar por compases:', JSON.stringify(cursorBar2?.bar));

section('4e. Slider de posición mueve el cursor');
const max = Number(await scrub.getAttribute('max'));
const target = Math.round(max * 0.5);
await scrub.evaluate((el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, target);
await page.waitForTimeout(1200);
const seeked = await transportSnapshot(page);
const cursorSeek = await cursorPos(page, 0);
console.log(`  pedido tick=${target} -> ${JSON.stringify(seeked)}`);
check('el tick saltó cerca del valor pedido', Math.abs((seeked.scrubValue ?? 0) - target) < max * 0.1, `tick=${seeked.scrubValue}`);
check(
  'el cursor se movió respecto al compás 2',
  JSON.stringify(cursorBar2?.bar) !== JSON.stringify(cursorSeek?.bar),
  `${JSON.stringify(cursorBar2?.bar)} -> ${JSON.stringify(cursorSeek?.bar)}`,
);
await shot(page, '02-seek');

section('4f. Presets de velocidad');
for (const label of ['25%', '50%', '75%', '100%']) {
  await page.locator('.transport__presets button', { hasText: label }).click();
  await page.waitForTimeout(300);
  const s = await transportSnapshot(page);
  const applied = await page.evaluate(() => {
    const el = document.querySelector('.transport__speed input[type=range]');
    return el ? Number(el.value) : null;
  });
  const onButton = await page
    .locator('.transport__presets button.is-on')
    .textContent()
    .catch(() => null);
  check(`preset ${label}`, s.speed === label && onButton === label, `output=${s.speed} slider=${applied} is-on=${onButton}`);
}

// ¿El playbackSpeed llega de verdad al player? Se mide cuánto avanza el tick.
section('4g. La velocidad afecta de verdad al avance');
async function measure(presetLabel) {
  await page.locator('.transport__presets button', { hasText: presetLabel }).click();
  await page.locator('.transport__buttons button[title="Detener"]').click();
  await page.waitForTimeout(500);
  await play.click();
  await page.waitForTimeout(3000);
  const s = await transportSnapshot(page);
  await play.click();
  await page.waitForTimeout(500);
  return s.scrubValue ?? 0;
}
const at100 = await measure('100%');
const at25 = await measure('25%');
console.log(`  3s a 100% -> tick ${at100}; 3s a 25% -> tick ${at25}`);
check('a 25% avanza bastante menos que a 100%', at25 > 0 && at25 < at100 * 0.55, `ratio=${(at25 / Math.max(1, at100)).toFixed(2)}`);

dumpLogs(logs);
await browser.close();
