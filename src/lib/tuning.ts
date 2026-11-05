import { model } from '@coderline/alphatab';

export interface TunedString {
  /** Número de cuerda visible en la tablatura: 1 es la más aguda. */
  stringNumber: number;
  /** Nota MIDI original tal como viene en el archivo. */
  originalMidi: number;
  /** Nota MIDI después de aplicar el desplazamiento de afinación. */
  shiftedMidi: number;
  originalLabel: string;
  shiftedLabel: string;
}

export interface TuningInfo {
  /** Nombre de la afinación original, p.ej. "Standard". */
  name: string;
  isStandard: boolean;
  /** De la cuerda más aguda a la más grave, como se leen de arriba abajo en la tab. */
  strings: TunedString[];
  /** Nombre de la afinación resultante si alphaTab la reconoce (p.ej. "Eb Standard"). */
  shiftedName: string | null;
  isPercussion: boolean;
}

export function midiToNoteLabel(midi: number): string {
  return model.Tuning.getTextForTuning(midi, true);
}

/**
 * Lee la afinación del staff y le aplica `tuningShift` semitonos.
 *
 * Esto modela afinar el instrumento físico: los trastes que se tocan no
 * cambian, cambia la altura de cada cuerda al aire.
 */
export function readTuning(staff: model.Staff, tuningShift: number): TuningInfo {
  const tuning = staff.stringTuning;
  // `tunings` viene de la cuerda más aguda a la más grave.
  const midis = tuning.tunings ?? [];

  const strings: TunedString[] = midis.map((midi, i) => ({
    stringNumber: i + 1,
    originalMidi: midi,
    shiftedMidi: midi + tuningShift,
    originalLabel: midiToNoteLabel(midi),
    shiftedLabel: midiToNoteLabel(midi + tuningShift),
  }));

  const shifted = model.Tuning.findTuning(strings.map(s => s.shiftedMidi));

  return {
    name: tuning.name || (tuning.isStandard ? 'Standard' : 'Personalizada'),
    isStandard: tuning.isStandard,
    strings,
    shiftedName: shifted?.name ?? null,
    isPercussion: staff.isPercussion,
  };
}

/**
 * Semitonos de transposición que le toca a cada pista del score, en el orden
 * que espera `settings.notation.transpositionPitches` (índice = índice de
 * pista).
 *
 * La percusión queda siempre en 0: ahí el "traste" es el id de articulación
 * (qué tambor se golpea), no una altura. Medido contra el sintetizador real:
 * `channelNoteOn` suma la transposición también en el canal 10 (índice 9), así
 * que si no se excluye explícitamente, transponer cambiaría el tambor que
 * suena (p.ej. bombo 36 → 37).
 */
export function tonePitchesPerTrack(tracks: readonly model.Track[], semitones: number): number[] {
  return tracks.map(track => (track.isPercussion ? 0 : semitones));
}

/**
 * Pistas a las que tiene sentido aplicarles una transposición de altura; se
 * excluye la percusión por el mismo motivo que en `tonePitchesPerTrack`.
 */
export function pitchedTracks(tracks: readonly model.Track[]): model.Track[] {
  return tracks.filter(track => !track.isPercussion);
}

export function formatSemitones(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}
