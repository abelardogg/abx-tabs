import { useSyncExternalStore } from 'react';
import { useTabPlayer } from '../player/TabPlayerProvider';
import { midiToNoteLabel } from '../lib/tuning';

/**
 * Las cuerdas del instrumento activo, con la nota que suena en cada una.
 *
 * Se listan todas las cuerdas siempre, en el mismo orden que en la tablatura,
 * para que la posición de cada fila no baile: las que no se tocan quedan en
 * blanco. Así se lee de un vistazo qué cuerdas entran en cada golpe.
 */
export function StringBoard() {
  const {
    file,
    paneTracks,
    activePane,
    tracks,
    tuningFor,
    notesAtTick,
    fretShift,
    tuningShift,
    positionStore,
  } = useTabPlayer();

  const position = useSyncExternalStore(positionStore.subscribe, positionStore.getSnapshot);

  if (!file) return null;

  const trackIndex = paneTracks[activePane] ?? 0;
  const track = tracks.find(t => t.index === trackIndex) ?? null;
  const tuning = tuningFor(trackIndex);

  if (!tuning || tuning.isPercussion || tuning.strings.length === 0) {
    return (
      <section className="side__block">
        <h2>Sonando</h2>
        <p className="side__empty">
          {tuning?.isPercussion
            ? 'Pista de percusión: sin cuerdas que mostrar.'
            : 'Esta pista no declara afinación de cuerdas.'}
        </p>
      </section>
    );
  }

  const playing = notesAtTick(trackIndex, position.currentTick);
  // Indexado por número de cuerda para poder recorrer las cuerdas, y no las
  // notas: lo que importa es que aparezcan todas, suenen o no.
  const byString = new Map(
    playing.filter(note => note.stringNumber !== null).map(note => [note.stringNumber, note]),
  );

  return (
    <section className="side__block">
      <h2>Sonando</h2>
      {track && <p className="side__subject">{track.name}</p>}

      <ol className="board">
        {tuning.strings.map(string => {
          const note = byString.get(string.stringNumber);
          const fret = note?.rawFret === null || note?.rawFret === undefined
            ? null
            : note.rawFret + fretShift;

          return (
            <li
              key={string.stringNumber}
              className={`board__row${note ? ' board__row--on' : ''}`}
            >
              <span className="board__num">{string.stringNumber}</span>
              <span className="board__open">{string.shiftedLabel}</span>
              <span className="board__note">
                {note ? midiToNoteLabel((note.originalMidi ?? 0) + fretShift + tuningShift) : ''}
              </span>
              <span className="board__fret">
                {fret === null ? '' : fret === 0 ? 'al aire' : fret}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="board__legend">
        <span>cuerda</span>
        <span>al aire</span>
        <span>suena</span>
        <span>traste</span>
      </p>
    </section>
  );
}
