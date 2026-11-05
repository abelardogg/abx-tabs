import { useSyncExternalStore } from 'react';
import { StringBoard } from './StringBoard';
import {
  MAX_COUNT_IN_BEATS,
  MAX_METRONOME_VOLUME,
  useTabPlayer,
} from '../player/TabPlayerProvider';
import { formatSemitones } from '../lib/tuning';
import { barIndexFromStarts } from '../lib/bars';

function SemitoneStepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={disabled || value <= -12}>
        −
      </button>
      <output className={value === 0 ? undefined : 'is-shifted'}>{formatSemitones(value)}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={disabled || value >= 12}>
        +
      </button>
      <button
        type="button"
        className="stepper__reset"
        onClick={() => onChange(0)}
        disabled={disabled || value === 0}
        title="Volver a 0"
      >
        ⟲
      </button>
    </div>
  );
}

export function SidePanel() {
  const {
    file,
    paneTracks,
    activePane,
    tracks,
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
    clearLoop,
    loop,
    setLoop,
    isLooping,
    setIsLooping,
    loopCurrentBar,
    barCount,
    barStartTicks,
    sections,
    seekToTick,
    positionStore,
  } = useTabPlayer();

  const position = useSyncExternalStore(positionStore.subscribe, positionStore.getSnapshot);
  const disabled = !file;

  const activeTrackIndex = paneTracks[activePane] ?? 0;
  const activeTrack = tracks.find(t => t.index === activeTrackIndex) ?? null;
  const tuning = tuningFor(activeTrackIndex);

  const currentBar = barCount > 0 ? barIndexFromStarts(barStartTicks, position.currentTick) : 0;
  const currentSection = sections.length
    ? [...sections].reverse().find(s => s.barIndex <= currentBar) ?? null
    : null;

  const loopStart = loop ? loop.startBar + 1 : 1;
  const loopEnd = loop ? loop.endBar + 1 : Math.max(1, barCount);

  const updateLoop = (startBar: number, endBar: number) => {
    const maxBar = Math.max(1, barCount);
    const start = Math.max(1, Math.min(maxBar, startBar));
    const end = Math.max(start, Math.min(maxBar, endBar));
    setLoop({ startBar: start - 1, endBar: end - 1 });
  };

  return (
    <aside className="side">
      <StringBoard />

      <section className="side__block">
        <h2>Afinación</h2>
        {activeTrack && <p className="side__subject">{activeTrack.name}</p>}
        {!tuning && <p className="side__empty">Abre un archivo para ver la afinación.</p>}
        {tuning?.isPercussion && <p className="side__empty">Pista de percusión: sin afinación.</p>}
        {tuning && !tuning.isPercussion && tuning.strings.length === 0 && (
          <p className="side__empty">Esta pista no declara afinación de cuerdas.</p>
        )}
        {tuning && !tuning.isPercussion && tuning.strings.length > 0 && (
          <>
            <ol className="tuning">
              {tuning.strings.map(string => (
                <li key={string.stringNumber} className="tuning__row">
                  <span className="tuning__num">{string.stringNumber}</span>
                  <span className="tuning__note">{string.shiftedLabel}</span>
                  {tuningShift !== 0 && (
                    <span className="tuning__orig">era {string.originalLabel}</span>
                  )}
                </li>
              ))}
            </ol>
            <p className="tuning__name">
              {tuningShift === 0
                ? tuning.name
                : (tuning.shiftedName ?? `${tuning.name} ${formatSemitones(tuningShift)}`)}
            </p>
          </>
        )}
      </section>

      <section className="side__block">
        <h2>Transposición de tono</h2>
        <p className="side__help">
          Afina el instrumento completo en semitonos. Los trastes de la tablatura no cambian: lo
          que cambia es la altura a la que suena.
        </p>
        <SemitoneStepper
          value={tuningShift}
          onChange={setTuningShift}
          disabled={disabled}
          label="Transposición de afinación en semitonos"
        />
      </section>

      <section className="side__block">
        <h2>Ajuste de notas</h2>
        <p className="side__help">
          Mueve los trastes mostrados para tocar la misma nota desde otra afinación. Útil si tu
          instrumento ya está afinado distinto al archivo.
        </p>
        <SemitoneStepper
          value={fretShift}
          onChange={setFretShift}
          disabled={disabled}
          label="Ajuste de notas en semitonos"
        />
        {fretShift !== 0 && (
          <p className="side__note">
            Trastes desplazados {formatSemitones(fretShift)}; suena{' '}
            {formatSemitones(tuningShift + fretShift)} respecto al original.
          </p>
        )}
      </section>

      <section className="side__block">
        <h2>Metrónomo</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={metronome}
            onChange={e => setMetronome(e.target.checked)}
            disabled={disabled}
          />
          <span>Click en cada pulso</span>
        </label>
        <label className="slider">
          <span>Volumen</span>
          <input
            type="range"
            min={0}
            max={MAX_METRONOME_VOLUME}
            step={0.1}
            value={metronomeVolume}
            onChange={e => setMetronomeVolume(Number(e.target.value))}
            disabled={disabled || !metronome}
            aria-label="Volumen del metrónomo"
          />
          <output>{Math.round(metronomeVolume * 100)}%</output>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={countIn}
            onChange={e => setCountIn(e.target.checked)}
            disabled={disabled}
          />
          <span>Compás de entrada</span>
        </label>
        <label className="slider">
          <span>Clicks</span>
          <input
            type="number"
            min={1}
            max={MAX_COUNT_IN_BEATS}
            value={countInBeats}
            onChange={e => setCountInBeats(Number(e.target.value))}
            disabled={disabled || !countIn}
            aria-label="Clicks del compás de entrada"
          />
          {isCountingIn && <output className="is-live">sonando…</output>}
        </label>
      </section>

      <section className="side__block">
        <h2>Loop</h2>
        <p className="side__help">
          <kbd>Ctrl</kbd> + clic en un compás lo marca; otro <kbd>Ctrl</kbd> + clic extiende el
          tramo hasta él. También puedes arrastrar sobre la tablatura. <kbd>Esc</kbd> lo quita.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={isLooping}
            onChange={e => setIsLooping(e.target.checked)}
            disabled={disabled || !loop}
          />
          <span>Repetir segmento</span>
        </label>
        <div className="loopbars">
          <label>
            <span>Desde</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, barCount)}
              value={loopStart}
              onChange={e => updateLoop(Number(e.target.value), loopEnd)}
              disabled={disabled}
            />
          </label>
          <label>
            <span>Hasta</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, barCount)}
              value={loopEnd}
              onChange={e => updateLoop(loopStart, Number(e.target.value))}
              disabled={disabled}
            />
          </label>
        </div>
        <div className="side__actions">
          <button type="button" onClick={loopCurrentBar} disabled={disabled}>
            Compás actual
          </button>
          <button
            type="button"
            onClick={clearLoop}
            disabled={disabled || !loop}
          >
            Quitar
          </button>
        </div>
      </section>

      <section className="side__block">
        <h2>Secciones</h2>
        {sections.length === 0 ? (
          <p className="side__empty">
            {file
              ? 'Este archivo no trae marcadores; el doble ← → salta 4 compases.'
              : 'Sin archivo abierto.'}
          </p>
        ) : (
          <ul className="sections">
            {sections.map(section => (
              <li key={`${section.barIndex}-${section.label}`}>
                <button
                  type="button"
                  className={currentSection === section ? 'is-on' : undefined}
                  onClick={() => seekToTick(section.tick)}
                >
                  <span className="sections__bar">{section.barIndex + 1}</span>
                  <span>{section.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="side__block side__block--keys">
        <h2>Teclado</h2>
        <dl>
          <dt>Espacio</dt>
          <dd>play / pause</dd>
          <dt>← →</dt>
          <dd>nota anterior / siguiente</dd>
          <dt>Ctrl + ← →</dt>
          <dd>compás anterior / siguiente</dd>
          <dt>Ctrl + ←← →→</dt>
          <dd>sección anterior / siguiente</dd>
          <dt>↑ ↓</dt>
          <dd>desplazar el panel activo</dd>
          <dt>Ctrl + clic</dt>
          <dd>marcar compases del loop</dd>
          <dt>Esc</dt>
          <dd>quitar el loop</dd>
        </dl>
      </section>
    </aside>
  );
}
