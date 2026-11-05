/**
 * Punto 11: lista de secciones y salto al compás.
 *
 * El .gp5 de pruebas no trae marcadores, así que se usa un fixture derivado de
 * él con 5 secciones añadidas. Si falta, se regenera con:
 *
 *   node tests/e2e/fixtures/generar.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import {
  openApp,
  waitPlayerReady,
  transportSnapshot,
  REPO,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const FIXTURE = path.join(REPO, 'tests', 'e2e', 'fixtures', 'con-secciones.gp');
// El fixture es un artefacto generado y no se versiona, así que en un clon
// nuevo hay que crearlo antes de la primera ejecución.
if (!fs.existsSync(FIXTURE)) {
  console.log('Falta el fixture; generándolo…');
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [path.join(REPO, 'tests', 'e2e', 'fixtures', 'generar.mjs')], {
    stdio: 'inherit',
  });
}

const { browser, page, logs } = await openApp();
await page.locator('input[type=file]').setInputFiles(FIXTURE);
await page.locator('.pane__viewport[data-pane="0"] svg').first().waitFor({ state: 'attached', timeout: 60000 });
await waitPlayerReady(page);
await page.waitForTimeout(2500);

section('11. Lista de secciones');
const items = await page.locator('.sections li').allTextContents();
console.log('  secciones:', JSON.stringify(items));
check('se listan las 5 secciones del archivo', items.length === 5, `${items.length}`);
check('con su compás y su etiqueta', /1.*Intro/.test(items[0] ?? ''), items[0] ?? '');
await shot(page, '11-secciones');

section('11b. Clic en una sección salta a su compás');
const expected = [1, 9, 25, 49, 81];
for (let i = 0; i < items.length; i++) {
  await page.locator('.sections li button').nth(i).click();
  await page.waitForTimeout(900);
  const s = await transportSnapshot(page);
  const n = Number(/Compás (\d+)/.exec(s.bar ?? '')?.[1]);
  check(`sección ${i + 1} salta al compás ${expected[i]}`, n === expected[i], `compás=${n} (${s.bar})`);
}

section('11c. La sección activa se resalta');
const onLabel = await page.locator('.sections li button.is-on').textContent().catch(() => null);
console.log('  sección marcada como activa:', onLabel);
check('la sección actual queda resaltada', onLabel !== null, String(onLabel));

section('11d. ¿El viewport sigue al salto de sección?');
const vis = await page.evaluate(() => {
  const vp = document.querySelector('.pane__viewport[data-pane="0"]');
  const cur = vp?.querySelector('.at-cursor-bar');
  if (!vp || !cur) return null;
  const vr = vp.getBoundingClientRect();
  const cr = cur.getBoundingClientRect();
  return { scrollTop: Math.round(vp.scrollTop), offset: Math.round(cr.top - vr.top), visible: cr.top >= vr.top - 5 && cr.top <= vr.bottom };
});
console.log('  cursor tras saltar a "Outro":', JSON.stringify(vis));
check('el cursor del salto queda a la vista', vis?.visible === true, JSON.stringify(vis));
await shot(page, '11-salto-outro');

section('11e. Doble ← / → salta entre secciones');
await page.locator('.sections li button').nth(0).click();
await page.waitForTimeout(800);
// Nada de clicar en el viewport para quitar el foco: con `enableSeekToClick`
// el clic reposiciona el player y falsea la prueba.
await page.evaluate(() => document.activeElement?.blur?.());
await page.waitForTimeout(600);
const s0 = (await transportSnapshot(page)).bar;
await page.keyboard.press('Control+ArrowRight');
await page.waitForTimeout(120);
await page.keyboard.press('Control+ArrowRight');
await page.waitForTimeout(1200);
const s1 = (await transportSnapshot(page)).bar;
console.log(`  doble Ctrl+→: ${s0} -> ${s1}`);
check('el doble Ctrl+→ salta a la siguiente sección (compás 9)', /Compás 9 \//.test(s1 ?? ''), s1 ?? '');

dumpLogs(logs);
await browser.close();
