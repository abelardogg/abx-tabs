import { SidePanel } from './components/SidePanel';
import { TopBar } from './components/TopBar';
import { TrackPane } from './components/TrackPane';
import { Transport } from './components/Transport';
import { useTabPlayer } from './player/TabPlayerProvider';
import { pickFile, supportsFileHandles } from './player/recentFile';
import { useFileDrop } from './player/useFileDrop';
import { useKeyboardControls } from './player/useKeyboardControls';
import { useReleaseFocus } from './player/useReleaseFocus';

export function App() {
  const {
    paneTracks,
    error,
    file,
    openFile,
    recentName,
    reopenRecent,
    canRememberFiles,
    library,
    openFromLibrary,
  } = useTabPlayer();

  useKeyboardControls();
  useReleaseFocus();
  const isDragging = useFileDrop(openFile);

  // Ver la nota en `TopBar`: la comprobación va antes de cualquier `await`
  // para no perder el gesto del usuario.
  const browse = () => {
    const fallback = () =>
      document.querySelector<HTMLInputElement>('.topbar input[type=file]')?.click();
    if (!supportsFileHandles()) {
      fallback();
      return;
    }
    void (async () => {
      const result = await pickFile();
      if (result.status === 'cancelled') return;
      if (result.status === 'unavailable') {
        fallback();
        return;
      }
      await openFile(await result.handle.getFile(), result.handle);
    })();
  };

  return (
    <div className={`app${isDragging ? ' app--dragging' : ''}`}>
      <TopBar />

      {error && <p className="app__error">{error}</p>}

      <main className="app__body">
        <div className="app__panes" data-count={paneTracks.length}>
          {paneTracks.map((_, pane) => (
            <TrackPane key={pane} pane={pane} />
          ))}
          {!file && (
            <div className="dropzone">
              <p>Arrastra aquí un archivo de Guitar Pro</p>
              <p className="dropzone__formats">.gp · .gp3 · .gp4 · .gp5 · .gpx</p>
              {/* La capa no recibe puntero para no estorbar al arrastre, así que
                  los botones lo reactivan solo sobre ellos. */}
              <div className="dropzone__actions">
                {library.length > 0 && (
                  <select
                    className="dropzone__library"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) void openFromLibrary(e.target.value);
                    }}
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
                <button type="button" onClick={browse}>
                  Buscar en el equipo
                </button>
                {recentName && canRememberFiles && (
                  <button type="button" onClick={() => void reopenRecent()}>
                    ↻ {recentName}
                  </button>
                )}
              </div>
              <p className="dropzone__privacy">
                Los archivos se leen en tu equipo; esta app no los guarda ni los sube a ningún sitio.
              </p>
            </div>
          )}
        </div>
        <SidePanel />
      </main>

      <footer className="app__footer">
        <Transport />
      </footer>

    </div>
  );
}
