/**
 * Browser-free self-check for the pixel-themes Client half.
 *
 * Stubs the document, localStorage, React and a WebGL context, then exercises the
 * real bundle end to end:
 *   1. normal boot — token layer, field stylesheet, canvas, settings section;
 *   2. the Settings page — picker + knobs, live token republish, persistence;
 *   3. a theme switch — the stage is rebuilt from the new theme's shader/colours;
 *   4. teardown — every node, variable and listener removed;
 *   5. boot with no <body> yet (`dsh.client.immediately`) deferring until ready.
 *
 * A second, synthetic theme is patched into the registry so switching is covered
 * without shipping a half-finished theme in `themes/`.
 *
 * Run with `node tests/smoke.mjs`.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import borealis from '../themes/borealis.js';

const BUNDLE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const { name: packageName } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const twin = {
  ...borealis,
  id: 'twin',
  label: { zh: '双生', en: 'Twin' },
  description: { zh: '测试用主题。', en: 'Test-only theme.' },
  colors: {
    light: { ...borealis.colors.light, uInk: [200, 30, 90] },
    dark: { ...borealis.colors.dark, uInk: [200, 30, 90] }
  },
  palette: {
    light: { ...borealis.palette.light, accent: [200, 30, 90] },
    dark: { ...borealis.palette.dark, accent: [200, 30, 90] }
  }
};

/** Patch the embedded registry so the bundle carries both themes. */
function withThemes(source, themes) {
  const patched = source.replace(
    /const THEMES = \[[\s\S]*?\n  \];/,
    `const THEMES = ${JSON.stringify(themes, null, 2)};`
  );
  assert.notEqual(patched, source, 'registry patch applied');
  return patched;
}

const makeEl = tag => ({
  tagName: tag,
  isConnected: false,
  children: [],
  style: {
    _props: {},
    setProperty(name, value) { this._props[name] = String(value); },
    getPropertyValue(name) { return this._props[name] ?? ''; },
    removeProperty(name) { delete this._props[name]; },
  },
  dataset: {},
  attributes: {},
  textContent: '',
  _listeners: {},
  setAttribute(k, v) { this.attributes[k] = v; },
  removeAttribute(k) { delete this.attributes[k]; },
  hasAttribute(k) { return k in this.attributes; },
  addEventListener(t, fn) { (this._listeners[t] ||= []).push(fn); },
  removeEventListener(t, fn) { this._listeners[t] = (this._listeners[t] || []).filter(f => f !== fn); },
  append(...nodes) { for (const n of nodes) { this.children.push(n); n.isConnected = true; } },
  prepend(...nodes) { for (const n of nodes) { this.children.unshift(n); n.isConnected = true; } },
  remove() { this.isConnected = false; },
  querySelector() { return null; },
  classList: { contains: () => false, add() {}, remove() {} },
});

const makeStorage = () => {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); },
    dump: () => Object.fromEntries(data),
  };
};

const makeGl = (calls, fault) => new Proxy({}, {
  get(_target, prop) {
    if (prop === 'getShaderParameter') return () => fault() !== 'compile';
    if (prop === 'getProgramParameter') return () => fault() !== 'link';
    if (prop === 'drawArrays' && fault() === 'draw') return () => { throw new Error('draw failed'); };
    if (prop === 'getExtension') return () => null;
    if (prop === 'getUniformLocation') return (_program, name) => name;
    if (prop === 'createShader' || prop === 'createProgram' || prop === 'createBuffer') return () => ({});
    if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => '';
    return (...args) => { calls.push([prop, ...args]); };
  }
});

const React = {
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false);
    const element = { type, props: { ...(props ?? {}), children: flat.length <= 1 ? flat[0] : flat } };
    // Components are expanded eagerly: the stub renders, it does not reconcile.
    if (typeof type !== 'function') return element;
    if (type.prototype && type.prototype.isReactComponent) return new type(element.props).render();
    return type(element.props);
  },
  // React 18 requires getSnapshot to be referentially stable while nothing
  // changed; a fresh object per call is an infinite update loop in the real
  // application, so the stub enforces the contract instead of papering over it.
  useSyncExternalStore: (_subscribe, getSnapshot) => {
    const first = getSnapshot();
    const second = getSnapshot();
    assert.equal(first, second, 'getSnapshot must return a cached reference (React 18 contract)');
    return first;
  },
  Component: (() => {
    // Mimics React's class-component marker so the stub can instantiate one.
    class Component {
      constructor(props) { this.props = props; this.state = {}; }
      setState(next) { this.state = { ...this.state, ...next }; }
    }
    Component.prototype.isReactComponent = {};
    return Component;
  })(),
};

