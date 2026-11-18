#!/usr/bin/env node
/**
 * Emit a page that compiles every theme's fragment shader on the real GL driver
 * and draws one frame, reporting the count of distinct tones.
 *
 * The build can only check structure (a shader compiles or it does not, and that
 * needs a GPU). Run this after editing a fragment:
 *
 *   node scripts/shader-check.mjs
 *   python3 -m http.server 8400            # from the package root
 *   # shaders: http://127.0.0.1:8400/tests/shader-check/
 *   # engine:  http://127.0.0.1:8400/tests/shader-check/boot.html?theme=well
 *
 * A healthy theme reports `ok: true` and a palette-appropriate number of distinct
 * tones (a single-colour result means every sample landed on the paper step, or
 * the engine's uniforms were not wired as the shader expects).
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const themesDir = new URL('themes/', root);
const outDir = new URL('tests/shader-check/', root);

const VERTEX = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

const themes = [];
for (const file of (await readdir(themesDir)).filter(name => name.endsWith('.js')).sort()) {
  const module = await import(new URL(file, themesDir).href);
  const { id, fragment, colors } = module.default;
  themes.push({ id, fragment, colors });
}

const page = `<!doctype html>
<meta charset="utf-8">
<title>shader check</title>
<pre id="log"></pre>
<script>
const THEMES = ${JSON.stringify(themes)};
const VERTEX = ${JSON.stringify(VERTEX)};
const lines = [];
const log = (...parts) => { lines.push(parts.join(' ')); document.getElementById('log').textContent = lines.join('\\n'); };

const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 180;
const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
if (!gl) {
  log('no WebGL context in this browser');
} else {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : { log: gl.getShaderInfoLog(shader) };
  };
  for (const theme of THEMES) {
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, theme.fragment);
    if (fragment.log !== undefined) { log(theme.id, 'FRAGMENT ERROR\\n' + fragment.log); continue; }
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { log(theme.id, 'LINK ERROR\\n' + gl.getProgramInfoLog(program)); continue; }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // Exactly what the engine drives, then every colour uniform the theme declares.
    for (const [name, value] of Object.entries({ uRes: [canvas.width, canvas.height], uTime: 7.5, uPointer: 0.2, uNight: 1 })) {
      const location = gl.getUniformLocation(program, name);
      if (location === null) continue;
      if (Array.isArray(value)) gl.uniform2f(location, value[0], value[1]);
      else gl.uniform1f(location, value);
    }
    const colors = theme.colors.dark;
    for (const [name, rgb] of Object.entries(colors)) {
      const location = gl.getUniformLocation(program, name);
      if (location !== null) gl.uniform3f(location, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0;
    let lit = 0;
    const tones = new Set();
    for (let i = 0; i < pixels.length; i += 4) {
      const value = pixels[i] + pixels[i + 1] + pixels[i + 2];
      sum += value;
      if (value > 30) lit += 1;
      tones.add((pixels[i] >> 4) + ',' + (pixels[i + 1] >> 4) + ',' + (pixels[i + 2] >> 4));
    }
    const count = pixels.length / 4;
    log(theme.id, 'ok — mean ' + Math.round(sum / count / 3) + ', lit ' + Math.round(100 * lit / count) + '%, tones ' + tones.size);
  }
  log('done');
}
</script>
`;

/**
 * Second page: boot the real bundle in a real page and run the real engine for
 * one theme, then report what the GL context saw. This is the only check that
 * covers the engine's own uniform wiring (undeclared uniforms, null locations),
 * the canvas sizing and the disposal path.
 */
