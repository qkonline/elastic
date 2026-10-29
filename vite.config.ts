/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Emit dist/sw.js with this build's files to precache and a cache name derived from their
 * contents, so any change to the app, an icon or the manifest ships a new service worker.
 * The same version goes into index.html (`<meta name="build">`) and dist/version.json, which
 * the app checks to notice that a newer build is out (src/lib/update.ts).
 */
function serviceWorker(api: string): Plugin {
  return {
    name: 'elastic-day-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const hash = createHash('sha256');
      const files: string[] = [];
      for (const [name, out] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(name).update(out.type === 'chunk' ? out.code : out.source);
        // The page is fetched network-first; legacy .woff fonts are skipped by every current browser.
        if (name !== 'index.html' && !name.endsWith('.map') && !name.endsWith('.woff')) files.push(name);
      }
      // Top-level files only: folders like public/screenshots are for the install dialog, not offline use.
      // Nor _headers and the dot files, which are host settings and never served.
      const pub = readdirSync(here('./public')).filter(
        (f) => !f.startsWith('.') && !f.startsWith('_') && statSync(here(`./public/${f}`)).isFile(),
      );
      for (const name of pub.sort()) {
        hash.update(name).update(readFileSync(here(`./public/${name}`)));
        files.push(name);
      }
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync(here('./src/sw.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(files.sort()))
        .replace('__API__', JSON.stringify(api.replace(/\/$/, '')));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: version }) });
      const html = bundle['index.html'];
      if (html?.type === 'asset')
        html.source = String(html.source).replace('</head>', `  <meta name="build" content="${version}" />\n  </head>`);
    },
  };
}

// Served at the root of elastic.kaiserkhan.com. The `farewell` build is the last one left at
// kaiserkhan.com/planner/, where the app lived until October 2026: it hands each copy over to
// the new address (src/lib/move.ts).
export default defineConfig(({ mode }) => ({
  base: mode === 'farewell' ? '/planner/' : '/',
  plugins: [svelte(), serviceWorker(loadEnv(mode, here('.'), 'VITE_').VITE_PUSH_URL ?? '')],
  test: {
    include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts', 'shared/**/*.test.ts'],
    // The worker's tests run in Node, where Cloudflare's own module is stood in for.
    alias: { 'cloudflare:workers': here('./worker/test/cloudflare-workers.ts') },
  },
}));
