import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AlphaTabApi, importer, model, synth } from '@coderline/alphatab';
import { PositionStore } from './positionStore';
import { startCountIn, type CountIn } from './countIn';
import { PREF_KEYS, readBoolean, readNumber, write as writePref } from './preferences';
import {
  clearRecentFile,
  hasReadPermission,
  loadRecentFile,
  recentFileName,
  recentLibraryName,
  saveRecentFile,
  setRecentLibraryName,
  supportsFileHandles,
  type FileHandle,
} from './recentFile';
import { barIndexAtTick, barRangeToTicks, type BarRange } from '../lib/bars';
import { readPlayingNotes, type PlayingNote } from '../lib/notes';
import { findSectionJump, readSections, type SectionMarker } from '../lib/sections';
import { pitchedTracks, readTuning, type TuningInfo } from '../lib/tuning';

export const MAX_PANES = 3;
/**
 * El click de alphaTab sale bastante más bajo que los instrumentos, y su
 * volumen es una ganancia sin tope: por eso el valor de fábrica pasa de 1.
 */
export const DEFAULT_METRONOME_VOLUME = 2;
export const MAX_METRONOME_VOLUME = 4;
/**
 * Opciones de compás de entrada. Son un conjunto cerrado y no un número libre:
 * un campo numérico editable se prestaba a estados intermedios absurdos
 * (vaciarlo daba 0, y teclear un dígito sobre el valor anterior lo concatenaba).
 */
export const COUNT_IN_OPTIONS = [4, 8] as const;
export const DEFAULT_COUNT_IN_BEATS = 4;

/** Ajusta cualquier valor guardado a una de las opciones admitidas. */
function normalizeCountInBeats(value: number): number {
  return COUNT_IN_OPTIONS.includes(value as (typeof COUNT_IN_OPTIONS)[number])
    ? value
    : DEFAULT_COUNT_IN_BEATS;
}
/** El primer panel es siempre el que manda: es el único que sintetiza audio. */
export const MASTER_PANE = 0;

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface LibraryEntry {
  name: string;
  size: number;
}

export interface TrackSummary {
  index: number;
  name: string;
  shortName: string;
  isPercussion: boolean;
  stringCount: number;
}

interface LoadedFile {
  name: string;
  buffer: ArrayBuffer;
}

export interface TabPlayerValue {
  // --- archivo ---
  file: LoadedFile | null;
  error: string | null;
  isLoading: boolean;
  openFile: (file: File, handle?: FileHandle | null) => Promise<void>;
  closeFile: () => void;
  /** Tablaturas encontradas en la carpeta TABS del proyecto. */
  library: LibraryEntry[];
  /** Cuál de ellas está abierta ahora mismo. */
  currentLibraryName: string | null;
  openFromLibrary: (name: string) => Promise<void>;
  /** Nombre del último archivo abierto, si el navegador puede recordarlo. */
  recentName: string | null;
  /** Reabre ese archivo; pide permiso al usuario, así que necesita un clic. */
  reopenRecent: () => Promise<void>;
  canRememberFiles: boolean;
  scoreTitle: string | null;
  scoreArtist: string | null;
  tracks: TrackSummary[];
  sections: SectionMarker[];
  barCount: number;
  /** Tick de inicio de cada compás, para que la UI ubique la posición. */
  barStartTicks: number[];

  // --- paneles ---
  paneTracks: number[];
  activePane: number;
  setActivePane: (pane: number) => void;
  setPaneCount: (count: number) => void;
  setPaneTrack: (pane: number, trackIndex: number) => void;

  // --- transporte ---
  transport: TransportState;
  isReady: boolean;
  playPause: () => void;
  stop: () => void;
  seekToTick: (tick: number) => void;
  seekBars: (delta: number) => void;
  /** Salta al golpe anterior o siguiente de la pista que suena. */
  seekBeats: (direction: -1 | 1) => void;
  /**
   * Notas de una pista en un tick dado. Resuelve contra el score del panel de
   * audio, que tiene todas las pistas cargadas aunque solo dibuje una.
   */
  notesAtTick: (trackIndex: number, tick: number) => PlayingNote[];
  jumpSection: (direction: -1 | 1) => void;
  speed: number;
  setSpeed: (speed: number) => void;

