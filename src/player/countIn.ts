/**
 * Compás de entrada propio.
 *
 * alphaTab trae uno, pero su duración no se puede configurar: genera siempre
 * los clicks de un compás (`clickCount = timeSignatureNumerator`). Como aquí
 * hace falta elegir cuántos clicks suenan, se sintetiza aparte con Web Audio
 * y el de alphaTab se deja en silencio.
 *
 * El click es un tono corto con caída exponencial: se oye nítido por encima de
 * la música y no necesita ninguna muestra de audio.
 */

const ACCENT_HZ = 1600;
const BEAT_HZ = 1100;
const CLICK_SECONDS = 0.06;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

function scheduleClick(
  ctx: AudioContext,
  at: number,
  accent: boolean,
  gain: number,
): OscillatorNode {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = 'square';
  oscillator.frequency.value = accent ? ACCENT_HZ : BEAT_HZ;

  // Arranca en el volumen pedido y cae a silencio: un "tic" seco.
  const peak = Math.max(0.0001, gain * (accent ? 0.5 : 0.32));
  envelope.gain.setValueAtTime(peak, at);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + CLICK_SECONDS);

  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + CLICK_SECONDS);
  return oscillator;
}

export interface CountIn {
  /** Se resuelve cuando termina; `false` si se canceló. */
  finished: Promise<boolean>;
  cancel(): void;
}

export interface CountInOptions {
  beats: number;
  /** Pulsos por minuto ya ajustados a la velocidad de reproducción. */
  bpm: number;
  /** Ganancia, la misma del metrónomo. */
  volume: number;
  /** Cada cuántos pulsos cae el acento. 0 lo desactiva. */
  accentEvery?: number;
}

/**
 * Hace sonar los clicks y resuelve justo cuando debería entrar la música.
 */
export function startCountIn({
  beats,
  bpm,
  volume,
  accentEvery = 4,
}: CountInOptions): CountIn {
  const ctx = audioContext();
  const safeBeats = Math.max(1, Math.round(beats));
  const safeBpm = bpm > 0 ? bpm : 120;
  const interval = 60 / safeBpm;

  if (!ctx || volume <= 0) {
    // Sin audio disponible o en silencio: se respeta la espera igualmente,
    // para que el usuario tenga el tiempo de preparación que pidió.
    let timer = 0;
    const finished = new Promise<boolean>(resolve => {
      timer = window.setTimeout(() => resolve(true), safeBeats * interval * 1000);
    });
    return { finished, cancel: () => window.clearTimeout(timer) };
  }

  // Un contexto creado antes de la primera interacción arranca suspendido.
  void ctx.resume().catch(() => undefined);

  const start = ctx.currentTime + 0.08;
  const scheduled: OscillatorNode[] = [];
  for (let i = 0; i < safeBeats; i++) {
    const accent = accentEvery > 0 && i % accentEvery === 0;
    scheduled.push(scheduleClick(ctx, start + i * interval, accent, volume));
  }

  let timer = 0;
  let cancelled = false;
  const finished = new Promise<boolean>(resolve => {
    const waitMs = (start - ctx.currentTime + safeBeats * interval) * 1000;
    timer = window.setTimeout(() => resolve(!cancelled), Math.max(0, waitMs));
  });

  return {
    finished,
    cancel() {
      cancelled = true;
      window.clearTimeout(timer);
      // Los osciladores ya programados se detienen al instante.
      for (const node of scheduled) {
        try {
          node.stop();
        } catch {
          // Ya terminó por su cuenta.
        }
      }
    },
  };
}
