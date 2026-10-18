import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* The framework's Flask server already sends Access-Control-Allow-Origin: *,
   so the browser can call it directly and VITE_API_URL is the normal path.
   The proxy below is the same-origin alternative: set VITE_API_URL="" and
   requests go to /api/results on the dev server, which forwards them. */
const target = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8765';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
    },
  },
});
