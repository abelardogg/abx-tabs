import type { model } from '@coderline/alphatab';

export interface BarRange {
  startBar: number;
  endBar: number;
}

/** Tick de inicio y de fin (exclusivo) de un rango de compases. */
export function barRangeToTicks(
  score: model.Score,
  range: BarRange,
): { startTick: number; endTick: number } | null {
  const bars = score.masterBars;
  if (bars.length === 0) return null;

  const first = Math.max(0, Math.min(range.startBar, range.endBar));
  const last = Math.min(bars.length - 1, Math.max(range.startBar, range.endBar));

  const startTick = bars[first].start;
  const lastBar = bars[last];
  const endTick = lastBar.nextMasterBar
    ? lastBar.nextMasterBar.start
    : lastBar.start + lastBar.calculateDuration();

  return { startTick, endTick };
}

/** Compás que contiene un tick dado. */
export function barIndexAtTick(score: model.Score, tick: number): number {
  const bars = score.masterBars;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (tick >= bars[i].start) return i;
  }
  return 0;
}

/**
 * Igual que `barIndexAtTick` pero sobre una lista de ticks de inicio, para la
 * UI, que conoce las posiciones de los compases sin tener el Score a mano.
 */
export function barIndexFromStarts(starts: number[], tick: number): number {
  if (starts.length === 0) return 0;
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid] <= tick) low = mid;
    else high = mid - 1;
  }
  return low;
}
