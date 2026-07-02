import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works at any path (GitHub Pages serves under /goldberg-planet/)
  base: './',
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
  },
});
