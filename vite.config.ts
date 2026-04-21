import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Keep port in sync with Joe's CredentialTrax conventions.
// CredentialTrax uses 5173 for frontend, so Gapplet uses 5174 to avoid conflicts
// if both dev servers are running simultaneously.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
  },
});
