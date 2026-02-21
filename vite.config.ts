import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    proxy: {
      '/api/pvgis': {
        target: 'https://re.jrc.ec.europa.eu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pvgis/, '/api/v5_3'),
      },
      '/api/ree': {
        target: 'https://apidatos.ree.es',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ree/, ''),
      },
    },
  },
});
