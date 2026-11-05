/**
 * Memoria del último archivo abierto.
 *
 * Un navegador nunca le da a la página la ruta real de un archivo, y tampoco
 * puede leer del disco por su cuenta: guardar una ruta en `localStorage` no
 * serviría de nada. Lo que sí se puede guardar es un *handle* de la File
 * System Access API, que es un permiso reutilizable sobre ese archivo
 * concreto. Se guarda en IndexedDB porque `localStorage` solo admite texto y
 * un handle no es texto.
 *
 * Esto mantiene la promesa del proyecto de no almacenar tablaturas: lo que
 * queda guardado es una referencia al archivo del usuario, nunca su
 * contenido.
 *
 * El nombre sí va en `localStorage`, que basta para poder enseñarlo en la
 * interfaz antes de tener permiso de lectura.
 */

const DB_NAME = 'abx-tabs';
const DB_VERSION = 1;
const STORE = 'recent';
const HANDLE_KEY = 'last-file';
const NAME_KEY = 'abx-tabs:last-file-name';
const LIBRARY_KEY = 'abx-tabs:last-library-file';

/**
 * El tipado de la File System Access API no está en el `lib.dom` de esta
 * versión de TypeScript, así que se declara lo poco que se usa.
 */
export interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  isSameEntry?(other: FileHandle): Promise<boolean>;
}

interface OpenFilePickerOptions {
  types?: { description?: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileHandle[]>;
};

/** ¿Puede este navegador recordar archivos? Chrome y Edge sí; Firefox no. */
export function supportsFileHandles(): boolean {
  return typeof (window as PickerWindow).showOpenFilePicker === 'function';
}

export type PickResult =
  /** El usuario eligió un archivo. */
  | { status: 'picked'; handle: FileHandle }
  /** Cerró el diálogo sin elegir: no hay nada que hacer. */
  | { status: 'cancelled' }
  /** La API no está o falló; quien llama debe recurrir al `<input>`. */
  | { status: 'unavailable' };

/**
 * Abre el explorador de archivos del sistema devolviendo un handle.
 *
 * Se distingue cancelar de fallar porque son cosas muy distintas: cancelar es
 * una decisión del usuario y no hay que hacer nada, mientras que un fallo
 * (navegador sin la API, contexto no seguro, un iframe) debe caer al
 * `<input type="file">` de siempre en lugar de dejar el botón muerto.
 */
export async function pickFile(): Promise<PickResult> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) return { status: 'unavailable' };
  try {
    const [handle] = await picker({
      types: [
        {
          description: 'Tablaturas de Guitar Pro',
          accept: {
            'application/octet-stream': ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gp7'],
          },
        },
      ],
      excludeAcceptAllOption: false,
      multiple: false,
    });
    return handle ? { status: 'picked', handle } : { status: 'cancelled' };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return aborted ? { status: 'cancelled' } : { status: 'unavailable' };
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (!('indexedDB' in window)) {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Ventana privada, almacenamiento bloqueado... nada de esto debe romper la
    // aplicación: simplemente no habrá archivo reciente.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function runStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    db =>
      new Promise<T | null>(resolve => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(STORE, mode);
          const request = action(tx.objectStore(STORE));
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
          tx.oncomplete = () => db.close();
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function saveRecentFile(handle: FileHandle, name: string): Promise<void> {
  await runStore('readwrite', store => store.put(handle, HANDLE_KEY));
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Almacenamiento bloqueado: el nombre es solo cosmético.
  }
}

export async function loadRecentFile(): Promise<FileHandle | null> {
  return runStore<FileHandle>('readonly', store => store.get(HANDLE_KEY));
}

export async function clearRecentFile(): Promise<void> {
  await runStore('readwrite', store => store.delete(HANDLE_KEY));
  try {
    localStorage.removeItem(NAME_KEY);
  } catch {
    // Nada que limpiar.
  }
}

/**
 * Nombre del último archivo abierto desde la carpeta TABS.
 *
 * Este sí basta con `localStorage`: lo sirve el propio servidor de
 * desarrollo, así que no hace falta permiso del usuario para volver a leerlo
 * y puede recargarse solo al arrancar.
 */
export function recentLibraryName(): string | null {
  try {
    return localStorage.getItem(LIBRARY_KEY);
  } catch {
    return null;
  }
}

export function setRecentLibraryName(name: string | null): void {
  try {
    if (name === null) localStorage.removeItem(LIBRARY_KEY);
    else localStorage.setItem(LIBRARY_KEY, name);
  } catch {
    // Almacenamiento bloqueado: se pierde la comodidad, nada más.
  }
}

export function recentFileName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

/**
 * ¿Sigue habiendo permiso de lectura sobre el handle?
 *
 * `request: true` lo pide al usuario, lo que **exige un gesto suyo**: el
 * navegador no deja recuperar el permiso en la carga de la página. Por eso el
 * archivo reciente se ofrece con un botón en vez de abrirse solo cuando el
 * permiso ha caducado.
 */
export async function hasReadPermission(handle: FileHandle, request: boolean): Promise<boolean> {
  const descriptor = { mode: 'read' } as const;
  try {
    if (handle.queryPermission) {
      const state = await handle.queryPermission(descriptor);
      if (state === 'granted') return true;
      if (!request) return false;
    }
    if (request && handle.requestPermission) {
      return (await handle.requestPermission(descriptor)) === 'granted';
    }
  } catch {
    return false;
  }
  return false;
}
