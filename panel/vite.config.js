import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/panel/',
  build: {
    outDir: path.resolve(__dirname, '../public/panel-app'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/admin': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    }
  }
});