  // --- loop ---
  loop: BarRange | null;
  setLoop: (range: BarRange | null) => void;
  isLooping: boolean;
  setIsLooping: (looping: boolean) => void;
  loopCurrentBar: () => void;

  // --- tono ---
  tuningShift: number;
  setTuningShift: (semitones: number) => void;
  fretShift: number;
  setFretShift: (semitones: number) => void;
  tuningFor: (trackIndex: number) => TuningInfo | null;


  // --- metrónomo ---
  metronome: boolean;
  setMetronome: (on: boolean) => void;
  /** Ganancia del click; admite más de 1 porque de fábrica suena bajo. */
  metronomeVolume: number;
  setMetronomeVolume: (gain: number) => void;
  countIn: boolean;
  setCountIn: (on: boolean) => void;
  /** Cuántos clicks suenan antes de arrancar. */
  countInBeats: number;
  setCountInBeats: (beats: number) => void;
  /** Hay una cuenta atrás en curso. */
  isCountingIn: boolean;
  /** Fija el loop en un compás, o lo extiende desde el último marcado. */
  toggleLoopBar: (barIndex: number) => void;
  clearLoop: () => void;

  // --- internos usados por los paneles ---
  positionStore: PositionStore;
  registerPane: (pane: number, api: AlphaTabApi) => void;
  unregisterPane: (pane: number) => void;
}

const TabPlayerContext = createContext<TabPlayerValue | null>(null);

export function useTabPlayer(): TabPlayerValue {
  const value = useContext(TabPlayerContext);
  if (!value) throw new Error('useTabPlayer debe usarse dentro de <TabPlayerProvider>');
  return value;
}

function clampSemitones(value: number): number {
  return Math.max(-12, Math.min(12, Math.round(value)));
}

/**
 * Lleva la vista al cursor después de un salto de posición.
 *
 * alphaTab coloca el cursor de forma asíncrona (hay una ida y vuelta al worker
 * del sintetizador), así que un `scrollToCursor()` inmediatamente después de
 * asignar `tickPosition` calcula el desplazamiento contra la posición anterior
 * del cursor y se queda corto. Se reintenta en el siguiente frame y una vez
 * más algo después, cuando el cursor ya está en su sitio.
 *
 * Solo para saltos explícitos: durante la reproducción basta la llamada
 * directa, porque a 20 Hz cada una corrige el retraso de la anterior.
 */
function scrollToCursorWhenSettled(api: AlphaTabApi): void {
  const attempt = () => {
    try {
      api.scrollToCursor();
    } catch {
      // Todavía sin score renderizado.
    }
  };
  attempt();
  requestAnimationFrame(attempt);
  window.setTimeout(attempt, 150);
}

