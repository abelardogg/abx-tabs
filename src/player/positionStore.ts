export interface PlaybackPosition {
  currentTick: number;
  endTick: number;
  currentTime: number;
  endTime: number;
}

const EMPTY: PlaybackPosition = { currentTick: 0, endTick: 0, currentTime: 0, endTime: 0 };

/**
 * La posición de reproducción se emite ~20 veces por segundo. Mantenerla en
 * estado de React re-renderizaría toda la app a esa frecuencia, así que vive
 * en este store y los componentes que la necesitan se suscriben con
 * `useSyncExternalStore`.
 */
export class PositionStore {
  private value: PlaybackPosition = EMPTY;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PlaybackPosition => this.value;

  set(next: PlaybackPosition): void {
    this.value = next;
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.set(EMPTY);
  }
}
