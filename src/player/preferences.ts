/**
 * Ajustes que sobreviven a recargar la página.
 *
 * Todo pasa por try/catch: en una ventana privada o con el almacenamiento
 * bloqueado `localStorage` lanza al leer y al escribir, y perder una
 * preferencia nunca debe tumbar la aplicación.
 */

const PREFIX = 'abx-tabs:';

export const PREF_KEYS = {
  metronome: `${PREFIX}metronome`,
  metronomeVolume: `${PREFIX}metronome-volume`,
  countIn: `${PREFIX}count-in`,
  countInBeats: `${PREFIX}count-in-beats`,
} as const;

export function readNumber(key: string, fallback: number, min: number, max: number): number {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

export function write(key: string, value: number | boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Sin almacenamiento: el ajuste vale solo para esta sesión.
  }
}
