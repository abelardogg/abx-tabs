import { useEffect, useRef, useState } from 'react';
import type { FileHandle } from './recentFile';

/** `getAsFileSystemHandle` existe en Chrome/Edge; en otros navegadores no. */
interface HandleCapableItem extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileHandle | null>;
}

/**
 * ¿Este arrastre trae archivos?
 *
 * En `dragover` la lista `files` viene vacía por seguridad (el navegador no
 * revela el contenido hasta soltar), así que hay que mirar `types`.
 */
function hasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.prototype.includes.call(types, 'Files');
}

/**
 * Permite abrir un archivo arrastrándolo sobre la ventana.
 *
 * Los listeners van en `window` y no en un contenedor: así da igual sobre qué
 * elemento se suelte y no depende de que el evento burbujee intacto hasta la
 * raíz. Devuelve si hay un arrastre en curso, para resaltar la zona.
 *
 * Es imprescindible llamar a `preventDefault()` en `dragover`: sin eso el
 * navegador descarta el drop y, al soltar, abre el archivo en la pestaña.
 */
export function useFileDrop(onFile: (file: File, handle?: FileHandle | null) => void): boolean {
  const [isDragging, setIsDragging] = useState(false);
  /**
   * `dragleave` también se dispara al pasar de un elemento a otro dentro de la
   * ventana, así que se cuentan entradas y salidas en vez de apagar el
   * resaltado en el primer `dragleave`.
   */
  const depth = useRef(0);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setIsDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setIsDragging(false);

      const dropped = event.dataTransfer?.files?.[0];
      if (!dropped) return;

      // Soltar un archivo también puede dar un handle reutilizable, lo que
      // permite recordarlo igual que si se hubiera elegido en el explorador.
      // Hay que pedirlo antes de ceder el turno, porque el `DataTransfer`
      // deja de ser válido en cuanto termina el manejador.
      const item = event.dataTransfer?.items?.[0] as HandleCapableItem | undefined;
      const pending = item?.getAsFileSystemHandle?.();
      if (!pending) {
        onFile(dropped, null);
        return;
      }
      pending.then(
        handle => onFile(dropped, handle),
        () => onFile(dropped, null),
      );
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      depth.current = 0;
    };
  }, [onFile]);

  return isDragging;
}