export function TabPlayerProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [metaScore, setMetaScore] = useState<model.Score | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [paneTracks, setPaneTracks] = useState<number[]>([0]);
  const [activePane, setActivePane] = useState(MASTER_PANE);

  const [transport, setTransport] = useState<TransportState>('stopped');
  const [isReady, setIsReady] = useState(false);
  const [speed, setSpeedState] = useState(1);

  const [loop, setLoopState] = useState<BarRange | null>(null);
  const [isLooping, setIsLoopingState] = useState(false);

  const [tuningShift, setTuningShiftState] = useState(0);
  const [fretShift, setFretShiftState] = useState(0);

  const [metronome, setMetronomeState] = useState(() =>
    readBoolean(PREF_KEYS.metronome, false),
  );
  const [metronomeVolume, setMetronomeVolumeState] = useState(() =>
    readNumber(PREF_KEYS.metronomeVolume, DEFAULT_METRONOME_VOLUME, 0, MAX_METRONOME_VOLUME),
  );
  const [countIn, setCountInState] = useState(() => readBoolean(PREF_KEYS.countIn, false));
  const [countInBeats, setCountInBeatsState] = useState(() =>
    normalizeCountInBeats(
      readNumber(PREF_KEYS.countInBeats, DEFAULT_COUNT_IN_BEATS, 1, Number.MAX_SAFE_INTEGER),
    ),
  );
  const [isCountingIn, setIsCountingIn] = useState(false);
  const countInRef = useRef<CountIn | null>(null);

  const [recentName, setRecentName] = useState<string | null>(() => recentFileName());
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [currentLibraryName, setCurrentLibraryName] = useState<string | null>(null);
  const canRememberFiles = supportsFileHandles();


  const apis = useRef(new Map<number, AlphaTabApi>());
  const positionStore = useMemo(() => new PositionStore(), []);

  /**
   * Último rango que se le escribió a alphaTab. Escribir `playbackRange`
   * re-emite `playbackRangeChanged`, que vuelve a escribir el estado de React:
   * sin recordar lo ya aplicado el ciclo no tiene punto fijo, porque cada
   * vuelta crea un objeto nuevo aunque los compases sean los mismos.
   */
  const appliedRangeRef = useRef<{ startTick: number; endTick: number } | null>(null);
  /** Valor actual de `loop` legible desde los handlers de eventos. */
  const loopRef = useRef<BarRange | null>(null);

  const master = useCallback(() => apis.current.get(MASTER_PANE) ?? null, []);

  // Los paneles seguidores no reproducen: su cursor se mueve posicionándolos
  // en el tick que reporta el maestro. Así solo hay un sintetizador activo.
  const mirrorFollowers = useCallback((tick: number, settle = false) => {
    for (const [pane, api] of apis.current) {
      if (pane === MASTER_PANE) continue;
      try {
        api.tickPosition = tick;
        // Mover el tick desplaza el cursor pero no la vista: el auto-scroll de
        // alphaTab solo actúa en su propio flujo de reproducción, y estos
        // paneles nunca reproducen.
        if (settle) scrollToCursorWhenSettled(api);
        else api.scrollToCursor();
      } catch {
        // El panel puede estar aún cargando su propio score.
      }
    }
  }, []);

  const registerPane = useCallback(
    (pane: number, api: AlphaTabApi) => {
      apis.current.set(pane, api);

      if (pane === MASTER_PANE) {
        api.playerReady.on(() => setIsReady(true));
        api.playerStateChanged.on(e => {
          setTransport(
            e.state === synth.PlayerState.Playing
              ? 'playing'
              : api.tickPosition > 0
                ? 'paused'
                : 'stopped',
          );
        });
        api.playerPositionChanged.on(e => {
          positionStore.set({
            currentTick: e.currentTick,
            endTick: e.endTick,
            currentTime: e.currentTime,
            endTime: e.endTime,
          });
          mirrorFollowers(e.currentTick);
        });
        api.playbackRangeChanged.on(e => {
          // El rango también se puede marcar arrastrando sobre la partitura.
          const range = e.playbackRange;
          const score = api.score;
          if (!score) return;

          if (!range) {
            appliedRangeRef.current = null;
            if (loopRef.current !== null) setLoopState(null);
            return;
          }

          appliedRangeRef.current = { startTick: range.startTick, endTick: range.endTick };
          const startBar = barIndexAtTick(score, range.startTick);
          const endBar = barIndexAtTick(score, Math.max(range.startTick, range.endTick - 1));

          // Si el rango ya es el que tenemos, no reescribir el estado: sería
          // un objeto nuevo con los mismos compases y realimentaría el evento.
          const current = loopRef.current;
          if (current && current.startBar === startBar && current.endBar === endBar) return;
          setLoopState({ startBar, endBar });
        });
        api.error.on(err => setError(err.message));
      } else {
        // Silenciar al seguidor: comparte el soundfont pero nunca debe sonar.
        api.masterVolume = 0;
      }
    },
    [mirrorFollowers, positionStore],
  );

  const unregisterPane = useCallback(
    (pane: number) => {
      apis.current.delete(pane);
      if (pane === MASTER_PANE) {
        setIsReady(false);
        setTransport('stopped');
        // El maestro es la única fuente de posición: sin él no hay nada que
        // mostrar, y un evento tardío podría repoblar el store ya reseteado.
        positionStore.reset();
        appliedRangeRef.current = null;
      }
    },
    [positionStore],
  );

  // --- carga de archivo ---

  const openFile = useCallback(
    async (picked: File, handle?: FileHandle | null) => {
      setIsLoading(true);
      setError(null);
      let buffer: ArrayBuffer;
      try {
        buffer = await picked.arrayBuffer();
      } catch (e) {
        // Leer los bytes es un paso distinto de interpretarlos, y falla por
        // motivos distintos: el navegador ya no encuentra el archivo donde lo
        // dejó quien lo arrastró. Conviene decirlo con sus propias palabras en
        // vez de dar a entender que la tablatura está mal.
        setMetaScore(null);
        setFile(null);
        setIsLoading(false);
        setError(
          `El navegador no pudo leer "${picked.name}" del disco` +
            (e instanceof Error && e.name ? ` (${e.name})` : '') +
            '. Suele pasar al arrastrar desde un ZIP, desde el panel de un ' +
            'editor o desde una carpeta sincronizada en la nube: copia el ' +
            'archivo a una carpeta local y arrástralo desde el Explorador de ' +
            'Windows, o ábrelo con el botón «Abrir archivo».',
        );
        return;
      }

      try {
        // Se parsea una vez aquí solo para la metadata que alimenta la UI
        // (pistas, secciones, afinación). Cada panel parsea su propia copia.
        const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer.slice(0)));
        setMetaScore(score);
        setFile({ name: picked.name, buffer });
        setPaneTracks([0]);
        setActivePane(MASTER_PANE);
        setLoopState(null);
        setIsLoopingState(false);
        positionStore.reset();
        setTransport('stopped');
        setIsReady(false);

        setCurrentLibraryName(null);
        setRecentLibraryName(null);

        // Solo se recuerda lo que de verdad se pudo abrir.
        if (handle) {
          setRecentName(picked.name);
          void saveRecentFile(handle, picked.name);
        }
      } catch (e) {
        setMetaScore(null);
        setFile(null);
        setError(
          e instanceof Error
            ? `"${picked.name}" no se pudo interpretar como tablatura de Guitar Pro: ${e.message}`
            : `"${picked.name}" no se pudo interpretar como tablatura de Guitar Pro.`,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [positionStore],
  );

  /**
   * El listado lo sirve un plugin que solo existe en desarrollo, así que en
   * cualquier despliegue estático (nginx, Vercel...) no hay nada que listar y
   * la biblioteca queda vacía, con lo que el desplegable no se muestra.
   *
   * Se comprueba el tipo de contenido además del código de estado: un
   * alojamiento con reescritura a `index.html` responde 200 con HTML a
   * cualquier ruta desconocida, y conviene descartarlo explícitamente en vez
   * de confiar en que `json()` reviente.
   */
  useEffect(() => {
    // En producción el endpoint no existe: pedirlo solo dejaría un 404 en la
    // consola del navegador. Vite resuelve esta condición al compilar, así
    // que la petición ni siquiera llega al bundle desplegado.
    if (!import.meta.env.DEV) return;

    let cancelled = false;
    fetch('/__tabs/list')
      .then(response => {
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.includes('application/json')) return null;
        return response.json() as Promise<{ files?: LibraryEntry[] }>;
      })
      .then(data => {
        if (!cancelled && Array.isArray(data?.files)) setLibrary(data.files);
      })
      .catch(() => {
        // Sin biblioteca: se abre con el explorador o arrastrando.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openFromLibrary = useCallback(
    async (name: string) => {
      setError(null);
      let blob: Blob;
      try {
        const response = await fetch(`/__tabs/file/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error(`el servidor respondió ${response.status}`);
        blob = await response.blob();
      } catch (e) {
        setError(
          `No se pudo leer "${name}" de la carpeta TABS` +
            (e instanceof Error ? `: ${e.message}` : '') +
            '.',
        );
        return;
      }

      await openFile(new File([blob], name));
      setCurrentLibraryName(name);
      setRecentLibraryName(name);
    },
    [openFile],
  );

  /**
   * Vuelve a abrir el último archivo. `request` distingue los dos momentos:
   * al arrancar solo se consulta el permiso (el navegador no deja pedirlo sin
   * un gesto del usuario), y al pulsar el botón sí se pide.
   */
  const reopenFromHandle = useCallback(
    async (request: boolean) => {
      const handle = await loadRecentFile();
      if (!handle) return;

      if (!(await hasReadPermission(handle, request))) return;

      try {
        const file = await handle.getFile();
        await openFile(file, handle);
      } catch {
        // El archivo se movió o se borró: la referencia ya no sirve.
        await clearRecentFile();
        setRecentName(null);
        setError(
          'El último archivo ya no está donde estaba; ábrelo de nuevo desde su carpeta.',
        );
      }
    },
    [openFile],
  );

  const reopenRecent = useCallback(() => reopenFromHandle(true), [reopenFromHandle]);

  /**
   * Autocarga al arrancar. Se intenta primero la carpeta TABS porque no
   * necesita permiso de nadie; solo si el último archivo no venía de ahí se
   * prueba con el handle, que únicamente funciona si el permiso sigue vivo.
   */
  const triedAutoOpen = useRef(false);
  useEffect(() => {
    if (triedAutoOpen.current) return;

    const lastLibrary = recentLibraryName();
    if (lastLibrary) {
      // Hay que esperar al listado para no pedir un archivo que ya no está.
      if (library.length === 0) return;
      triedAutoOpen.current = true;
      if (library.some(entry => entry.name === lastLibrary)) {
        void openFromLibrary(lastLibrary);
      } else {
        setRecentLibraryName(null);
      }
      return;
    }

    triedAutoOpen.current = true;
    if (canRememberFiles) void reopenFromHandle(false);
  }, [library, canRememberFiles, openFromLibrary, reopenFromHandle]);

  const closeFile = useCallback(() => {
    setFile(null);
    setMetaScore(null);
    setCurrentLibraryName(null);
    setRecentLibraryName(null);
    setError(null);
    setPaneTracks([0]);
    setLoopState(null);
    setIsLoopingState(false);
    positionStore.reset();
    setTransport('stopped');
    setIsReady(false);
  }, [positionStore]);

  // --- derivados de la metadata ---

  const tracks = useMemo<TrackSummary[]>(() => {
    if (!metaScore) return [];
    return metaScore.tracks.map(track => ({
      index: track.index,
      name: track.name || `Pista ${track.index + 1}`,
      shortName: track.shortName || track.name || `P${track.index + 1}`,
      isPercussion: track.staves.some(s => s.isPercussion),
      stringCount: track.staves[0]?.stringTuning?.tunings?.length ?? 0,
    }));
  }, [metaScore]);

  const sections = useMemo(() => (metaScore ? readSections(metaScore) : []), [metaScore]);
  const barCount = metaScore?.masterBars.length ?? 0;
  const barStartTicks = useMemo(
    () => (metaScore ? metaScore.masterBars.map(bar => bar.start) : []),
    [metaScore],
  );

  const tuningFor = useCallback(
    (trackIndex: number): TuningInfo | null => {
      const staff = metaScore?.tracks[trackIndex]?.staves[0];
      if (!staff) return null;
      return readTuning(staff, tuningShift);
    },
    [metaScore, tuningShift],
  );

  // --- paneles ---

  const setPaneCount = useCallback(
    (count: number) => {
      const next = Math.max(1, Math.min(MAX_PANES, count));
      setPaneTracks(current => {
        if (next === current.length) return current;
        if (next < current.length) return current.slice(0, next);
        const grown = [...current];
        while (grown.length < next) {
          // Al abrir un panel nuevo se propone la siguiente pista no mostrada.
          const used = new Set(grown);
          const free = tracks.find(t => !used.has(t.index))?.index ?? 0;
          grown.push(free);
        }
        return grown;
      });
      setActivePane(pane => Math.min(pane, next - 1));
    },
    [tracks],
  );

  const setPaneTrack = useCallback((pane: number, trackIndex: number) => {
    setPaneTracks(current => {
      if (current[pane] === trackIndex) return current;
      const next = [...current];
      next[pane] = trackIndex;
      return next;
    });
  }, []);

  // --- transporte ---

  const playPause = useCallback(() => {
    const m = master();
    if (!m) return;

    // Si la cuenta atrás está sonando, esta pulsación la aborta.
    if (countInRef.current) {
      countInRef.current.cancel();
      countInRef.current = null;
      setIsCountingIn(false);
      return;
    }

    const willStart = m.playerState !== synth.PlayerState.Playing;
    if (!willStart || !countIn) {
      m.playPause();
      return;
    }

    const bpm = (m.score?.tempo ?? 120) * m.playbackSpeed;
    const run = startCountIn({
      beats: countInBeats,
      bpm,
      volume: metronome ? metronomeVolume : DEFAULT_METRONOME_VOLUME,
    });
    countInRef.current = run;
    setIsCountingIn(true);

    void run.finished.then(completed => {
      countInRef.current = null;
      setIsCountingIn(false);
      if (completed) m.play();
    });
  }, [master, countIn, countInBeats, metronome, metronomeVolume]);

  const stop = useCallback(() => {
    const m = master();
    if (!m) return;
    countInRef.current?.cancel();
    countInRef.current = null;
    setIsCountingIn(false);
    m.stop();
    scrollToCursorWhenSettled(m);
    mirrorFollowers(0, true);
    setTransport('stopped');
  }, [master, mirrorFollowers]);

  const seekToTick = useCallback(
    (tick: number) => {
      const m = master();
      if (!m) return;
      const clamped = Math.max(0, tick);
      m.tickPosition = clamped;
      // Un salto de posición fuera de la reproducción no mueve la vista solo.
      scrollToCursorWhenSettled(m);
      mirrorFollowers(clamped, true);
    },
    [master, mirrorFollowers],
  );

  const seekBars = useCallback(
    (delta: number) => {
      const m = master();
      const score = m?.score;
      if (!m || !score) return;
      const current = barIndexAtTick(score, m.tickPosition);
      const target = Math.max(0, Math.min(score.masterBars.length - 1, current + delta));
      seekToTick(score.masterBars[target].start);
    },
    [master, seekToTick],
  );

  /**
   * El recorrido nota a nota se hace sobre la pista del panel de audio, que es
   * la que marca el ritmo de la reproducción.
   */
  const seekBeats = useCallback(
    (direction: -1 | 1) => {
      const m = master();
      const cache = m?.tickCache;
      if (!m || !cache) return;

      const tracks = new Set([paneTracks[MASTER_PANE] ?? 0]);
      const found = cache.findBeat(tracks, m.tickPosition);
      if (!found) return;

      if (direction === 1) {
        const next = found.nextBeat;
        if (next) seekToTick(next.start);
        return;
      }

      // Hacia atrás: si ya se avanzó dentro del golpe actual, primero se
      // vuelve a su inicio; solo entonces se pasa al golpe anterior.
      if (m.tickPosition > found.start + 1) {
        seekToTick(found.start);
        return;
      }
      if (found.start <= 0) {
        seekToTick(0);
        return;
      }
      // Se busca por tick en vez de seguir `beatLookup.previousBeat`: esa
      // cadena no cruza el límite de compás, así que en el primer golpe de
      // cada compás devolvía nada y el salto se iba al principio de la pista.
      const previous = cache.findBeat(tracks, found.start - 1);
      seekToTick(previous ? previous.start : 0);
    },
    [master, paneTracks, seekToTick],
  );

  const notesAtTick = useCallback(
    (trackIndex: number, tick: number): PlayingNote[] => {
      const cache = master()?.tickCache;
      if (!cache) return [];
      const found = cache.findBeat(new Set([trackIndex]), tick);
      return found?.beat ? readPlayingNotes(found.beat) : [];
    },
    [master],
  );

  const jumpSection = useCallback(
    (direction: -1 | 1) => {
      const m = master();
      if (!m) return;
      if (sections.length === 0) {
        // Sin marcadores de sección en el archivo, el salto cae a 4 compases.
        seekBars(direction * 4);
        return;
      }
      const target = findSectionJump(sections, m.tickPosition, direction);
      if (target) seekToTick(target.tick);
      else if (direction === -1) seekToTick(0);
    },
    [master, sections, seekBars, seekToTick],
  );

  const setSpeed = useCallback((value: number) => {
    setSpeedState(Math.max(0.1, Math.min(2, value)));
  }, []);

  const setLoop = useCallback((range: BarRange | null) => setLoopState(range), []);
  const setIsLooping = useCallback((looping: boolean) => setIsLoopingState(looping), []);

  /**
   * Ctrl+clic sobre un compás: el primero fija un loop de un solo compás y
   * queda como ancla; el siguiente extiende el rango hasta él. El tercero
   * vuelve a empezar, de modo que marcar un tramo nuevo nunca obliga a
   * borrar el anterior.
   */
  const loopAnchor = useRef<number | null>(null);

  const toggleLoopBar = useCallback((barIndex: number) => {
    const bar = Math.max(0, barIndex);
    setLoopState(() => {
      const anchor = loopAnchor.current;
      if (anchor === null) {
        loopAnchor.current = bar;
        return { startBar: bar, endBar: bar };
      }
      loopAnchor.current = null;
      return { startBar: Math.min(anchor, bar), endBar: Math.max(anchor, bar) };
    });
    setIsLoopingState(true);
  }, []);

  const clearLoop = useCallback(() => {
    loopAnchor.current = null;
    setLoopState(null);
    setIsLoopingState(false);
  }, []);

  const loopCurrentBar = useCallback(() => {
    const m = master();
    const score = m?.score;
    if (!m || !score) return;
    const bar = barIndexAtTick(score, m.tickPosition);
    setLoopState({ startBar: bar, endBar: bar });
    setIsLoopingState(true);
  }, [master]);

  const setTuningShift = useCallback((value: number) => {
    setTuningShiftState(clampSemitones(value));
  }, []);

  const setFretShift = useCallback((value: number) => {
    setFretShiftState(clampSemitones(value));
  }, []);

  const setMetronome = useCallback((on: boolean) => {
    setMetronomeState(on);
    writePref(PREF_KEYS.metronome, on);
  }, []);

  const setMetronomeVolume = useCallback((gain: number) => {
    const clamped = Math.min(MAX_METRONOME_VOLUME, Math.max(0, gain));
    setMetronomeVolumeState(clamped);
    writePref(PREF_KEYS.metronomeVolume, clamped);
  }, []);

  const setCountIn = useCallback((on: boolean) => {
    setCountInState(on);
    writePref(PREF_KEYS.countIn, on);
  }, []);

  const setCountInBeats = useCallback((beats: number) => {
    const option = normalizeCountInBeats(beats);
    setCountInBeatsState(option);
    writePref(PREF_KEYS.countInBeats, option);
  }, []);

  // --- sincronización de estado hacia alphaTab ---

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);


  useEffect(() => {
    const m = master();
    if (m) m.playbackSpeed = speed;
  }, [master, speed, isReady, file]);

  useEffect(() => {
    const m = master();
    if (m) m.metronomeVolume = metronome ? metronomeVolume : 0;
  }, [master, metronome, metronomeVolume, isReady, file]);

  useEffect(() => {
    // El compás de entrada lo lleva `countIn.ts`, porque el de alphaTab dura
    // siempre un compás y aquí hace falta poder elegir los clicks.
    const m = master();
    if (m) m.countInVolume = 0;
  }, [master, isReady, file]);

  /**
   * Afinación del instrumento: desplaza la altura sonora sin tocar los trastes.
   *
   * `changeTrackTranspositionPitch` escribe la capa "live" de transposición por
   * canal del sintetizador, que es distinta e independiente de la capa que
   * instala la generación del midi (la del "Ajuste de notas"). El sintetizador
   * suma las dos al arrancar cada nota, así que la altura final queda en
   * `original + fretShift + tuningShift`, y como no toca el modelo no provoca
   * ningún re-render de la tablatura: los trastes mostrados no cambian.
   *
   * Tampoco hace falta re-aplicarla cuando cambia el "Ajuste de notas":
   * recargar el midi reemplaza la capa de canción pero deja la live intacta
   * (verificado en `scripts/verify-transposition.mjs`).
   *
   * Se excluye la percusión: ahí el número no es una altura sino el tambor que
   * se golpea.
   */
  useEffect(() => {
    const m = master();
    if (m?.score) m.changeTrackTranspositionPitch(pitchedTracks(m.score.tracks), tuningShift);
  }, [master, tuningShift, isReady, file]);

  useEffect(() => {
    const m = master();
    const score = m?.score;
    if (!m || !score) return;
    if (!loop) {
      if (appliedRangeRef.current !== null) {
        m.playbackRange = null;
        appliedRangeRef.current = null;
      }
      m.isLooping = false;
      return;
    }
    const ticks = barRangeToTicks(score, loop);
    const applied = appliedRangeRef.current;
    const unchanged =
      ticks !== null &&
      applied !== null &&
      ticks.startTick === applied.startTick &&
      ticks.endTick === applied.endTick;

    if (!unchanged) {
      m.playbackRange = ticks ? { startTick: ticks.startTick, endTick: ticks.endTick } : null;
      appliedRangeRef.current = ticks ? { startTick: ticks.startTick, endTick: ticks.endTick } : null;
    }
    m.isLooping = isLooping;
  }, [master, loop, isLooping, isReady, file]);

  const value: TabPlayerValue = {
    file,
    error,
    isLoading,
    openFile,
    closeFile,
    library,
    currentLibraryName,
    openFromLibrary,
    recentName,
    reopenRecent,
    canRememberFiles,
    scoreTitle: metaScore?.title || null,
    scoreArtist: metaScore?.artist || null,
    tracks,
    sections,
    barCount,
    barStartTicks,

    paneTracks,
    activePane,
    setActivePane,
    setPaneCount,
    setPaneTrack,

    transport,
    isReady,
    playPause,
    stop,
    seekToTick,
    seekBars,
    seekBeats,
    notesAtTick,
    jumpSection,
    speed,
    setSpeed,

    loop,
    setLoop,
    isLooping,
    setIsLooping,
    loopCurrentBar,

    tuningShift,
    setTuningShift,
    fretShift,
    setFretShift,
    tuningFor,

    metronome,
    setMetronome,
    metronomeVolume,
    setMetronomeVolume,
    countIn,
    setCountIn,
    countInBeats,
    setCountInBeats,
    isCountingIn,
    toggleLoopBar,
    clearLoop,

    positionStore,
    registerPane,
    unregisterPane,
  };

  return <TabPlayerContext.Provider value={value}>{children}</TabPlayerContext.Provider>;
}
