import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Inject backend URL at build time, with fallback for dev
    // Use a string literal instead of process.env to avoid Node.js code in browser bundle
    __AI_BACKEND_URL__: JSON.stringify(
      typeof process !== 'undefined' && process.env?.VITE_AI_BACKEND_URL
        ? process.env.VITE_AI_BACKEND_URL
        : 'http://localhost:3001'
    ),
    // Shim Node.js globals that React / dependencies reference at runtime
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': '{}',
  },
  build: {
    // Output a single self-contained bundle for embedding
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'TashusAIWidget',
      fileName: 'widget',
      formats: ['iife'], // IIFE = immediately-invoked, works via <script> tag
    },
    // Inline everything (CSS, assets) into the single widget.js file
    cssCodeSplit: false,
    rollupOptions: {
      // No external deps — bundle React et al. into widget.js
      external: [],
      output: {
        // Inline CSS into JS so only one <script> tag is needed
        inlineDynamicImports: true,
      },
    },
    // Keep bundle lean
    minify: 'esbuild',
    sourcemap: false,
  },
});
