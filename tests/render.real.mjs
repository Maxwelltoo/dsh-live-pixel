/**
 * Render the Settings page with the REAL React + jsdom the shell uses.
 *
 * The fast self-check (`tests/smoke.mjs`) stubs React, so it cannot see contract
 * violations that only real React enforces — a fresh object returned from
 * `getSnapshot` on every render, for example, throws "Maximum update depth
 * exceeded" in React 18 and blanks the whole settings page. This test mounts the
 * registered component through `react-dom/client`, exactly like the shell does.
 *
 * React, react-dom and jsdom are not dependencies of this plugin (they belong to
 * the deployment). The test resolves them from — in order — `PIXEL_THEMES_REACT_DIR`,
 * this package's `node_modules`, or a sibling workspace package's `node_modules`;
 * when none carries them it skips instead of failing.
 *
 *   node tests/render.real.mjs
 *   PIXEL_THEMES_REACT_DIR=/path/to/some/node_modules node tests/render.real.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.dirname(here);

/** Directories that might carry a `react` install usable for this check. */
function candidateDirs() {
  const dirs = [];
  if (process.env.PIXEL_THEMES_REACT_DIR) dirs.push(process.env.PIXEL_THEMES_REACT_DIR);
  dirs.push(path.join(packageRoot, 'node_modules'));
  const workspace = path.dirname(packageRoot);
  try {
    for (const entry of readdirSync(workspace, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      dirs.push(path.join(workspace, entry.name, 'node_modules'));
    }
  } catch {
    // a workspace listing is a convenience, not a requirement
  }
  return dirs.filter(dir => existsSync(path.join(dir, 'react', 'package.json')));
}

function loadRuntime(dir) {
  const requireFrom = createRequire(path.join(dir, 'react', 'package.json'));
  const resolve = specifier => {
    try {
      return requireFrom(specifier);
    } catch {
      return null;
    }
  };
  return {
    React: requireFrom('react'),
    createRoot: resolve('react-dom/client')?.createRoot,
    JSDOM: resolve('jsdom')?.JSDOM
  };
}

let runtime = null;
for (const dir of candidateDirs()) {
  const candidate = loadRuntime(dir);
  if (candidate.createRoot && candidate.JSDOM) {
    runtime = { ...candidate, dir };
    break;
  }
}

if (runtime === null) {
  console.log('render.real: skipped (no react + react-dom + jsdom available; set PIXEL_THEMES_REACT_DIR)');
  process.exit(0);
}

const { React, createRoot, JSDOM, dir } = runtime;
console.log(`render.real: using React ${React.version} from ${dir}`);

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.MutationObserver = window.MutationObserver;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.performance = window.performance;
// Not using act(): keep React from warning about every async update.
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

window.matchMedia ??= () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {}
});

const preferences = new Map();
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: key => (preferences.has(key) ? preferences.get(key) : null),
    setItem: (key, value) => preferences.set(key, String(value)),
    removeItem: key => preferences.delete(key)
  }
});

// The engine's documented no-WebGL path: the palette still applies, the canvas stays flat.
window.HTMLCanvasElement.prototype.getContext = () => null;

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  warnings.push(args.map(value => String(value)).join(' '));
};

/* ── Boot the real bundle ─────────────────────────────────────────────────── */

let registered = null;
let applied = true;
const ctx = {
  theme: {
    getTheme: () => ({ active: { colorScheme: 'dark' }, preference: 'dark' }),
    overrideTokens: () => () => {}
  },
  slots: {
    inject: (_owner, callback) => {
      callback();
      return () => {};
    },
    register: (options, Component) => {
      registered = { options, Component };
      return () => {};
    }
  },
  locale: (() => {
    const dictionaries = new Map();
    return {
      register: (namespace, dicts) => {
        dictionaries.set(namespace, dicts);
        return () => {};
      },
      bind: namespace => key => dictionaries.get(namespace)?.zh?.[key] ?? key,
      getLocale: () => ({ active: 'zh', revision: 0 })
    };
  })(),
  on: () => () => {},
  effect: fn => fn()
};

let definition = null;
window.__ModuleLoader__ = { load(value) { definition = value; } };
new Function(readFileSync(path.join(packageRoot, 'client.js'), 'utf8'))();
const plugin = definition.factory(() => React);
let disposePlugin = null;
try {
  disposePlugin = plugin.apply(ctx);
} catch (error) {
  applied = false;
  disposePlugin = null;
  console.error('plugin apply threw:', error);
}
assert.equal(applied, true, 'plugin applies without throwing');
assert.ok(registered, 'a settings section is registered');

/* ── Mount it the way the shell does ─────────────────────────────────────── */

const container = document.getElementById('root');
const root = createRoot(container);
let renderError = null;
try {
  root.render(React.createElement(registered.Component, { close() {} }));
} catch (error) {
  renderError = error;
}
await new Promise(resolve => setTimeout(resolve, 200));

assert.equal(renderError, null, `render threw: ${renderError?.message ?? ''}`);
assert.equal(container.getAttribute('data-render-failed'), null);

const rows = container.querySelectorAll('.dsh-pixel-row');
assert.equal(rows.length, 5, 'theme picker plus four knobs');

const titles = [...container.querySelectorAll('.dsh-pixel-title')].map(node => node.textContent);
assert.deepEqual(titles, ['主题', '风景强度', '卡片纸色', '侧栏纸色', '底部柔光'], 'localized row titles');

const picker = container.querySelector('select');
assert.ok(picker, 'theme picker rendered');
assert.deepEqual(
  [...picker.options].map(option => option.value),
  ['borealis', 'deep', 'neon', 'well'],
  'every shipped theme is selectable, ordered by id'
);
assert.equal(picker.options[0].textContent, '极光');

const ranges = [...container.querySelectorAll('input[type=range]')];
assert.deepEqual(ranges.map(range => range.value), ['100', '93', '90', '60'], 'knob defaults rendered');

assert.equal(
  container.textContent.includes('这个设置页渲染失败'),
  false,
  'error boundary did not fire'
);
assert.equal(
  warnings.some(line => line.includes('Maximum update depth')),
  false,
  'no React update loop'
);

root.unmount();
if (typeof disposePlugin === 'function') disposePlugin();
assert.equal(document.documentElement.getAttribute('data-dsh-pixel-themes'), null, 'marker removed on dispose');

console.warn = originalWarn;
console.log('render.real: ok');
