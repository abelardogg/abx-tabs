import { useRef } from 'react';
import { MAX_PANES, useTabPlayer } from '../player/TabPlayerProvider';
import { pickFile, supportsFileHandles } from '../player/recentFile';

const ACCEPTED = '.gp,.gp3,.gp4,.gp5,.gpx,.gp7';

export function TopBar() {
  const {
    file,
    openFile,
    closeFile,
    isLoading,
    scoreTitle,
    scoreArtist,
    paneTracks,
    setPaneCount,
    recentName,
    reopenRecent,
    canRememberFiles,
    library,
    currentLibraryName,
    openFromLibrary,
  } = useTabPlayer();

  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * El explorador del sistema devuelve un handle reutilizable, que es lo que
   * permite recordar el archivo.
   *
   * La comprobación de soporte es SÍNCRONA a propósito: pulsar el `<input>`
   * después de un `await` pierde el gesto del usuario y el navegador descarta
   * la apertura del diálogo sin decir nada. Donde no existe la API hay que
   * recurrir al input dentro del propio clic.
   */
  const browse = () => {
    if (!supportsFileHandles()) {
      inputRef.current?.click();
      return;
    }
    void (async () => {
      const result = await pickFile();
      if (result.status === 'cancelled') return;
      if (result.status === 'unavailable') {
        inputRef.current?.click();
        return;
      }
      await openFile(await result.handle.getFile(), result.handle);
    })();
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <strong>abx-tabs</strong>
        <span className="topbar__tagline">lector local de tablaturas</span>
      </div>

      <div className="topbar__file">
        <button type="button" onClick={browse} disabled={isLoading}>
          {isLoading ? 'Abriendo…' : 'Abrir archivo'}
        </button>
        {library.length > 0 && (
          <select
            className="topbar__library"
            value={currentLibraryName ?? ''}
            onChange={e => {
              if (e.target.value) void openFromLibrary(e.target.value);
            }}
            disabled={isLoading}
            aria-label="Tablaturas de la carpeta TABS"
          >
            <option value="">Carpeta TABS…</option>
            {library.map(entry => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        )}
        {!file && recentName && canRememberFiles && (
          <button
            type="button"
            className="topbar__recent"
            onClick={() => void reopenRecent()}
            disabled={isLoading}
            title="Volver a abrir el último archivo"
          >
            ↻ {recentName}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={e => {
            const input = e.target;
            const picked = input.files?.[0];
            // El input se vacía para que volver a elegir el mismo archivo
            // dispare el evento otra vez, pero SOLO después de haberlo leído:
            // vaciarlo antes libera la lista de archivos y el navegador
            // invalida la referencia, con lo que la lectura falla con
            // NotFoundError.
            if (!picked) {
              input.value = '';
              return;
            }
            void openFile(picked).finally(() => {
              input.value = '';
            });
          }}
        />
        {file && (
          <>
            <span className="topbar__name" title={file.name}>
              {scoreTitle || file.name}
              {scoreArtist ? ` — ${scoreArtist}` : ''}
            </span>
            <button type="button" className="topbar__close" onClick={closeFile} title="Cerrar">
              ✕
            </button>
          </>
        )}
      </div>

      <div className="topbar__split" role="group" aria-label="Paneles en pantalla">
        <span>Paneles</span>
        {Array.from({ length: MAX_PANES }, (_, i) => i + 1).map(count => (
          <button
            key={count}
            type="button"
            className={paneTracks.length === count ? 'is-on' : undefined}
            onClick={() => setPaneCount(count)}
            disabled={!file}
            title={`Mostrar ${count} instrumento${count > 1 ? 's' : ''}`}
          >
            {count}
          </button>
        ))}
      </div>
    </header>
  );
}
