import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** The game's version, from package.json: the title screen shows it. */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Served from the site root locally; the GitHub Pages build (.github/workflows/deploy.yml) sets VITE_BASE_URL to the repo's path. */
export default defineConfig({
  base: process.env['VITE_BASE_URL'] ?? '/',
  build: { target: 'es2020' },
  define: { __GAME_VERSION__: JSON.stringify(version) },
});
