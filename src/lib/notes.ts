import type { model } from '@coderline/alphatab';

export interface PlayingNote {
  /** Clave estable para React dentro de un mismo golpe. */
  key: string;
  /** Cuerda en la que se toca; `null` si la nota no es de cuerda. */
  stringNumber: number | null;
  /** Traste tal como viene en el archivo, sin ningún desplazamiento. */
  rawFret: number | null;
  /**
   * Altura midi tal como viene en el archivo, sin ningún desplazamiento.
   * `null` en percusión, donde el número midi identifica el tambor y no una
   * altura.
   */
  originalMidi: number | null;
  /** Nombre del elemento de percusión; vacío en notas con altura. */
  percussionName: string;
  isPercussion: boolean;
  /** Nota fantasma (entre paréntesis en la tablatura). */
  isGhost: boolean;
  /** Nota muerta / apagada. */
  isDead: boolean;
}

/**
 * Nombre del elemento de percusión que declara la pista, si lo declara.
 *
 * Los mapeos por defecto viven en `PercussionMapper`, que alphaTab no exporta,
 * así que cuando el archivo no trae articulaciones propias no se intenta
 * adivinar el nombre del tambor.
 */
function percussionLabel(note: model.Note): string {
  const articulations = note.beat.voice.bar.staff.track.percussionArticulations;
  const match = articulations?.find(a => a.id === note.percussionArticulation);
  return match?.elementType || 'percusión';
}

/**
 * Lee las notas de un golpe quedándose solo con los datos del archivo.
 *
 * Deliberadamente NO se aplica aquí ninguno de los dos desplazamientos de
 * tono: lo que se devuelve es una instantánea inmutable, y quien la muestra
 * les suma los valores vigentes. Guardar cifras ya desplazadas las dejaba
 * obsoletas en cuanto se movía un control, porque el modelo de alphaTab cambia
 * por debajo pero la copia no.
 *
 * `realValue` incluye el ajuste de notas a través de
 * `staff.transpositionPitch` (que vale `-fretShift`), así que sumarle ese
 * mismo campo lo cancela y deja la altura original del archivo. Se hace de
 * esta forma, en vez de recalcular a mano, para no duplicar la aritmética de
 * alphaTab con armónicos y cuerdas al aire.
 */
export function readPlayingNotes(beat: model.Beat): PlayingNote[] {
  if (beat.isRest) return [];

  const notes = beat.notes.map((note, index) => {
    const staff = note.beat.voice.bar.staff;

    if (note.isPercussion) {
      return {
        key: `p${index}`,
        stringNumber: null,
        rawFret: null,
        originalMidi: null,
        percussionName: percussionLabel(note),
        isPercussion: true,
        isGhost: note.isGhost,
        isDead: note.isDead,
      };
    }

    return {
      key: note.isStringed ? `s${note.string}-${index}` : `n${index}`,
      stringNumber: note.isStringed ? note.string : null,
      rawFret: note.isStringed ? note.fret : null,
      originalMidi: note.realValue + staff.transpositionPitch,
      percussionName: '',
      isPercussion: false,
      isGhost: note.isGhost,
      isDead: note.isDead,
    };
  });

  // De la cuerda más aguda a la más grave, igual que se leen en la tablatura.
  return notes.sort((a, b) => (a.stringNumber ?? 99) - (b.stringNumber ?? 99));
}
