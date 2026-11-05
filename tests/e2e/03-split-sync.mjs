/** Puntos 5 y 6: split screen 1/2/3 paneles, render independiente y sincronía de cursor. */
import {
  openApp,
  loadTabFile,
  waitPlayerReady,
  paneRenderStats,
  cursorPos,
  transportSnapshot,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const { browser, page, logs } = await openApp();

// Espiar los mensajes que alphaTab manda a sus workers: así se puede verificar
// que los paneles seguidores reciben masterVolume = 0.
await page.addInitScript(() => {
  window.__wmsgs = [];
  const wrap = (proto, tag) => {
    const original = proto.postMessage;
    proto.postMessage = function (msg, ...rest) {
      try {
        if (msg && typeof msg === 'object') {
          window.__wmsgs.push({ tag, cmd: msg.cmd ?? null, value: msg.value ?? null });
        }
      } catch {
        /* ignorar */
      }
      return original.call(this, msg, ...rest);
    };
  };
  wrap(Worker.prototype, 'worker');
  if (window.MessagePort) wrap(MessagePort.prototype, 'port');
});
await page.reload({ waitUntil: 'load' });

await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(1500);

const setPanes = async n => {
  await page.locator(`.topbar__split button:has-text("${n}")`).click();
  await page.waitForTimeout(4000);
};

section('5. Split screen');
for (const n of [1, 2, 3]) {
  await setPanes(n);
  const count = await page.locator('.pane').count();
  check(`el botón ${n} crea ${n} paneles`, count === n, `paneles=${count}`);
  if (n === 3) {
    const box = await page.locator('.app__panes').boundingBox();
    const boxes = await page.locator('.pane').evaluateAll(els =>
      els.map(e => {
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.x), w: Math.round(r.width), y: Math.round(r.y) };
      }),
    );
    console.log('  layout paneles:', JSON.stringify(boxes), 'contenedor w=', Math.round(box?.width ?? 0));
    check('están lado a lado (misma y, x creciente)', boxes.every(b => b.y === boxes[0].y) && boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x);
  }
}

const selects = page.locator('.pane__track');
const chosen = await selects.evaluateAll(els => els.map(e => e.value));
console.log('  pistas por panel (por defecto):', JSON.stringify(chosen));
check('cada panel abre con una pista distinta', new Set(chosen).size === 3, JSON.stringify(chosen));

const stats = [];
for (let p = 0; p < 3; p++) stats.push(await paneRenderStats(page, p));
stats.forEach((s, i) =>
  console.log(`  panel ${i}: paths=${s?.pathCount} texts=${s?.textCount} hint=${s?.hint}`),
);
// "Extra Riffs" es casi toda silencios: se mide por textos (compases, trastes,
// cifras de compás), no por paths de notación.
check(
  'los 3 paneles renderizan contenido',
  stats.every(s => (s?.textCount ?? 0) > 20 && (s?.svgChildNodes ?? 0) > 50),
  JSON.stringify(stats.map(s => ({ t: s?.textCount, c: s?.svgChildNodes }))),
);
const sigs = stats.map(s => JSON.stringify(s?.sampleTexts));
check('los 3 paneles muestran tablatura distinta', new Set(sigs).size === 3);
await shot(page, '03-tres-paneles');

section('5b. Cambiar la pista de un panel no afecta a los otros');
const before = stats.map(s => JSON.stringify(s?.sampleTexts));
await selects.nth(1).selectOption({ index: 4 }); // Drums
await page.waitForTimeout(3500);
const after = [];
for (let p = 0; p < 3; p++) after.push(JSON.stringify((await paneRenderStats(page, p))?.sampleTexts));
const vals = await selects.evaluateAll(els => els.map(e => e.value));
console.log('  pistas tras el cambio:', JSON.stringify(vals));
check('el panel 1 cambió de render', before[1] !== after[1]);
check('el panel 0 NO cambió', before[0] === after[0]);
check('el panel 2 NO cambió', before[2] === after[2]);
await shot(page, '03-cambio-pista');

// Volver a una pista con cuerdas para las pruebas de cursor.
await selects.nth(1).selectOption({ index: 1 });
await page.waitForTimeout(3000);

section('6. Sincronía de cursor entre paneles');
const sample = async () => {
  const c = [];
  for (let p = 0; p < 3; p++) c.push(await cursorPos(page, p));
  return c;
};

await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(800);
const c0 = await sample();
console.log('  t0:', JSON.stringify(c0.map(c => c?.bar?.transform)));
check('los 3 paneles tienen cursor montado', c0.every(c => c?.hasCursorWrapper));

await page.locator('.transport__play').click();
await page.waitForTimeout(4000);
const c1 = await sample();
console.log('  t1 (reproduciendo):', JSON.stringify(c1.map(c => c?.bar?.transform)));
await shot(page, '03-sync-playing');
await page.waitForTimeout(4000);
const c2 = await sample();
console.log('  t2 (reproduciendo):', JSON.stringify(c2.map(c => c?.bar?.transform)));
await page.locator('.transport__play').click();
await page.waitForTimeout(500);

for (let p = 0; p < 3; p++) {
  const moved01 = JSON.stringify(c0[p]?.bar) !== JSON.stringify(c1[p]?.bar);
  const moved12 = JSON.stringify(c1[p]?.bar) !== JSON.stringify(c2[p]?.bar);
  check(`panel ${p}: el cursor avanza durante la reproducción`, moved01 && moved12, `t0->t1 ${moved01}, t1->t2 ${moved12}`);
}

section('6b. Seek manual: ¿los seguidores siguen al maestro?');
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(600);
const seekBase = await sample();
const scrub = page.locator('.transport__scrub input[type=range]');
const max = Number(await scrub.getAttribute('max'));
await scrub.evaluate((el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, Math.round(max * 0.6));
await page.waitForTimeout(1500);
const seeked = await sample();
console.log('  tras seek:', JSON.stringify(seeked.map(c => c?.bar?.transform)));
for (let p = 0; p < 3; p++) {
  check(
    `panel ${p}: el cursor saltó con el seek`,
    JSON.stringify(seekBase[p]?.bar) !== JSON.stringify(seeked[p]?.bar),
  );
}
// Los paneles muestran la misma partitura: si están sincronizados, el cursor
// debería estar aproximadamente en el mismo sitio horizontal.
console.log('  scrollTop por panel:', JSON.stringify(await page.evaluate(() =>
  [0, 1, 2].map(p => document.querySelector(`.pane__viewport[data-pane="${p}"]`)?.scrollTop ?? null))));
await shot(page, '03-sync-seek');

section('6c. masterVolume de los seguidores');
const msgs = await page.evaluate(() => window.__wmsgs ?? []);
const cmds = [...new Set(msgs.map(m => m.cmd).filter(Boolean))];
console.log('  comandos vistos en workers:', JSON.stringify(cmds.slice(0, 40)));
const volMsgs = msgs.filter(m => /volume/i.test(m.cmd ?? ''));
console.log('  mensajes de volumen:', JSON.stringify(volMsgs));
const zeroVols = volMsgs.filter(m => /master/i.test(m.cmd ?? '') && m.value === 0);
check(
  'se envió masterVolume=0 a los 2 seguidores',
  zeroVols.length >= 2,
  `${zeroVols.length} mensajes masterVolume=0 de ${volMsgs.length} de volumen`,
);

const sfReqs = logs.requests.filter(r => /\.sf2/.test(r.url));
console.log(`  peticiones de soundfont totales: ${sfReqs.length}`);

dumpLogs(logs);
await browser.close();
