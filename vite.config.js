import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      input: mode === 'cloudflare' ? { main: fileURLToPath(new URL('./index.html', import.meta.url)) } : {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        eeg: fileURLToPath(new URL('./eeg.html', import.meta.url)),
      },
    },
  },
}));
