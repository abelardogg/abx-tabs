import type { model } from '@coderline/alphatab';

export interface SectionMarker {
  /** Índice del compás donde arranca la sección. */
  barIndex: number;
  /** Tick absoluto de inicio, para posicionar el player. */
  tick: number;
  label: string;
}

/**
 * Extrae los marcadores de sección del score (Intro, Verse, Solo...).
 *
 * Guitar Pro guarda estas marcas en los master bars; si el archivo no trae
 * ninguna el resultado es una lista vacía y la navegación por secciones
 * cae de vuelta a saltos por compás.
 */
export function readSections(score: model.Score): SectionMarker[] {
  const markers: SectionMarker[] = [];
  for (const bar of score.masterBars) {
    const section = bar.section;
    if (!section) continue;
    const label = section.text || section.marker;
    if (!label) continue;
    markers.push({ barIndex: bar.index, tick: bar.start, label });
  }
  return markers;
}

/**
 * Busca la sección a la que hay que saltar desde `tick`.
 *
 * `direction` -1 salta al inicio de la sección anterior, +1 a la siguiente.
 * Al ir hacia atrás se usa un margen: si ya estamos a unos ticks del inicio
 * de la sección actual, se salta a la anterior en lugar de volver al mismo
 * punto, que es el comportamiento que se espera al pulsar repetidamente.
 */
export function findSectionJump(
  sections: SectionMarker[],
  tick: number,
  direction: -1 | 1,
  backwardGraceTicks = 240,
): SectionMarker | null {
  if (sections.length === 0) return null;

  if (direction === 1) {
    return sections.find(s => s.tick > tick + 1) ?? null;
  }

  const threshold = tick - backwardGraceTicks;
  let candidate: SectionMarker | null = null;
  for (const s of sections) {
    if (s.tick < threshold) candidate = s;
    else break;
  }
  return candidate;
}
