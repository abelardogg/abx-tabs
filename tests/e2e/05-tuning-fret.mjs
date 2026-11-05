/**
 * Puntos 7 y 8.
 *
 * 7. "Transposición de tono": las notas de las cuerdas del panel lateral suben
 *    o bajan, pero los trastes de la tablatura NO cambian.
 * 8. "Ajuste de notas": los trastes de la tablatura SÍ cambian en la cantidad
 *    de semitonos indicada y el panel se re-renderiza.
 */
import {
  openApp,
  loadTabFile,
  waitPlayerReady,
  paneFrets,
  paneRenderStats,
  section,
  check,
  dumpLogs,
  shot,
} from './harness.mjs';

const { browser, page, logs } = await openApp();
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2500);

const tuningNotes = () => page.locator('.tuning__note').allTextContents();
const tuningName = () => page.locator('.tuning__name').textContent().catch(() => null);
const stepper = label => page.locator(`.stepper[aria-label="${label}"]`);
const TONE = 'Transposición de afinación en semitonos';
const FRET = 'Ajuste de notas en semitonos';
const bump = async (label, times) => {
  const s = stepper(label);
  // El stepper es [ − ] <output> [ + ] [ ⟲ ]: el `+` es el segundo botón.
  const btn = times > 0 ? s.locator('button').nth(1) : s.locator('button').nth(0);
  for (let i = 0; i < Math.abs(times); i++) {
    await btn.click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2500);
};
const reset = label => stepper(label).locator('.stepper__reset').click();

section('7. Transposición de tono');
const notes0 = await tuningNotes();
const frets0 = await paneFrets(page, 0);
const name0 = await tuningName();
console.log('  cuerdas:', JSON.stringify(notes0), '| afinación:', name0);
console.log('  trastes (primeros 30):', JSON.stringify(frets0.slice(0, 30)));

await bump(TONE, -2);
const notesDown = await tuningNotes();
const fretsDown = await paneFrets(page, 0);
console.log('  tras -2:', JSON.stringify(notesDown), '| afinación:', await tuningName());
check('el valor del stepper es -2', (await stepper(TONE).locator('output').textContent()) === '-2');
check('las notas de las cuerdas cambian', JSON.stringify(notes0) !== JSON.stringify(notesDown));
check(
  'los trastes de la tablatura NO cambian',
  JSON.stringify(frets0) === JSON.stringify(fretsDown),
  `${JSON.stringify(frets0.slice(0, 12))} vs ${JSON.stringify(fretsDown.slice(0, 12))}`,
);
check(
  'se muestra la nota original ("era X")',
  (await page.locator('.tuning__orig').count()) > 0,
);
await shot(page, '05-tono-menos2');

await bump(TONE, 4); // -2 -> +2
const notesUp = await tuningNotes();
const fretsUp = await paneFrets(page, 0);
console.log('  tras +2:', JSON.stringify(notesUp));
check('subir 2 da notas distintas de bajar 2', JSON.stringify(notesUp) !== JSON.stringify(notesDown));
check('los trastes siguen sin cambiar', JSON.stringify(frets0) === JSON.stringify(fretsUp));

await reset(TONE);
await page.waitForTimeout(1200);
check('el reset devuelve las notas originales', JSON.stringify(await tuningNotes()) === JSON.stringify(notes0));

section('8. Ajuste de notas (trastes)');
const statsBefore = await paneRenderStats(page, 0);
await bump(FRET, 2);
const frets2 = await paneFrets(page, 0);
const statsAfter = await paneRenderStats(page, 0);
console.log('  trastes original:', JSON.stringify(frets0.slice(0, 20)));
console.log('  trastes con +2 :', JSON.stringify(frets2.slice(0, 20)));
check('el valor del stepper es +2', (await stepper(FRET).locator('output').textContent()) === '+2');
check('el panel se re-renderizó (sigue con contenido)', (statsAfter?.pathCount ?? 0) > 20 && (statsAfter?.textCount ?? 0) > 10, `paths=${statsAfter?.pathCount} texts=${statsAfter?.textCount}`);
check('la vista NO quedó en blanco', statsAfter?.hint === null, `hint=${statsAfter?.hint}`);
check('los números de traste cambiaron', JSON.stringify(frets0) !== JSON.stringify(frets2));

// Comparación posición a posición: con +2 cada traste debería valer +2.
const pairs = frets0.slice(0, 24).map((f, i) => [Number(f), Number(frets2[i])]);
const deltas = pairs.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).map(([a, b]) => b - a);
const counts = deltas.reduce((m, d) => ((m[d] = (m[d] ?? 0) + 1), m), {});
console.log('  deltas traste a traste:', JSON.stringify(counts));
check('la mayoría de los trastes suben exactamente 2', (counts[2] ?? 0) > deltas.length * 0.6, JSON.stringify(counts));
console.log('  nota del panel lateral:', await page.locator('.side__note').textContent().catch(() => null));
await shot(page, '05-ajuste-mas2');

await bump(FRET, -5); // +2 -> -3
const fretsM3 = await paneFrets(page, 0);
const stats3 = await paneRenderStats(page, 0);
console.log('  trastes con -3 :', JSON.stringify(fretsM3.slice(0, 20)));
const d3 = frets0
  .slice(0, 24)
  .map((f, i) => Number(fretsM3[i]) - Number(f))
  .filter(Number.isFinite);
const c3 = d3.reduce((m, d) => ((m[d] = (m[d] ?? 0) + 1), m), {});
console.log('  deltas con -3:', JSON.stringify(c3));
check('con -3 los trastes bajan 3', (c3[-3] ?? 0) > d3.length * 0.5, JSON.stringify(c3));
check('sigue renderizando tras varios cambios', (stats3?.pathCount ?? 0) > 20, `paths=${stats3?.pathCount}`);

section('8b. El ajuste de notas también afecta a los paneles seguidores');
await reset(FRET);
await page.waitForTimeout(1500);
await page.locator('.topbar__split button:has-text("2")').click();
await page.waitForTimeout(5000);
const p1Before = await paneFrets(page, 1);
await bump(FRET, 2);
const p1After = await paneFrets(page, 1);
const p0After = await paneFrets(page, 0);
console.log('  panel 1 antes:', JSON.stringify(p1Before.slice(0, 15)));
console.log('  panel 1 después:', JSON.stringify(p1After.slice(0, 15)));
check('el panel seguidor también desplaza sus trastes', JSON.stringify(p1Before) !== JSON.stringify(p1After));
check('el panel maestro también', JSON.stringify(p0After) !== JSON.stringify(frets0));
await shot(page, '05-ajuste-dos-paneles');

section('8c. El transporte sigue vivo tras el re-render');
const ready2 = await page.evaluate(() => !document.querySelector('.transport__play')?.disabled);
check('el botón de play sigue habilitado', ready2);
await page.locator('.transport__play').click();
await page.waitForTimeout(2500);
const tick = await page.evaluate(() => Number(document.querySelector('.transport__scrub input').value));
check('la reproducción sigue funcionando tras el re-render', tick > 100, `tick=${tick}`);
await page.locator('.transport__play').click();

dumpLogs(logs);
await browser.close();
