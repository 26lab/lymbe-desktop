#!/usr/bin/env node
/**
 * Generate every icon Tauri needs from a single SVG source.
 *
 * 1. Render `src-tauri/icons/source.svg` → `src-tauri/icons/icon.png`
 *    (1024×1024 PNG) using @resvg/resvg-js — pure JS, no native build deps.
 * 2. Call the Tauri CLI's built-in `icon` generator which produces all
 *    platform variants (32×32.png, 128×128.png, 128×128@2x.png, .ico, .icns,
 *    and Android/iOS variants if those targets exist).
 *
 * Run with: `npm run icons` (defined in package.json).
 */

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const SRC_SVG = resolve(ROOT, 'src-tauri/icons/source.svg');
const OUT_PNG = resolve(ROOT, 'src-tauri/icons/icon.png');

console.log(`→ Rendering ${SRC_SVG}`);
const svg = readFileSync(SRC_SVG, 'utf8');
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1024 },
  background: 'rgba(0,0,0,0)',
});
const png = resvg.render().asPng();
writeFileSync(OUT_PNG, png);
console.log(`✓ Wrote ${OUT_PNG} (${png.length.toLocaleString()} bytes)`);

console.log('→ Generating platform-specific icons via tauri CLI');
const tauriCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(tauriCmd, ['tauri', 'icon', OUT_PNG], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (result.status !== 0) {
  console.error('✗ tauri icon failed');
  process.exit(result.status ?? 1);
}
console.log('✓ All icons generated under src-tauri/icons/');
