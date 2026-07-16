import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});