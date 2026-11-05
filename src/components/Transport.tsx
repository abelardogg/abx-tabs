import { useSyncExternalStore } from 'react';
import { useTabPlayer } from '../player/TabPlayerProvider';
import { barIndexFromStarts } from '../lib/bars';

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1];

function formatTime(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function Transport() {
  const {
    positionStore,
    transport,
    isReady,
    playPause,
    stop,
    seekToTick,
    seekBars,
    jumpSection,
    speed,
    setSpeed,
    file,
    barCount,
    barStartTicks,
  } = useTabPlayer();

  const position = useSyncExternalStore(positionStore.subscribe, positionStore.getSnapshot);

  const disabled = !file;
  const currentBar = barCount > 0 ? barIndexFromStarts(barStartTicks, position.currentTick) + 1 : 0;
  const scrubMax = Math.max(1, position.endTick);

  return (
    <div className="transport">
      <div className="transport__buttons">
        <button
          type="button"
          onClick={() => jumpSection(-1)}
          disabled={disabled}
          title="Sección anterior (doble ←)"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => seekBars(-1)}
          disabled={disabled}
          title="Compás anterior (←)"
        >
          ◀
        </button>
        <button
          type="button"
          className="transport__play"
          onClick={playPause}
          disabled={disabled || !isReady}
          title="Play / Pause (Espacio)"
        >
          {transport === 'playing' ? '❚❚' : '▶'}
        </button>
        <button type="button" onClick={stop} disabled={disabled} title="Detener">
          ■
        </button>
        <button
          type="button"
          onClick={() => seekBars(1)}
          disabled={disabled}
          title="Compás siguiente (→)"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => jumpSection(1)}
          disabled={disabled}
          title="Sección siguiente (doble →)"
        >
          ⏭
        </button>
      </div>

      <div className="transport__scrub">
        <span className="transport__time">{formatTime(position.currentTime)}</span>
        <input
          type="range"
          min={0}
          max={scrubMax}
          value={Math.min(position.currentTick, scrubMax)}
          onChange={e => seekToTick(Number(e.target.value))}
          disabled={disabled || position.endTick === 0}
          aria-label="Posición"
        />
        <span className="transport__time">{formatTime(position.endTime)}</span>
      </div>

      <div className="transport__meta">
        {barCount > 0 && (
          <span className="transport__bar">
            Compás {currentBar} / {barCount}
          </span>
        )}
        {file && !isReady && <span className="transport__loading">cargando audio…</span>}
      </div>

      <label className="transport__speed">
        <span>Velocidad</span>
        <input
          type="range"
          min={0.25}
          max={1.5}
          step={0.05}
          value={speed}
          onChange={e => setSpeed(Number(e.target.value))}
          disabled={disabled}
          aria-label="Velocidad de reproducción"
        />
        <output>{Math.round(speed * 100)}%</output>
      </label>

      <div className="transport__presets">
        {SPEED_PRESETS.map(preset => (
          <button
            key={preset}
            type="button"
            className={speed === preset ? 'is-on' : undefined}
            onClick={() => setSpeed(preset)}
            disabled={disabled}
          >
            {preset * 100}%
          </button>
        ))}
      </div>
    </div>
  );
}
