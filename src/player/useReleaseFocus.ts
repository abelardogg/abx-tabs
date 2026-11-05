import { useEffect } from 'react';

/**
 * Devuelve el foco al documento cuando un control se acciona con el ratón.
 *
 * El problema que resuelve: al marcar con el clic, por ejemplo, la casilla del
 * metrónomo, el foco se queda en ella. A partir de ahí `Espacio` la vuelve a
 * conmutar en lugar de pausar la reproducción, que es lo que espera cualquiera
 * que esté tocando.
 *
 * Solo se suelta el foco cuando la activación vino del ratón: los clics
 * sintetizados por el teclado (`Enter` o `Espacio` sobre un control enfocado)
 * llegan con `detail === 0`, y ahí el foco tiene que quedarse donde está para
 * no romper la navegación con `Tab`.
 *
 * Los campos de texto y numéricos quedan fuera: mientras se escribe en ellos
 * el foco es justo donde debe estar.
 */

const RELEASE_ON_CLICK = new Set(['BUTTON']);
const RELEASE_INPUT_TYPES = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset']);

function shouldRelease(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.tagName === 'INPUT') {
    return RELEASE_INPUT_TYPES.has((element as HTMLInputElement).type);
  }
  return RELEASE_ON_CLICK.has(element.tagName);
}

export function useReleaseFocus(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.detail === 0) return;
      const focused = document.activeElement;
      if (shouldRelease(focused)) focused.blur();
    };

    /**
     * Los desplegables se tratan aparte: soltarles el foco en el `click`
     * cerraría la lista nada más abrirla, así que se espera a que haya una
     * elección hecha.
     */
    const onChange = (event: Event) => {
      if (event.target instanceof HTMLSelectElement) event.target.blur();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('change', onChange);
    };
  }, []);
}
