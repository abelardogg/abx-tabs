import type { AlphaTabApi } from '@coderline/alphatab';
import { readPlayingNotes } from '../lib/notes';
import { midiToNoteLabel } from '../lib/tuning';

export interface ToneShifts {
  fretShift: number;
  tuningShift: number;
}

export interface BeatMarkerOptions {
  api: AlphaTabApi;
  /** Elemento flotante que muestra los nombres; va sobre la tablatura. */
  overlay: HTMLElement;
  /** Pista que renderiza este panel. */
  trackIndex: number;
  shifts: ToneShifts;
}

export interface BeatMarker {
  update(tick: number): void;
  hide(): void;
}

/**
 * Rotula, encima del compás, las notas del golpe que está sonando.
 *
 * No usa el evento `playedBeatChanged` porque ese solo lo emite el panel que
 * reproduce: resolviendo el golpe desde el tick con `tickCache` cada panel
 * puede rotular su propio instrumento, que es lo que hace falta en pantalla
 * partida.
 *
 * Escribe en el DOM directamente en vez de pasar por estado de React: la
 * posición llega unas 20 veces por segundo y no merece un re-render.
 */
export function createBeatMarker({
  api,
  overlay,
  trackIndex,
  shifts,
}: BeatMarkerOptions): BeatMarker {
  const tracks = new Set([trackIndex]);
  let lastKey = '';

  function hide(): void {
    if (lastKey === '') return;
    lastKey = '';
    overlay.hidden = true;
    overlay.textContent = '';
  }

  function update(tick: number): void {
    const cache = api.tickCache;
    const lookup = api.boundsLookup;
    if (!cache || !lookup) {
      hide();
      return;
    }

    const found = cache.findBeat(tracks, tick);
    const beat = found?.beat;
    if (!beat) {
      hide();
      return;
    }

    const bounds = lookup.findBeat(beat);
    if (!bounds) {
      hide();
      return;
    }

    const notes = readPlayingNotes(beat);
    const text = notes
      .map(note =>
        note.isPercussion
          ? note.percussionName
          : midiToNoteLabel((note.originalMidi ?? 0) + shifts.fretShift + shifts.tuningShift),
      )
      .join(' ');

    if (!text) {
      hide();
      return;
    }

    // El compás da la altura; el golpe, la posición horizontal. `onNotesX` es
    // la columna donde alphaTab alinea las cabezas de nota, así que el rótulo
    // queda a plomo con lo que se está tocando.
    const barTop = bounds.barBounds.masterBarBounds.visualBounds.y;
    const x = bounds.onNotesX;

    const key = `${x}|${barTop}|${text}`;
    if (key === lastKey) return;
    lastKey = key;

    overlay.textContent = text;
    overlay.hidden = false;
    overlay.style.left = `${x}px`;

    // El rótulo se dibuja por encima de `top` (lo sube un transform en CSS).
    // En el primer compás de la partitura no hay sitio arriba y se saldría de
    // la vista, así que se le pone un suelo igual a su propia altura.
    const lift = overlay.offsetHeight * 1.16 + 2;
    overlay.style.top = `${Math.max(barTop, lift)}px`;
  }

  return { update, hide };
}