function boot({ withBody, dictionaries, fault, rejectTokens = false, bundle = withThemes(BUNDLE, [borealis, twin]) }) {
  const calls = [];
  const frames = new Map();
  let frameId = 0;
  let themeChanged;
  const head = makeEl('head');
  const root = makeEl('html');
  let body = withBody ? makeEl('body') : null;
  const docListeners = {};
  const storage = makeStorage();

  globalThis.document = {
    head,
    documentElement: root,
    hidden: false,
    get body() { return body; },
    createElement: tag => {
      const el = makeEl(tag);
      if (tag === 'canvas') el.getContext = () => {
        if (fault === 'no-context') return null;
        if (fault === 'context-throws') throw new Error('context creation failed');
        return makeGl(calls, () => fault);
      };
      return el;
    },
    addEventListener(t, fn) { (docListeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { docListeners[t] = (docListeners[t] || []).filter(f => f !== fn); },
    querySelector() { return null; },
  };

  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = callback => {
    frames.set(++frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.window = {
    innerWidth: 1600,
    innerHeight: 900,
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    localStorage: storage,
    __ModuleLoader__: { load(def) { globalThis.__mod = def; } },
  };

  new Function(bundle)();
  const mod = globalThis.__mod;
  assert.equal(mod.id, packageName, 'bundle id');

  const publishes = [];
  const registrations = [];
  const localeDictionaries = [];
  let scheme = 'dark';

  const ctx = {
    theme: {
      getTheme: () => ({ active: { colorScheme: scheme }, preference: scheme }),
      overrideTokens: (source, tokens) => {
        if (rejectTokens) throw new Error('token publication failed');
        publishes.push({ source, tokens });
        return () => {};
      },
    },
    slots: {
      inject: (_owner, callback) => { callback(); return () => {}; },
      register: (options, Component) => { registrations.push({ options, Component }); return () => {}; },
    },
    locale: {
      register: (ns, dicts) => { localeDictionaries.push({ ns, dicts }); return () => {}; },
      bind: () => key => dictionaries[key] ?? key,
      getLocale: () => ({ active: 'zh', revision: 0 }),
    },
    on: (_event, listener) => {
      themeChanged = listener;
      return () => { themeChanged = undefined; };
    },
    effect: fn => fn(),
  };

  const plugin = mod.factory(() => React);
  assert.deepEqual(plugin.inject, ['theme', 'slots', 'locale'], 'injected services');
  const dispose = plugin.apply(ctx);

  return {
    calls,
    publishes,
    registrations,
    localeDictionaries,
    root,
    head,
    storage,
    dispose,
    frames,
    get body() { return body; },
    get stage() { return body.children.find(node => node.isConnected); },
    setScheme(next) { scheme = next; themeChanged?.(); },
    emitDocument(event) {
      for (const fn of [...(docListeners[event] || [])]) fn();
    },
    ready() {
      body = makeEl('body');
      this.emitDocument('DOMContentLoaded');
    },
  };
}

const ZH = {
  nav: '动态像素主题',
  'row.theme.title': '主题',
  'knob.scene.title': '风景强度',
  'knob.surface.title': '卡片纸色',
  'knob.sides.title': '侧栏纸色',
  'knob.scrim.title': '底部柔光',
  'footer.note': '偏好保存在当前客户端。',
  'footer.reset': '恢复默认',
};

/* ── 1. Normal boot ─────────────────────────────────────────────────────── */

const app = boot({ withBody: true, dictionaries: ZH });

assert.equal(app.root.attributes['data-dsh-pixel-themes'], 'active', 'root marker');
assert.equal(app.head.children.length, 1, 'one style node');
assert.equal(app.body.children.length, 1, 'one canvas');
assert.equal(app.body.children[0].dataset.dshPixelScene, 'borealis', 'canvas draws the first theme');
assert.equal(app.publishes.length, 1, 'one token publish at boot');
assert.equal(app.publishes[0].source, packageName, 'token source matches the package name');

const tokens = app.publishes[0].tokens;
assert.equal(tokens['--dsw-alias-bg-base'].dark, 'rgb(8, 8, 13)', 'opaque ground for cards');
assert.equal(tokens['--dsh-pixel-paper'].dark, '8, 8, 13', 'paper triplet token');
assert.equal(tokens['--dsw-alias-brand-primary'].dark, 'rgb(111, 240, 196)', 'theme accent');
assert.equal(tokens['--dsw-specific-sidebar-fill'].dark, 'rgba(8, 8, 13, 0.9)', 'side paper default');
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-veil'), '0', 'no veil at full scene strength');
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-scrim'), '0.6', 'default scrim');
assert.ok(app.calls.some(call => call[0] === 'drawArrays'), 'drew a frame');

assert.equal(app.registrations.length, 1, 'one settings section');
const section = app.registrations[0];
assert.equal(section.options.name, 'settings.section');
assert.equal(section.options.id, 'pixel-themes');
assert.equal(section.options.label(), '动态像素主题', 'nav label');
assert.equal(section.options.locale, 'pixel-themes');

assert.equal(app.localeDictionaries[0].dicts.zh.nav, '动态像素主题', 'dictionaries registered');

/* ── 2. The Settings page ───────────────────────────────────────────────── */

const rendered = section.Component();
assert.equal(rendered.props.className, 'dsh-pixel-section');
const rows = rendered.props.children.filter(child => child?.props?.className === 'dsh-pixel-row');
assert.equal(rows.length, 5, 'theme picker plus four knobs');

const picker = rows[0].props.children[1].props.children;
assert.equal(picker.type, 'select');
assert.deepEqual(picker.props.children.map(option => option.props.value), ['borealis', 'twin'], 'every theme is selectable');
assert.deepEqual(picker.props.children.map(option => option.props.children), ['极光', '双生'], 'labels follow the locale');

const sceneControl = rows[1].props.children[1].props.children;
assert.equal(rows[1].props.children[0].props.children[0].props.children, '风景强度');
assert.equal(sceneControl[0].props.value, 100);
assert.equal(sceneControl[1].props.children, '100%');

sceneControl[0].props.onChange({ target: { value: '65' } });
assert.equal(app.publishes.length, 2, 'token layer republished on a knob change');
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-veil'), '0.315', 'veil rises as scene strength drops');
assert.equal(JSON.parse(app.storage.getItem('dsh-pixel-themes:v1')).theme, 'borealis', 'theme persisted');
assert.equal(
  JSON.parse(app.storage.getItem('dsh-pixel-themes:v1')).values.borealis.scene,
  65,
  'knob value persisted per theme'
);

const sidesRange = rows[3].props.children[1].props.children[0];
sidesRange.props.onChange({ target: { value: '70' } });
assert.equal(app.publishes.at(-1).tokens['--dsw-specific-sidebar-fill'].dark, 'rgba(8, 8, 13, 0.7)');

/* ── 3. Switching theme rebuilds the stage ───────────────────────────────── */

const before = app.body.children[0];
picker.props.onChange({ target: { value: 'twin' } });

assert.equal(before.isConnected, false, 'old canvas removed');
assert.equal(app.body.children[0].dataset.dshPixelScene, 'twin', 'new canvas draws the new theme');
assert.equal(app.publishes.at(-1).tokens['--dsw-alias-brand-primary'].dark, 'rgb(200, 30, 90)', 'tokens follow the theme');
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-veil'), '0', 'the twin starts from its own defaults');
assert.equal(app.publishes.length, 4, 'one publish at boot, two knob changes, one theme switch');

// The tuning of the previous theme survives the switch.
picker.props.onChange({ target: { value: 'borealis' } });
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-veil'), '0.315', 'previous theme keeps its values');
assert.equal(app.publishes.at(-1).tokens['--dsw-specific-sidebar-fill'].dark, 'rgba(8, 8, 13, 0.7)');

const reset = rendered.props.children.find(child => child?.props?.className === 'dsh-pixel-footer').props.children[1];
reset.props.onClick();
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-scrim'), '0.6', 'reset restores the theme default');

/* ── 4. Teardown ────────────────────────────────────────────────────────── */

app.dispose();
assert.equal(app.root.attributes['data-dsh-pixel-themes'], undefined, 'marker removed');
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-veil'), '', 'veil variable removed');
assert.equal(app.root.style.getPropertyValue('--dsh-pixel-scrim'), '', 'scrim variable removed');
assert.equal(app.head.children[0].isConnected, false, 'style removed');
assert.equal(app.body.children[0].isConnected, false, 'canvas removed');

/* ── 5. Bundle evaluated before <body> exists ───────────────────────────── */

const early = boot({ withBody: false, dictionaries: ZH });
assert.equal(early.head.children.length, 0, 'nothing body-bound yet');
assert.equal(early.publishes.length, 0, 'no token publish yet');
early.ready();
assert.equal(early.head.children.length, 1, 'style mounted once <body> arrives');
assert.equal(early.body.children.length, 1, 'canvas mounted once <body> arrives');
assert.equal(early.publishes.length, 1, 'token layer published after ready');
early.dispose();
assert.equal(early.root.attributes['data-dsh-pixel-themes'], undefined);
assert.equal(early.body.children[0].isConnected, false);

/* ── 6. WebGL failure and context restoration ───────────────────────────── */

const originalWarn = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args.map(String).join(' '));
try {
  for (const fault of ['no-context', 'context-throws', 'compile', 'link', 'draw']) {
    const fallback = boot({ withBody: true, dictionaries: ZH, fault });
    assert.equal(fallback.root.attributes['data-dsh-pixel-themes'], 'active', fault);
    assert.equal(fallback.stage.style.backgroundColor, 'rgb(8, 8, 13)', fault);
    const canvas = fallback.stage.children[0];
    assert.equal(canvas?.getAttribute?.('aria-hidden') ?? 'true', 'true', fault);
    assert.ok(!canvas || canvas.style.visibility === 'hidden', fault);
    assert.equal(fallback.frames.size, 0, fault);
    fallback.emitDocument('visibilitychange');
    assert.equal(fallback.frames.size, 0, `visibility does not restart ${fault}`);
    fallback.setScheme('light');
    assert.equal(fallback.stage.style.backgroundColor, 'rgb(242, 238, 228)', fault);
    const originalStage = fallback.stage;
    fallback.dispose();
    assert.equal(originalStage.isConnected, false, `${fault} teardown`);
    assert.equal(fallback.stage, undefined, fault);
  }

  const restored = boot({ withBody: true, dictionaries: ZH });
  const canvas = restored.stage.children[0];
  assert.equal(canvas.style.visibility, 'visible');
  let prevented = false;
  canvas._listeners.webglcontextlost[0]({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'context restoration allowed');
  assert.equal(canvas.style.visibility, 'hidden');
  restored.emitDocument('visibilitychange');
  assert.equal(restored.frames.size, 0, 'no animation queued during context loss');
  canvas._listeners.webglcontextrestored[0]();
  assert.equal(canvas.style.visibility, 'visible');
  assert.equal(restored.frames.size, 1);
  restored.dispose();
  assert.equal(restored.frames.size, 0);
  assert.equal(canvas._listeners.webglcontextrestored.length, 0);
  assert.ok(restored.calls.some(([call]) => call === 'deleteProgram'));
  assert.ok(restored.calls.some(([call]) => call === 'deleteBuffer'));

  const rolledBack = boot({ withBody: false, dictionaries: ZH, rejectTokens: true });
  rolledBack.ready();
  assert.equal(rolledBack.root.attributes['data-dsh-pixel-themes'], undefined);
  assert.equal(rolledBack.root.style.getPropertyValue('--dsh-pixel-veil'), '');
  assert.equal(rolledBack.root.style.getPropertyValue('--dsh-pixel-scrim'), '');
  assert.equal(rolledBack.head.children[0].isConnected, false);
  assert.equal(rolledBack.stage, undefined);
  assert.equal(rolledBack.frames.size, 0);
  assert.ok(warnings.some(message => message.includes('theme rolled back')));
  rolledBack.dispose(); // Already rolled back.
} finally {
  console.warn = originalWarn;
}

/* ── 7. Primary button contrast for every shipped palette ──────────────── */

function relativeLuminance(css) {
  const rgb = css === '#000' ? [0, 0, 0] : css === '#fff' ? [255, 255, 255] : css.match(/\d+/g).map(Number);
  return rgb.reduce((sum, value, index) => {
    const channel = value / 255;
    const light = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + light * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

const shipped = boot({ withBody: true, dictionaries: ZH, bundle: BUNDLE });
const shippedPage = shipped.registrations[0].Component();
const shippedPicker = shippedPage.props.children[0].props.children[1].props.children;
for (const { props: { value: themeId } } of shippedPicker.props.children) {
  shippedPicker.props.onChange({ target: { value: themeId } });
  const palette = shipped.publishes.at(-1).tokens;
  for (const scheme of ['light', 'dark']) {
    const foreground = relativeLuminance(palette['--dsw-alias-label-primary-foreground'][scheme]);
    for (const state of ['fill', 'hover']) {
      const background = relativeLuminance(palette[`--dsw-alias-button-primary-${state}`][scheme]);
      const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      assert.ok(ratio >= 4.5, `${themeId} / ${scheme} / ${state} contrast: ${ratio.toFixed(2)}:1`);
    }
  }
}
shipped.dispose();

/* ── 8. The committed bundle matches src/ and themes/ ───────────────────── */

const buildScript = fileURLToPath(new URL('../scripts/build.mjs', import.meta.url));
execFileSync(process.execPath, [buildScript, '--check'], { encoding: 'utf8' });

console.log('pixel-themes client self-check: ok');
