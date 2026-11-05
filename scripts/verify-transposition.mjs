/**
 * Verifica la semántica de los dos controles de tono midiéndola contra
 * alphaTab real (nada de maquetas: se usa el importador, el generador de midi
 * y el sintetizador de verdad).
 *
 * Comportamiento objetivo:
 *   traste mostrado = traste original + fretShift
 *   altura sonora   = altura original + fretShift + tuningShift
 *
 * La cadena que reproduce este script es la misma que arma `AlphaTabApiBase`:
 *
 *   1. "Ajuste de notas" (fretShift) se escribe en
 *      `settings.notation.transpositionPitches`. `updateSettings()` lo copia al
 *      modelo con el signo invertido (`staff.transpositionPitch = -fretShift`),
 *      y el renderer de tablatura dibuja `note.fret - staff.transpositionPitch`,
 *      o sea el traste original + fretShift.
 *   2. `loadMidiForScore()` genera el midi con `applyTranspositionPitches =
 *      false`: NO hornea el offset en la key de cada nota, lo entrega como
 *      transposición por canal (capa "de la canción") al player.
 *   3. "Transposición de tono" (tuningShift) se aplica con
 *      `changeTrackTranspositionPitch`, que escribe otra capa por canal
 *      independiente (capa "live").
 *   4. `channelNoteOn` del sintetizador suma LAS DOS capas a la key del midi:
 *      altura sonora = key del midi + capa canción + capa live.
 *
 * El paso 4 no se simula: se instancia el sintetizador real con una salida de
 * audio falsa y se intercepta `noteOn` para leer la key con la que la nota
 * acaba sonando.
 *
 * Ejecutar con: node scripts/verify-transposition.mjs
 */
import { Settings, importer, midi, model, synth } from '@coderline/alphatab';
import { pitchedTracks, tonePitchesPerTrack } from '../src/lib/tuning.ts';

/** Guitarra estándar: 6ª cuerda al aire y traste 5 de la misma, dos veces. */
const GUITAR_TEX = ':4 0.6 5.6 | 0.6 5.6';

/** Guitarra + percusión, para comprobar que los tambores no se transponen. */
const BAND_TEX = String.raw`\track "Gtr"
:4 0.6 5.6 | 0.6 5.6
\track "Drums" \instrument percussion
:4 36 38 | 36 38`;

/**
 * Replica de `ModelUtils.applyPitchOffsets`, que no está exportado. Solo
 * `AlphaTabApiBase` lo llama (en `updateSettings()` y al renderizar pistas);
 * `ScoreLoader` no, así que en un script hay que aplicarlo a mano o
 * `staff.transpositionPitch` se queda en 0 y la tablatura no se desplaza.
 */
function applyPitchOffsets(settings, score) {
  for (let i = 0; i < score.tracks.length; i++) {
    if (i < settings.notation.transpositionPitches.length) {
      for (const staff of score.tracks[i].staves) {
        staff.transpositionPitch = -settings.notation.transpositionPitches[i];
      }
    }
  }
}

/** Carga un alphaTex y le aplica el "Ajuste de notas" como lo hace la app. */
function loadScore(tex, fretShift) {
  const settings = new Settings();
  const score = importer.ScoreLoader.loadAlphaTex(tex, settings);
  settings.notation.transpositionPitches = tonePitchesPerTrack(score.tracks, fretShift);
  applyPitchOffsets(settings, score);
  return { score, settings };
}

/** Trastes tal como los dibuja el renderer de tablatura, por pista. */
function displayedFrets({ score }, trackIndex = 0) {
  const frets = [];
  for (const staff of score.tracks[trackIndex].staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          for (const note of beat.notes) {
            frets.push(note.fret - staff.transpositionPitch);
          }
        }
      }
    }
  }
  return frets;
}

