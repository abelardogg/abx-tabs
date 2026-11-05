/**
 * Copia la fuente musical (Bravura) y el soundfont de alphaTab a `public/`.
 *
 * El plugin de Vite de alphaTab también sabe copiarlos, pero lo hace en su
 * hook `buildStart`, que corre después de que el dev server construyó su
 * índice de `public/`: en el primer arranque los archivos quedan en disco pero
 * se sirven como 404. Copiarlos desde `predev`/`prebuild` garantiza que ya
 * estén ahí cuando Vite mira.
 *
 * Se mantienen los archivos de licencia junto a los binarios: Bravura es OFL
 * y el soundfont trae su propio LICENSE.
 */
import { cp, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(projectRoot, 'node_modules', '@coderline', 'alphatab', 'dist');
const targetDir = join(projectRoot, 'public');
const subdirs = ['font', 'soundfont'];

try {
  await access(join(sourceDir, 'alphaTab.mjs'), constants.F_OK);
} catch {
  console.error(
    `[alphatab-assets] No se encontró alphaTab en ${sourceDir}. ¿Falta "npm install"?`,
  );
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });

for (const subdir of subdirs) {
  await cp(join(sourceDir, subdir), join(targetDir, subdir), {
    recursive: true,
    force: true,
  });
  console.log(`[alphatab-assets] public/${subdir} actualizado`);
}
