import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the API runs separately (`pnpm dev:server`); same-origin /api via proxy.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