/**
 * Genera el midi igual que `loadMidiForScore()` y devuelve las notas (key +
 * canal + pista) junto con la transposición por canal que la app le pasa al
 * player.
 *
 * `bakeIntoKeys` existe solo para el diagnóstico de doble aplicación: es el
 * valor por defecto de `MidiFileGenerator`, pero la app usa `false`.
 */
function generateMidi({ score, settings }, { bakeIntoKeys = false } = {}) {
  const notes = [];
  // El handler real envuelto en un Proxy: implementar `IMidiFileHandler` a
  // mano se queda corto (faltarían métodos como `addTickShift`).
  const real = new midi.AlphaSynthMidiFileHandler(new midi.MidiFile());
  const handler = new Proxy(real, {
    get(target, prop) {
      if (prop === 'addNote') {
        return (track, start, length, key, velocity, channel) => {
          notes.push({ track, key, channel });
          return target.addNote(track, start, length, key, velocity, channel);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const generator = new midi.MidiFileGenerator(score, settings, handler);
  generator.applyTranspositionPitches = bakeIntoKeys;
  generator.generate();
  return { notes, songTransposition: generator.transpositionPitches };
}

function fakeEventEmitter() {
  return { on() {}, off() {}, trigger() {} };
}

/** Salida de audio inerte: el sintetizador solo tiene que calcular keys. */
function fakeOutput() {
  return {
    sampleRate: 44100,
    open() {},
    play() {},
    pause() {},
    destroy() {},
    addSamples() {},
    resetSamples() {},
    activate() {},
    ready: fakeEventEmitter(),
    samplesPlayed: fakeEventEmitter(),
    sampleRequest: fakeEventEmitter(),
    async enumerateOutputDevices() {
      return [];
    },
    async setOutputDevice() {},
    async getOutputDevice() {
      return null;
    },
  };
}

/**
 * Alturas con las que suena realmente cada nota: se montan las dos capas de
 * transposición en el sintetizador de alphaTab y se lee la key final.
 */
function soundingPitches(loaded, tuningShift, options) {
  const { notes, songTransposition } = generateMidi(loaded, options);

  const player = new synth.AlphaSynth(fakeOutput(), 0);
  const synthesizer = player.synthesizer;

  // Los canales solo existen una vez tocados; `setChannelVolume` los crea.
  for (const track of loaded.score.tracks) {
    player.setChannelVolume(track.playbackInfo.primaryChannel, 1);
    player.setChannelVolume(track.playbackInfo.secondaryChannel, 1);
  }

  // Capa "de la canción": lo que hace `loadMidiForScore()` al final.
  player.applyTranspositionPitches(songTransposition);
  // Capa "live": lo que hace `api.changeTrackTranspositionPitch(...)`.
  for (const track of pitchedTracks(loaded.score.tracks)) {
    player.setChannelTranspositionPitch(track.playbackInfo.primaryChannel, tuningShift);
    player.setChannelTranspositionPitch(track.playbackInfo.secondaryChannel, tuningShift);
  }

  const sounded = [];
  synthesizer.noteOn = (_presetIndex, key) => sounded.push(key);
  return notes.map(note => {
    sounded.length = 0;
    synthesizer.channelNoteOn(note.channel, note.key, 1);
    if (sounded.length !== 1) {
      throw new Error(`El sintetizador no arrancó la nota del canal ${note.channel}`);
    }
    return { track: note.track, pitch: sounded[0] };
  });
}

/** Alturas de una pista concreta. */
function pitchesOf(sounding, trackIndex = 0) {
  return sounding.filter(n => n.track === trackIndex).map(n => n.pitch);
}

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${label}`);
  if (!ok) console.log(`        esperado ${e}\n        obtenido ${a}`);
}

// --- referencia: el archivo sin ningún ajuste -------------------------------

const base = loadScore(GUITAR_TEX, 0);
const baseFrets = displayedFrets(base);
const basePitches = pitchesOf(soundingPitches(base, 0));
const lowString = base.score.tracks[0].staves[0].stringTuning.tunings.at(-1);

console.log(`6ª cuerda al aire: ${model.Tuning.getTextForTuning(lowString, true)} (midi ${lowString})`);
console.log(`Trastes del archivo: ${JSON.stringify(baseFrets)}`);
console.log(`Alturas sonoras:     ${JSON.stringify(basePitches)}\n`);

if (basePitches.length === 0) {
  console.log('FALLA No se generó ninguna nota; la verificación no es concluyente.');
  process.exit(1);
}

check('sin ajustes · trastes intactos', baseFrets, [0, 5, 0, 5]);
check('sin ajustes · altura intacta', basePitches, [40, 45, 40, 45]);

// --- caso 1: solo afinar el instrumento (tuningShift = -1) ------------------

check('tuningShift -1 · trastes intactos', displayedFrets(loadScore(GUITAR_TEX, 0)), baseFrets);
check(
  'tuningShift -1 · todo suena 1 semitono abajo',
  pitchesOf(soundingPitches(loadScore(GUITAR_TEX, 0), -1)),
  basePitches.map(p => p - 1),
);

// --- caso 2: solo ajuste de notas (fretShift = +2) --------------------------

check(
  'fretShift +2 · trastes suben 2',
  displayedFrets(loadScore(GUITAR_TEX, 2)),
  baseFrets.map(f => f + 2),
);
check(
  'fretShift +2 · altura sube 2 (una sola vez, no dos)',
  pitchesOf(soundingPitches(loadScore(GUITAR_TEX, 2), 0)),
  basePitches.map(p => p + 2),
);

// --- caso 3: el uso real combinado -----------------------------------------
// Instrumento afinado 1 semitono abajo y trastes movidos +1 para compensar:
// debe sonar exactamente igual que el archivo original.

check(
  'tuningShift -1 + fretShift +1 · trastes suben 1',
  displayedFrets(loadScore(GUITAR_TEX, 1)),
  baseFrets.map(f => f + 1),
);
check(
  'tuningShift -1 + fretShift +1 · altura vuelve al original',
  pitchesOf(soundingPitches(loadScore(GUITAR_TEX, 1), -1)),
  basePitches,
);

// --- caso 4: la percusión no se transpone ----------------------------------
// En una pista de percusión el número es la articulación (qué tambor suena),
// no una altura: transponerla cambiaría el instrumento golpeado.

const band = loadScore(BAND_TEX, 0);
const bandDrums = pitchesOf(soundingPitches(band, 0), 1);
const shiftedBand = soundingPitches(loadScore(BAND_TEX, 2), -1);

check('percusión · articulaciones del archivo', bandDrums, [36, 38, 36, 38]);
check(
  'fretShift +2 y tuningShift -1 · la guitarra sí se desplaza (+1)',
  pitchesOf(shiftedBand, 0),
  basePitches.map(p => p + 1),
);
check(
  'fretShift +2 y tuningShift -1 · los tambores siguen intactos',
  pitchesOf(shiftedBand, 1),
  bandDrums,
);

// --- diagnóstico: por qué la app depende de `loadMidiForScore()` ------------
// `MidiFileGenerator` viene con `applyTranspositionPitches = true`, que hornea
// el offset en la key de cada nota ADEMÁS de mandarlo como transposición de
// canal: ahí sí hay doble aplicación. `loadMidiForScore()` lo pone en false, y
// por eso la app suma el desplazamiento una sola vez.

const doubled = pitchesOf(soundingPitches(loadScore(GUITAR_TEX, 2), 0, { bakeIntoKeys: true }));
check(
  'diagnóstico · con applyTranspositionPitches=true el offset se aplicaría dos veces',
  doubled,
  basePitches.map(p => p + 4),
);

console.log(failures === 0 ? '\nTodo correcto.' : `\n${failures} comprobación(es) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
