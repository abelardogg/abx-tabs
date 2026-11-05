import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Expone la carpeta `TABS/` del proyecto para poder elegir un archivo desde un
 * desplegable, sin tener que buscarlo en el disco cada vez.
 *
 * Es un plugin SOLO de desarrollo (`apply: 'serve'`). En el build de
 * producción no existe, y es deliberado: las tablaturas son del usuario y no
 * deben acabar dentro de una imagen de Docker ni servidas por nginx. Cuando el
 * endpoint no responde, la interfaz simplemente no enseña el desplegable.
 */

const EXTENSIONS = new Set(['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gp7']);
const LIST_ROUTE = '/__tabs/list';
const FILE_ROUTE = '/__tabs/file/';

export interface TabsLibraryOptions {
  /** Carpeta a exponer, relativa a la raíz del proyecto. */
  directory?: string;
}

export function tabsLibrary({ directory = 'TABS' }: TabsLibraryOptions = {}): Plugin {
  let baseDir = '';

  return {
    name: 'abx-tabs-library',
    apply: 'serve',

    configResolved(config) {
      baseDir = resolve(config.root, directory);
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';

        if (url === LIST_ROUTE || url.startsWith(`${LIST_ROUTE}?`)) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ directory, files: await listTabs(baseDir) }));
          return;
        }

        if (!url.startsWith(FILE_ROUTE)) {
          next();
          return;
        }

        const requested = decodeURIComponent(url.slice(FILE_ROUTE.length).split('?')[0]);

        // Solo se sirve lo que el listado ya ofrece. Comparar contra esa lista
        // cierra de raíz cualquier intento de salirse de la carpeta (`..`,
        // rutas absolutas, separadores), sin tener que adivinar las formas que
        // puede tomar.
        const allowed = await listTabs(baseDir);
        if (!allowed.some(file => file.name === requested)) {
          res.statusCode = 404;
          res.end('No encontrado');
          return;
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(join(baseDir, requested))
          .on('error', () => {
            res.statusCode = 500;
            res.end('No se pudo leer el archivo');
          })
          .pipe(res);
      });
    },
  };
}

interface TabFile {
  name: string;
  size: number;
}

async function listTabs(baseDir: string): Promise<TabFile[]> {
  let entries;
  try {
    entries = await readdir(baseDir, { withFileTypes: true });
  } catch {
    // La carpeta puede no existir: no es un error, solo no hay biblioteca.
    return [];
  }

  const files: TabFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    try {
      const info = await stat(join(baseDir, entry.name));
      files.push({ name: entry.name, size: info.size });
    } catch {
      // Desapareció entre el listado y la consulta; se omite.
    }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
