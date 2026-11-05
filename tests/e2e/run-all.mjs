/**
 * Ejecuta todos los scripts de prueba en orden.
 *
 *   PW_ROOT=<dir con playwright instalado> node tests/e2e/run-all.mjs
 *
 * Variables:
 *   PW_ROOT   directorio donde está instalado `playwright` (por defecto, cwd)
 *   BASE_URL  URL del dev server (por defecto http://localhost:5173)
 *   SHOTS     carpeta donde dejar las capturas (por defecto <PW_ROOT>/shots)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const here = import.meta.dirname;
const SCRIPTS = [
  '01-load.mjs',
  '02-transport.mjs',
  '03-split-sync.mjs',
  '04-scroll-follow.mjs',
  '05-tuning-fret.mjs',
  '06-loop-metro-sections.mjs',
  '07-loop-diagnostico.mjs',
  '08-loop-repro-minimo.mjs',
  '09-teclado-cierre.mjs',
  '10-loop-trigger.mjs',
  '11-secciones.mjs',
  '12-drag-loop.mjs',
  '13-audio-paneles.mjs',
  '14-scroll-seek-carrera.mjs',
  '15-regresiones.mjs',
  '16-scroll-manual-vs-auto.mjs',
  '17-coste-ciclo-vida.mjs',
  '18-scroll-diferido-riesgos.mjs',
];

const only = process.argv.slice(2);
const list = only.length ? SCRIPTS.filter(s => only.some(o => s.includes(o))) : SCRIPTS;

const summary = [];
for (const script of list) {
  console.log(`\n\n######## ${script} ########`);
  const res = spawnSync(process.execPath, [path.join(here, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  summary.push({ script, code: res.status });
}

console.log('\n\n######## resumen ########');
for (const s of summary) console.log(`  ${s.code === 0 ? 'ok  ' : 'ERR '} ${s.script} (exit ${s.code})`);
