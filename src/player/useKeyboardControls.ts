import { useEffect, useRef } from 'react';
import { useTabPlayer } from './TabPlayerProvider';

/** Margen para considerar dos pulsaciones de la misma flecha como doble. */
const DOUBLE_TAP_MS = 320;
/** Cuánto desplaza una flecha vertical el panel activo. */
const SCROLL_STEP_PX = 120;

/**
 * Controles que consumen el teclado por su cuenta. Los botones quedan fuera a
 * propósito: tras hacer clic en uno conserva el foco, y si se tratara como
 * campo de texto las flechas dejarían de funcionar hasta pinchar en otro
 * sitio. El caso de `Espacio` sobre un botón se trata aparte, porque ahí sí
 * hay que dejar la activación nativa.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function isButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.tagName === 'BUTTON';
}

/**
 * Atajos de teclado del reproductor:
 *
 * - `Espacio`: play / pause
 * - `←` `→`: nota anterior / siguiente
 * - `Ctrl` + `←` `→`: compás anterior / siguiente
 * - `Ctrl` + `←` `←` o `Ctrl` + `→` `→` (doble pulsación rápida): sección
 *   anterior / siguiente
 * - `↑` `↓`: desplaza verticalmente el panel activo
 * - `Esc`: quita el loop
 *
 * El salto de sección cuelga de `Ctrl` y no de la flecha sola porque recorrer
 * notas deprisa encadena pulsaciones rápidas, y se dispararía sin querer.
 */
export function useKeyboardControls(): void {
  const { playPause, seekBars, seekBeats, jumpSection, clearLoop, activePane, file } =
    useTabPlayer();
  const lastBarStep = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!file) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.metaKey) return;
      // No robar el teclado mientras el foco está en un control de la UI.
      if (isTypingTarget(event.target)) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar': {
          if (event.ctrlKey) return;
          // Con un botón enfocado, `Espacio` ya lo activa: intervenir aquí
          // dispararía la acción dos veces.
          if (isButton(event.target)) return;
          event.preventDefault();
          playPause();
          return;
        }

        case 'ArrowLeft':
        case 'ArrowRight': {
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;

          if (!event.ctrlKey) {
            lastBarStep.current = null;
            seekBeats(direction);
            return;
          }

          const now = performance.now();
          const previous = lastBarStep.current;
          if (previous && previous.key === event.key && now - previous.at < DOUBLE_TAP_MS) {
            // Segunda pulsación: el salto de compás ya ocurrió, ahora se
            // escala al salto de sección.
            lastBarStep.current = null;
            jumpSection(direction);
            return;
          }

          lastBarStep.current = { key: event.key, at: now };
          seekBars(direction);
          return;
        }

        case 'Escape': {
          event.preventDefault();
          clearLoop();
          return;
        }

        case 'ArrowUp':
        case 'ArrowDown': {
          if (event.ctrlKey) return;
          const viewport = document.querySelector<HTMLElement>(
            `.pane__viewport[data-pane="${activePane}"]`,
          );
          if (!viewport) return;
          event.preventDefault();
          viewport.scrollBy({
            top: event.key === 'ArrowDown' ? SCROLL_STEP_PX : -SCROLL_STEP_PX,
            behavior: 'smooth',
          });
          return;
        }

        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playPause, seekBars, seekBeats, jumpSection, clearLoop, activePane, file]);
}
