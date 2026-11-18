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

const makeGl = calls => new Proxy({}, {
  get(_target, prop) {
    if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true;
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

function boot({ withBody, dictionaries }) {
  const calls = [];
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
      if (tag === 'canvas') el.getContext = () => makeGl(calls);
      return el;
    },
    addEventListener(t, fn) { (docListeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { docListeners[t] = (docListeners[t] || []).filter(f => f !== fn); },
    querySelector() { return null; },
  };

  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
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

  new Function(withThemes(BUNDLE, [borealis, twin]))();
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
    on: () => () => {},
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
    get body() { return body; },
    setScheme(next) { scheme = next; },
    ready() {
      body = makeEl('body');
      for (const fn of [...(docListeners.DOMContentLoaded || [])]) fn();
    },
  };
}

const ZH = {
  nav: '像素主题',
  'row.theme.title': '主题',
  'knob.scene.title': '风景强度',
  'knob.surface.title': '卡片纸色',
  'knob.sides.title': '侧栏纸色',
  'knob.scrim.title': '底部柔光',
  'footer.note': '偏好保存在当前浏览器。',
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
assert.equal(section.options.label(), '像素主题', 'nav label');
assert.equal(section.options.locale, 'pixel-themes');

assert.equal(app.localeDictionaries[0].dicts.zh.nav, '像素主题', 'dictionaries registered');

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

/* ── 6. The committed bundle matches src/ and themes/ ───────────────────── */

const buildScript = fileURLToPath(new URL('../scripts/build.mjs', import.meta.url));
execFileSync(process.execPath, [buildScript, '--check'], { encoding: 'utf8' });

console.log('pixel-themes client self-check: ok');
