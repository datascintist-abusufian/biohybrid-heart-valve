import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/biohybrid-heart-valve/', // Replace with your repository name
  plugins: [react()],
});
