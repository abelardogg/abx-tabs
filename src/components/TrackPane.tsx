import { useEffect, useRef, useState } from 'react';
import { AlphaTabApi, model } from '@coderline/alphatab';
import { MASTER_PANE, useTabPlayer } from '../player/TabPlayerProvider';
import { createBeatMarker } from '../player/beatMarker';
import { buildPaneSettings } from '../player/settings';
import { tonePitchesPerTrack } from '../lib/tuning';

type PaneStatus = 'empty' | 'loading' | 'ready' | 'error';

export function TrackPane({ pane }: { pane: number }) {
  const {
    file,
    paneTracks,
    tracks,
    setPaneTrack,
    activePane,
    setActivePane,
    fretShift,
    tuningShift,
    positionStore,
    registerPane,
    unregisterPane,
  } = useTabPlayer();

  const trackIndex = paneTracks[pane] ?? 0;

  const viewportRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const renderedTrackRef = useRef<number | null>(null);
  const appliedFretRef = useRef<number | null>(null);

  const [loadedScore, setLoadedScore] = useState<model.Score | null>(null);
  const [status, setStatus] = useState<PaneStatus>('empty');
  const [paneError, setPaneError] = useState<string | null>(null);

  /**
   * Una instancia de alphaTab por panel y por archivo.
   *
   * Depender de `file` la recrea al abrir otro archivo y la destruye al
   * cerrar: alphaTab no ofrece forma de vaciar su superficie ya dibujada, así
   * que sin esto la partitura anterior seguía pintada detrás del dropzone.
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    const mount = mountRef.current;
    if (!viewport || !mount) return;
    // Sin archivo no hay nada que renderizar, y crear la instancia de todos
    // modos levantaría un worker de sintetizador y descargaría el soundfont
    // (1,4 MB) por panel, tanto al arrancar como después de cada cierre.
    if (!file) {
      setLoadedScore(null);
      setStatus('empty');
      return;
    }

    const role = pane === MASTER_PANE ? 'master' : 'follower';
    const api = new AlphaTabApi(mount, buildPaneSettings(role, viewport));
    apiRef.current = api;

    api.scoreLoaded.on(score => {
      setLoadedScore(score);
      setStatus('ready');
    });
    api.error.on(err => {
      setPaneError(err.message);
      setStatus('error');
    });

    registerPane(pane, api);

    return () => {
      unregisterPane(pane);
      api.destroy();
      apiRef.current = null;
      renderedTrackRef.current = null;
      appliedFretRef.current = null;
      setLoadedScore(null);
      setStatus('empty');
    };
  }, [pane, file, registerPane, unregisterPane]);

  // Cada panel parsea su propia copia del archivo: así las instancias no
  // comparten un Score mutable y pueden renderizar pistas distintas.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (!file) {
      setLoadedScore(null);
      setStatus('empty');
      return;
    }
    setStatus('loading');
    setPaneError(null);
    renderedTrackRef.current = trackIndex;
    appliedFretRef.current = null;
    const ok = api.load(new Uint8Array(file.buffer.slice(0)), [trackIndex]);
    if (!ok) {
      setStatus('error');
      setPaneError('alphaTab no pudo abrir este archivo.');
    }
    // `trackIndex` queda fuera de las dependencias a propósito: cambiar de
    // pista no debe recargar el archivo, lo hace el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Cambio de pista sin volver a parsear.
  useEffect(() => {
    const api = apiRef.current;
    const score = api?.score;
    if (!api || !score) return;
    if (renderedTrackRef.current === trackIndex) return;
    const track = score.tracks[trackIndex];
    if (!track) return;
    api.renderTracks([track]);
    renderedTrackRef.current = trackIndex;
  }, [trackIndex, loadedScore]);

  /**
   * Ajuste de notas: mueve los trastes mostrados para encontrar la misma nota
   * en otra afinación.
   *
   * `notation.transpositionPitches` es la única palanca que mueve las dos
   * cosas a la vez, y `updateSettings()` la copia al modelo invirtiendo el
   * signo (`staff.transpositionPitch = -fretShift`):
   *
   * - Tablatura: el renderer dibuja `note.fret - staff.transpositionPitch`,
   *   así que el traste mostrado queda en `fret + fretShift`.
   * - Audio: `loadMidiForScore()` genera el midi con
   *   `applyTranspositionPitches = false`, o sea que NO hornea el offset en la
   *   key de cada nota; lo instala como transposición de canal en el
   *   sintetizador. Por eso el desplazamiento suena una sola vez y no hay que
   *   compensar ninguna doble aplicación (verificado con
   *   `scripts/verify-transposition.mjs`).
   *
   * Esa transposición de canal es independiente de la que pone la afinación
   * (`changeTrackTranspositionPitch`, capa "live"): el sintetizador las suma
   * por separado, y recargar el midi no borra la capa live. De ahí sale la
   * altura final = original + fretShift + tuningShift.
   */
  useEffect(() => {
    const api = apiRef.current;
    const score = api?.score;
    if (!api || !score) return;
    if (appliedFretRef.current === fretShift) return;

    const tick = api.tickPosition;
    api.settings.notation.transpositionPitches = tonePitchesPerTrack(score.tracks, fretShift);
    api.updateSettings();
    api.render();

    if (pane === MASTER_PANE) {
      // Solo el panel maestro suena, y la transposición de canal se instala al
      // generar el midi: sin regenerarlo, lo que suena se queda con el offset
      // anterior y deja de coincidir con los trastes que se muestran.
      api.loadMidiForScore();
      api.tickPosition = tick;
    }
    appliedFretRef.current = fretShift;
  }, [fretShift, loadedScore, pane]);

  /**
   * Rótulo con las notas del golpe en curso, encima del compás.
   *
   * Se re-crea cuando cambian los desplazamientos de tono para que el nombre
   * se recalcule, y se engancha a `postRenderFinished` porque un re-render de
   * alphaTab invalida las coordenadas que usa para colocarse.
   */
  useEffect(() => {
    const api = apiRef.current;
    const overlay = markerRef.current;
    if (!api || !overlay || !loadedScore) return;

    const marker = createBeatMarker({
      api,
      overlay,
      trackIndex,
      shifts: { fretShift, tuningShift },
    });

    const refresh = () => marker.update(positionStore.getSnapshot().currentTick);
    const unsubscribe = positionStore.subscribe(refresh);
    api.postRenderFinished.on(refresh);
    refresh();

    return () => {
      unsubscribe();
      api.postRenderFinished.off(refresh);
      marker.hide();
    };
  }, [loadedScore, trackIndex, fretShift, tuningShift, positionStore]);

  const isActive = activePane === pane;

  return (
    <section
      className={`pane${isActive ? ' pane--active' : ''}`}
      onMouseDown={() => setActivePane(pane)}
      aria-label={`Panel ${pane + 1}`}
    >
      <header className="pane__head">
        <span className="pane__badge">{pane === MASTER_PANE ? 'Audio' : `P${pane + 1}`}</span>
        <select
          className="pane__track"
          value={trackIndex}
          onChange={e => setPaneTrack(pane, Number(e.target.value))}
          disabled={tracks.length === 0}
          aria-label={`Instrumento del panel ${pane + 1}`}
        >
          {tracks.length === 0 && <option value={0}>Sin archivo</option>}
          {tracks.map(track => (
            <option key={track.index} value={track.index}>
              {track.name}
              {track.isPercussion ? ' (perc.)' : ''}
            </option>
          ))}
        </select>
      </header>

      <div className="pane__viewport" ref={viewportRef} data-pane={pane}>
        <div className="pane__surface">
          <div ref={mountRef} />
          {/* Se posiciona en coordenadas de la superficie de alphaTab, así que
              se desplaza junto con la partitura al hacer scroll. */}
          <div className="beatmark" ref={markerRef} hidden />
        </div>
        {status === 'empty' && <p className="pane__hint">Abre un archivo de Guitar Pro</p>}
        {status === 'loading' && <p className="pane__hint">Cargando…</p>}
        {status === 'error' && <p className="pane__hint pane__hint--error">{paneError}</p>}
      </div>
    </section>
  );
}
