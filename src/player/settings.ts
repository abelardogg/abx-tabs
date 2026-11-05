import { LayoutMode, PlayerMode, ScrollMode, StaveProfile } from '@coderline/alphatab';

/**
 * El plugin de Vite de alphaTab copia estos assets dentro de `public/`,
 * así que quedan servidos en la raíz tanto en dev como en el build.
 */
const FONT_DIRECTORY = '/font/';
const SOUND_FONT = '/soundfont/sonivox.sf2';

export type PaneRole = 'master' | 'follower';

/**
 * Cada panel es una instancia independiente de alphaTab que renderiza un solo
 * instrumento. Solo el panel maestro suena; los demás llevan el volumen a cero
 * y únicamente siguen el cursor.
 */
export function buildPaneSettings(role: PaneRole, scrollElement: HTMLElement) {
  return {
    core: {
      fontDirectory: FONT_DIRECTORY,
    },
    display: {
      layoutMode: LayoutMode.Page,
      staveProfile: StaveProfile.Default,
    },
    player: {
      playerMode: PlayerMode.EnabledSynthesizer,
      soundFont: SOUND_FONT,
      scrollElement,
      enableCursor: true,
      enableAnimatedBeatCursor: true,
      enableElementHighlighting: true,
      // Click para posicionarse y arrastre para marcar el segmento de loop:
      // solo tienen sentido en el panel que manda el transporte.
      enableSeekToClick: role === 'master',
      enablePlaybackRangeSelection: role === 'master',
      resetPlaybackRangeOnClick: false,
      scrollMode: ScrollMode.Continuous,
      scrollOffsetY: -30,
    },
  };
}
