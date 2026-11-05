/**
 * Genera `con-secciones.gp`, el fixture que necesita `11-secciones.mjs`.
 *
 * La partitura se sintetiza con alphaTex en vez de partir de un archivo real:
 * así el fixture se puede regenerar en cualquier clon del repositorio, sin
 * depender de tablaturas del usuario (que no se versionan) y sin meter
 * material ajeno en el repositorio.
 *
 *   node tests/e2e/fixtures/generar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { exporter, importer, model } from '@coderline/alphatab';

const target = path.join(import.meta.dirname, 'con-secciones.gp');

/** Compases suficientes para que quepan todos los marcadores de abajo. */
const BAR_COUNT = 96;

const MARKS = [
  [0, 'Intro'],
  [8, 'Verse'],
  [24, 'Chorus'],
  [48, 'Solo'],
  [80, 'Outro'],
];

// Un compás llano de cuatro negras en la 6ª cuerda, repetido. El contenido da
// igual: lo que se prueba son los marcadores y la navegación entre ellos.
const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
  const fret = i % 5;
  return `${fret}.6 ${fret}.6 ${fret}.6 ${fret}.6`;
});
const tex = `\\title "Fixture con secciones"\n\\track "Guitarra"\n:4 ${bars.join(' | ')}`;

const score = importer.ScoreLoader.loadAlphaTex(tex);

if (score.masterBars.length < BAR_COUNT) {
  throw new Error(
    `Se esperaban ${BAR_COUNT} compases y se generaron ${score.masterBars.length}`,
  );
}

for (const [barIndex, text] of MARKS) {
  const section = new model.Section();
  section.text = text;
  section.marker = text.slice(0, 3).toUpperCase();
  score.masterBars[barIndex].section = section;
}

const bytes = new exporter.Gp7Exporter().export(score, null);
fs.writeFileSync(target, Buffer.from(bytes));
console.log(
  `escrito ${target} (${bytes.length} bytes, ${score.masterBars.length} compases, ${MARKS.length} secciones)`,
);
