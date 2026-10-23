import { defineConfig } from 'vite';

/** Served from the site root locally; the GitHub Pages build (.github/workflows/deploy.yml) sets VITE_BASE_URL to the repo's path. */
export default defineConfig({
  base: process.env['VITE_BASE_URL'] ?? '/',
  build: { target: 'es2020' },
});
