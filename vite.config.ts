import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // html2pdf ships html2canvas/jsPDF as one optional, lazy-loaded bundle.
    // The initial application and vendor chunks remain below 500 kB.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules\/(react|react-dom|react-router|react-router-dom|@tanstack)\//
            },
            {
              name: 'supabase-vendor',
              test: /node_modules\/@supabase\//
            },
            {
              name: 'icons-vendor',
              test: /node_modules\/lucide-react\//
            }
          ]
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
