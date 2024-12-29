import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/biohybrid-heart-valve/', // Your repository name
  plugins: [react()],
});
