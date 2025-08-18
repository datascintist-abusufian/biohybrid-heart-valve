import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Must match your repo name for GitHub Pages
  base: '/biohybrid-heart-valve/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true, // helpful for debugging production issues
  },
});
