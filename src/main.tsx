import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TabPlayerProvider } from './player/TabPlayerProvider';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró #root');

// Sin StrictMode a propósito: su doble montaje en desarrollo crea y destruye
// cada instancia de alphaTab dos veces, lo que reinicia workers y el
// AudioContext y produce fallos de audio que no existen en producción.
createRoot(container).render(
  <TabPlayerProvider>
    <App />
  </TabPlayerProvider>,
);
