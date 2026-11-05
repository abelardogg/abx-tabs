/** Puntos 12 y 13: atajos de teclado y cerrar archivo. */
import {
  openApp,
  loadTabFile,
  waitPlayerReady,
  transportSnapshot,
  paneRenderStats,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const { browser, page, logs } = await openApp();
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2000);

const blur = () => page.evaluate(() => document.activeElement?.blur?.());
const focusInfo = () => page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`);

section('12a. Espacio = play / pause (foco en el body)');
await blur();
console.log('  foco:', await focusInfo());
await page.keyboard.press(' ');
await page.waitForTimeout(2500);
const playing = await transportSnapshot(page);
console.log('  tras Espacio:', JSON.stringify(playing));
check('Espacio arranca la reproducción', playing.playLabel === '❚❚' && (playing.scrubValue ?? 0) > 100, `tick=${playing.scrubValue}`);
await page.keyboard.press(' ');
await page.waitForTimeout(1000);
const pausedNow = await transportSnapshot(page);
check('Espacio vuelve a pausar', pausedNow.playLabel === '▶', pausedNow.playLabel ?? '');

section('12b. ← / → = compás anterior / siguiente');
await page.locator('.transport__buttons button[title="Detener"]').click();
await blur();
await page.waitForTimeout(800);
// La flecha sola recorre notas; el compás va con Ctrl.
const tickOf = async () => (await transportSnapshot(page)).scrubValue;
const t0 = await tickOf();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
const t1 = await tickOf();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
const t2 = await tickOf();
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(500);
const t3 = await tickOf();
console.log(`  ticks ${t0} -> ${t1} -> ${t2} -> ${t3}`);
check('→ avanza a la nota siguiente', t1 > t0, `${t0} -> ${t1}`);
check('→ otra vez avanza', t2 > t1, `${t1} -> ${t2}`);
check('← vuelve a la nota anterior', t3 === t1, `${t2} -> ${t3} (esperado ${t1})`);

const barA = (await transportSnapshot(page)).bar;
await page.keyboard.press('Control+ArrowRight');
await page.waitForTimeout(600);
const barB = (await transportSnapshot(page)).bar;
await page.keyboard.press('Control+ArrowLeft');
await page.waitForTimeout(600);
const barC = (await transportSnapshot(page)).bar;
console.log(`  compases ${barA} -> ${barB} -> ${barC}`);
const num = b => Number(/Compás (\d+)/.exec(b ?? '')?.[1]);
check('Ctrl+→ avanza un compás', num(barB) === num(barA) + 1, `${barA} -> ${barB}`);
check('Ctrl+← retrocede un compás', num(barC) === num(barB) - 1, `${barB} -> ${barC}`);

section('12c. Doble Ctrl+flecha rápida (<320 ms) = salto de sección');
// El archivo no trae marcadores, así que el salto debe caer a 4 compases.
await page.locator('.transport__buttons button[title="Detener"]').click();
await blur();
await page.waitForTimeout(800);
const d0 = (await transportSnapshot(page)).bar;
await page.keyboard.press('Control+ArrowRight');
await page.waitForTimeout(120);
await page.keyboard.press('Control+ArrowRight');
await page.waitForTimeout(900);
const d1 = (await transportSnapshot(page)).bar;
console.log(`  doble →: ${d0} -> ${d1}`);
const n0 = Number(/Compás (\d+)/.exec(d0 ?? '')?.[1]);
const n1 = Number(/Compás (\d+)/.exec(d1 ?? '')?.[1]);
check('la doble pulsación salta más de un compás', n1 - n0 > 1, `${n0} -> ${n1} (delta ${n1 - n0})`);
console.log(`  (con el archivo sin marcadores, el salto esperado es 1 compás de la primera pulsación + 4 de la segunda = 5)`);

await page.waitForTimeout(600);
const e0 = (await transportSnapshot(page)).bar;
await page.keyboard.press('Control+ArrowLeft');
await page.waitForTimeout(120);
await page.keyboard.press('Control+ArrowLeft');
await page.waitForTimeout(900);
const e1 = (await transportSnapshot(page)).bar;
console.log(`  doble ←: ${e0} -> ${e1}`);
check('la doble pulsación hacia atrás retrocede más de un compás',
  Number(/Compás (\d+)/.exec(e0)?.[1]) - Number(/Compás (\d+)/.exec(e1)?.[1]) > 1,
  `${e0} -> ${e1}`);

section('12d. ↑ / ↓ desplazan el panel activo');
await blur();
const scrollOf = p => page.evaluate(i => document.querySelector(`.pane__viewport[data-pane="${i}"]`)?.scrollTop ?? null, p);
const s0 = await scrollOf(0);
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
}
await page.waitForTimeout(800);
const s1 = await scrollOf(0);
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);
}
await page.waitForTimeout(800);
const s2 = await scrollOf(0);
console.log(`  scrollTop: ${s0} -> ${s1} -> ${s2}`);
check('↓ desplaza hacia abajo', (s1 ?? 0) > (s0 ?? 0), `${s0} -> ${s1}`);
check('↑ desplaza hacia arriba', (s2 ?? 0) < (s1 ?? 0), `${s1} -> ${s2}`);

section('12e. El panel activo es el que se desplaza');
await page.locator('.topbar__split button:has-text("2")').click();
await page.waitForTimeout(5000);
await page.locator('.pane').nth(1).click({ position: { x: 200, y: 400 } });
await page.waitForTimeout(600);
const activeIs1 = await page.evaluate(() => [...document.querySelectorAll('.pane')].findIndex(p => p.classList.contains('pane--active')));
console.log('  panel activo:', activeIs1);
await blur();
const a0 = [await scrollOf(0), await scrollOf(1)];
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
}
await page.waitForTimeout(900);
const a1 = [await scrollOf(0), await scrollOf(1)];
console.log(`  scrollTop por panel: ${JSON.stringify(a0)} -> ${JSON.stringify(a1)}`);
check('se desplaza el panel 2 (el activo)', a1[1] > a0[1], `${a0[1]} -> ${a1[1]}`);
check('el panel 1 no se mueve', a1[0] === a0[0], `${a0[0]} -> ${a1[0]}`);

section('12f. El teclado NO secuestra las teclas con el foco en un input/select');
await page.locator('.topbar__split button:has-text("1")').click();
await page.waitForTimeout(3500);
await page.locator('.transport__buttons button[title="Detener"]').click();
await blur();
await page.waitForTimeout(500);

// Input numérico del loop: ← → deben mover el cursor de texto, no el compás.
const loopInput = page.locator('.loopbars input').first();
await loopInput.click();
await loopInput.fill('10');
// Fijar el rango reposiciona el player en su primer compás: hay que dejar que
// se asiente antes de medir, o el salto se confunde con el de las flechas.
await page.waitForTimeout(2000);
const barBeforeInput = (await transportSnapshot(page)).bar;
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(600);
const barAfterInput = (await transportSnapshot(page)).bar;
console.log(`  con foco en <input>: ${barBeforeInput} -> ${barAfterInput}`);
check('las flechas no mueven el transporte con foco en <input>', barBeforeInput === barAfterInput, `${barBeforeInput} -> ${barAfterInput}`);
const stateBeforeSpace = (await transportSnapshot(page)).playLabel;
await page.keyboard.press(' ');
await page.waitForTimeout(800);
const stateAfterSpace = (await transportSnapshot(page)).playLabel;
check('Espacio no arranca el player con foco en <input>', stateBeforeSpace === stateAfterSpace, `${stateBeforeSpace} -> ${stateAfterSpace}`);

// Select de pista.
const sel = page.locator('.pane__track').first();
await sel.focus();
const barBeforeSel = (await transportSnapshot(page)).bar;
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(800);
const barAfterSel = (await transportSnapshot(page)).bar;
console.log(`  con foco en <select>: ${barBeforeSel} -> ${barAfterSel}`);
check('las flechas no mueven el transporte con foco en <select>', barBeforeSel === barAfterSel, `${barBeforeSel} -> ${barAfterSel}`);

section('12g. ¿Funciona el teclado justo después de pulsar un botón?');
// Caso real: el usuario pulsa ▶ con el ratón y luego usa el teclado sin
// volver a hacer clic en la partitura.
await page.locator('.transport__buttons button[title="Detener"]').click();
await page.waitForTimeout(600);
await page.locator('.transport__buttons button[title="Compás siguiente (→)"]').click();
await page.waitForTimeout(800);
console.log('  foco tras pulsar el botón:', await focusInfo());
// La flecha sola avanza una nota, que casi siempre cae dentro del mismo
// compás: hay que mirar el tick, no el número de compás.
const kb0 = (await transportSnapshot(page)).scrubValue;
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
const kb1 = (await transportSnapshot(page)).scrubValue;
console.log(`  → tras pulsar un botón del transporte: tick ${kb0} -> ${kb1}`);
check('las flechas siguen funcionando tras usar un botón', kb1 > kb0, `${kb0} -> ${kb1}`);

const scrollBefore = await scrollOf(0);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(900);
const scrollAfter = await scrollOf(0);
check('↓ sigue desplazando tras usar un botón', scrollAfter !== scrollBefore, `${scrollBefore} -> ${scrollAfter}`);

section('13. Cerrar archivo');
const errBefore = logs.pageErrors.length;
await page.locator('.topbar__close').click();
await page.waitForTimeout(2500);
const after = await paneRenderStats(page, 0);
const t = await transportSnapshot(page);
console.log('  panel tras cerrar:', JSON.stringify(after && { ...after, sampleTexts: after.sampleTexts.slice(0, 5) }));
console.log('  transporte tras cerrar:', JSON.stringify(t));
check('aparece el dropzone inicial', (await page.locator('.dropzone').count()) === 1);
check('desaparece el nombre del archivo', (await page.locator('.topbar__name').count()) === 0);
check('el panel queda vacío', (after?.pathCount ?? 0) === 0 && (after?.textCount ?? 0) === 0, `paths=${after?.pathCount} texts=${after?.textCount}`);
check('se muestra el hint "Abre un archivo…"', /Abre un archivo/.test(after?.hint ?? ''), after?.hint ?? '');
check('el transporte queda deshabilitado', t.playDisabled === true);
check('no hay barra de compases', t.bar === null, t.bar ?? '');
check('cerrar no lanza errores', logs.pageErrors.length === errBefore, JSON.stringify(logs.pageErrors.slice(errBefore)));
await shot(page, '09-cerrado');

section('13b. Volver a abrir el mismo archivo tras cerrar');
await loadTabFile(page);
await page.waitForTimeout(3000);
const reopened = await paneRenderStats(page, 0);
check('se vuelve a renderizar', (reopened?.pathCount ?? 0) > 20, `paths=${reopened?.pathCount}`);
const readyAgain = await waitPlayerReady(page, 45000);
check('el player vuelve a estar listo', readyAgain);
await shot(page, '09-reabierto');

dumpLogs(logs);
await browser.close();
