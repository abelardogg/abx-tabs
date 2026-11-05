/**
 * Coste del nuevo ciclo de vida: la instancia de alphaTab se recrea por
 * archivo, y también existe una instancia "vacía" antes de abrir nada y
 * después de cerrar. Cada instancia crea su worker de sintetizador y descarga
 * el soundfont (1,35 MB).
 */
import { openApp, loadTabFile, waitPlayerReady, TAB_FILE, section, check, dumpLogs } from './harness.mjs';

const { browser, page, logs } = await openApp();
const sf2 = () => logs.requests.filter(r => /\.sf2/.test(r.url)).length;
const bytes = () => sf2() * 1351896;

section('Descargas de soundfont por fase (1 panel)');
await page.waitForTimeout(3000);
console.log(`  app recién abierta, sin archivo: ${sf2()} descargas`);
check('sin archivo abierto no debería descargarse el soundfont', sf2() === 0, `${sf2()} descargas`);

await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2000);
console.log(`  tras abrir el archivo: ${sf2()} descargas`);

await page.locator('.topbar__close').click();
await page.waitForTimeout(2500);
console.log(`  tras cerrar: ${sf2()} descargas`);

await page.locator('input[type=file]').setInputFiles(TAB_FILE);
await waitPlayerReady(page, 60000);
await page.waitForTimeout(2000);
console.log(`  tras reabrir: ${sf2()} descargas (${(bytes() / 1024 / 1024).toFixed(1)} MB)`);
check('abrir-cerrar-reabrir no pasa de 3 descargas', sf2() <= 3, `${sf2()}`);

section('Instancias de alphaTab vivas');
const counts = await page.evaluate(() => ({
  superficies: document.querySelectorAll('.at-surface').length,
  paneles: document.querySelectorAll('.pane').length,
}));
console.log('  ', JSON.stringify(counts));
check('una superficie de alphaTab por panel', counts.superficies === counts.paneles, JSON.stringify(counts));

dumpLogs(logs, { assetsOnly: true });
await browser.close();