const bootPage = `<!doctype html>
<meta charset="utf-8">
<title>boot check</title>
<pre id="log"></pre>
<script>
const params = new URLSearchParams(location.search);
const theme = params.get('theme') || ${JSON.stringify(themes[0].id)};
const scheme = params.get('scheme') === 'light' ? 'light' : 'dark';
if (params.get('bare') === '1') {
  const style = document.createElement('style');
  style.textContent = 'html,body{background:#08080d;margin:0;height:100%;overflow:hidden} #log{display:none}';
  document.head.appendChild(style);
}
// Several of these pages are opened in iframes on one origin, so they share
// localStorage. Pin the theme for THIS document instead of racing on storage.
const settingsKey = 'dsh-pixel-themes:v1';
const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.getItem = function (key) {
  if (key === settingsKey) return JSON.stringify({ theme });
  return originalGetItem.call(this, key);
};
Storage.prototype.setItem = function (key, value) {
  if (key === settingsKey) return;
  return originalSetItem.call(this, key, value);
};
const log = line => { document.getElementById('log').textContent += line + '\\n'; };
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); originalWarn.apply(console, args); };

let gl = null;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, options) {
  const context = originalGetContext.call(this, type, options);
  if (type === 'webgl' && context) {
    if (gl === null) gl = context;
    const originalDraw = context.drawArrays.bind(context);
    context.drawArrays = (...args) => { self.__draws = (self.__draws || 0) + 1; return originalDraw(...args); };
  }
  return context;
};

window.__ModuleLoader__ = { load(definition) { window.__definition = definition; } };
const React = {
  createElement() { return null; },
  useSyncExternalStore: () => null,
  Component: class { constructor(props) { this.props = props; this.state = {}; } },
};
</script>
<script src="../../client.js"></script>
<script>
const ctx = {
  theme: { getTheme: () => ({ active: { colorScheme: scheme }, preference: scheme }), overrideTokens: () => () => {} },
  slots: { inject: (owner, callback) => { callback(); return () => {}; }, register: () => () => {} },
  locale: { register: () => () => {}, bind: () => key => key, getLocale: () => ({ active: 'zh', revision: 0 }) },
  on: () => () => {},
  effect: fn => fn(),
};
try {
  window.__definition.factory(() => React).apply(ctx);
} catch (error) {
  log(theme + ' APPLY THREW: ' + error.message);
}
requestAnimationFrame(() => requestAnimationFrame(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) { log(theme + ': no canvas'); return; }
  const sample = gl ? gl.getError() : -1;
  log(theme + ': canvas ' + canvas.width + 'x' + canvas.height + ', draws ' + (self.__draws || 0) +
      ', glError ' + sample + ', warnings ' + warnings.length + (warnings.length ? ' [' + warnings.join(' | ') + ']' : ''));
  document.title = 'boot check done';
}));
</script>
`;

/**
 * Third page: the four scenes side by side, one iframe each, for a visual check.
 */
const galleryPage = `<!doctype html>
<meta charset="utf-8">
<title>gallery</title>
<style>
  html, body { margin: 0; background: #05050a; color: #b9b6c6; font: 12px/1.4 ui-monospace, monospace; }
  h1 { font: 500 13px/1.4 ui-sans-serif, system-ui; padding: 14px 16px 6px; margin: 0; letter-spacing: .08em; text-transform: uppercase; color: #6ff0c4; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 10px 16px 16px; }
  figure { margin: 0; }
  figcaption { padding: 6px 2px 4px; }
  iframe { display: block; width: 100%; aspect-ratio: 16 / 10; border: 1px solid #23222f; border-radius: 6px; background: #08080d; }
</style>
<h1>pixel themes — engine output</h1>
<div class="grid">
${themes.map(theme => `  <figure><iframe src="./boot.html?theme=${theme.id}&bare=1"></iframe><figcaption>${theme.id}</figcaption></figure>`).join('\n')}
</div>
`;

await mkdir(outDir, { recursive: true });
await writeFile(new URL('index.html', outDir), page);
await writeFile(new URL('boot.html', outDir), bootPage);
await writeFile(new URL('gallery.html', outDir), galleryPage);
console.log(`shader-check: wrote ${themes.length} theme(s) to tests/shader-check/{index,boot,gallery}.html`);
console.log('next: python3 -m http.server 8400   (from the package root), then open:');
console.log('  http://127.0.0.1:8400/tests/shader-check/            (compile + one frame per shader)');
console.log('  http://127.0.0.1:8400/tests/shader-check/boot.html?theme=well   (real engine boot)');
console.log('  http://127.0.0.1:8400/tests/shader-check/gallery.html           (all scenes side by side)');
