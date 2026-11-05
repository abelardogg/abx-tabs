import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';
import { tabsLibrary } from './vite/tabsLibraryPlugin';

export default defineConfig({
  // El plugin de alphaTab configura los web workers y audio worklets que usa
  // el sintetizador. La copia de assets se desactiva porque corre demasiado
  // tarde en el primer arranque; la hace `scripts/copy-alphatab-assets.mjs`
  // desde `predev`/`prebuild`.
  // `tabsLibrary` solo existe en desarrollo: expone la carpeta TABS/ para
  // poder elegir una tablatura desde un desplegable.
  plugins: [react(), alphaTab({ assetOutputDir: false }), tabsLibrary()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // El código vive en un bind mount de Windows hacia el contenedor Linux,
    // donde los eventos inotify no se propagan: sin polling no hay HMR.
    watch: { usePolling: true, interval: 300 },
  },
  preview: { host: '0.0.0.0', port: 4173 },
});
