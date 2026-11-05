/**
 * Punto 6, parte de audio: solo el panel maestro debe sonar.
 *
 * En headless no se puede escuchar nada, así que se mide lo observable: a qué
 * worker de alphaSynth se le manda `setMasterVolume` y con qué valor, y qué
 * workers generan muestras (`alphaSynth.output.addSamples`) al reproducir.
 * Cada worker se etiqueta por orden de creación.
 */
import { openApp, loadTabFile, waitPlayerReady, section, check, dumpLogs } from './harness.mjs';

const { browser, page, logs } = await openApp();
await page.addInitScript(() => {
  window.__byWorker = {};
  let seq = 0;
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.__id = seq++;
      window.__byWorker[this.__id] = { url: String(args[0]).slice(-60), msgs: [] };
      this.addEventListener('message', ev => {
        const cmd = ev.data?.cmd;
        if (cmd) {
          const bucket = window.__byWorker[this.__id];
          bucket.incoming = bucket.incoming ?? {};
          bucket.incoming[cmd] = (bucket.incoming[cmd] ?? 0) + 1;
        }
      });
    }
    postMessage(msg, ...rest) {
      try {
        if (msg?.cmd) {
          const b = window.__byWorker[this.__id];
          b.msgs.push({ cmd: msg.cmd, value: msg.value ?? null });
        }
      } catch {
        /* ignorar */
      }
      return super.postMessage(msg, ...rest);
    }
  };
});
await page.reload({ waitUntil: 'load' });
await loadTabFile(page);
await waitPlayerReady(page);
await page.waitForTimeout(2000);
await page.locator('.topbar__split button:has-text("3")').click();
await page.waitForTimeout(7000);

section('6g. masterVolume por instancia de sintetizador');
// La instancia de alphaTab se recrea al abrir el archivo, así que hay workers
// de instancias ya destruidas; los vigentes son los últimos creados, uno por
// panel.
const allSynths = await page.evaluate(() =>
  Object.entries(window.__byWorker)
    .filter(([, w]) => w.msgs.some(m => m.cmd?.startsWith('alphaSynth.')))
    .map(([id, w]) => ({
      id: Number(id),
      masterVolumes: w.msgs.filter(m => m.cmd === 'alphaSynth.setMasterVolume').map(m => m.value),
    })),
);
console.log(`  sintetizadores creados en total: ${allSynths.length}`, JSON.stringify(allSynths));
const synths = allSynths.slice(-3);
console.log('  vigentes (uno por panel):', JSON.stringify(synths));
check('quedan 3 sintetizadores vigentes', synths.length === 3, `${synths.length}`);
const finalVols = synths.map(s => s.masterVolumes.at(-1));
console.log('  último masterVolume de cada uno:', JSON.stringify(finalVols));
check('el primero (maestro) queda con volumen 1', finalVols[0] === 1, String(finalVols[0]));
check('los otros dos quedan en 0', finalVols.slice(1).every(v => v === 0), JSON.stringify(finalVols.slice(1)));

section('6h. ¿Qué sintetizadores generan muestras al reproducir?');
await page.evaluate(() => {
  for (const w of Object.values(window.__byWorker)) w.incoming = {};
});
await page.locator('.transport__play').click();
await page.waitForTimeout(6000);
await page.locator('.transport__play').click();
const produced = (
  await page.evaluate(() =>
    Object.entries(window.__byWorker)
      .filter(([, w]) => w.msgs.some(m => m.cmd?.startsWith('alphaSynth.')))
      .map(([id, w]) => ({ id: Number(id), addSamples: w.incoming?.['alphaSynth.output.addSamples'] ?? 0 })),
  )
).slice(-3);
console.log('  bloques de muestras emitidos por cada sintetizador:', JSON.stringify(produced));
check('el maestro genera audio', (produced[0]?.addSamples ?? 0) > 0, String(produced[0]?.addSamples));
console.log(
  '  NOTA: los seguidores pueden seguir generando muestras (silenciadas por masterVolume=0);',
);
console.log('  en headless no se puede comprobar el sonido real, solo el volumen configurado.');

dumpLogs(logs);
await browser.close();
