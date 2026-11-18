#!/usr/bin/env node
/**
 * Bundle the Client half.
 *
 * Sources are plain script fragments (`src/NN-*.js`) that share one function
 * scope, plus one data module per theme (`themes/*.js`). This script validates
 * every theme, concatenates the fragments in a fixed order, and wraps the result
 * in the loader call DSH expects — writing `client.js`.
 *
 *   node scripts/build.mjs           write client.js
 *   node scripts/build.mjs --check   fail when client.js is stale
 *
 * A theme is data only. Add one by dropping `themes/<id>.js` next to `borealis.js`
 * and re-running this script; nothing in `src/` needs to change.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const themesDir = new URL('themes/', root);
const srcDir = new URL('src/', root);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const license = (await readFile(new URL('LICENSE', root), 'utf8')).trimEnd();
const bundlePath = new URL('client.js', root);

/** Concatenation order; every other `src/*.js` file is an error, not a silent extra. */
const SRC_ORDER = [
  '00-runtime.js',
  '10-settings.js',
  '20-stage.js',
  '30-tokens.js',
  '40-styles.js',
  '50-section.js',
  '60-plugin.js'
];

const PALETTE_KEYS = ['paper', 'surface', 'surfaceDeep', 'ink', 'inkSoft', 'inkFaint', 'accent', 'accentHover'];

const fail = message => {
  console.error(`build: ${message}`);
  process.exit(1);
};

const isTriplet = value =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255);

/** Braces and parentheses outside comments must pair: the usual hand-editing slip. */
function isBalanced(glsl) {
  const code = glsl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const closing = { '}': '{', ')': '(' };
  const stack = [];
  for (const character of code) {
    if (character === '{' || character === '(') stack.push(character);
    else if (character === '}' || character === ')') {
      if (stack.pop() !== closing[character]) return false;
    }
  }
  return stack.length === 0;
}

const isLocalized = value =>
  value !== null &&
  typeof value === 'object' &&
  typeof value.zh === 'string' &&
  value.zh.length > 0 &&
  typeof value.en === 'string' &&
  value.en.length > 0;

/**
 * Reject a theme the engine cannot draw, naming the exact field.
 * @param theme - `export default` of a theme module.
 * @param file - source file name, for the message.
 * @returns the validated theme.
 */
function validateTheme(theme, file) {
  const where = label => `themes/${file}: ${label}`;
  if (!theme || typeof theme !== 'object') fail(where('must export default an object'));
  if (typeof theme.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(theme.id)) {
    fail(where('id must be kebab-case, starting with a letter'));
  }
  if (!isLocalized(theme.label)) fail(where('label needs non-empty zh and en strings'));
  if (theme.description !== undefined && !isLocalized(theme.description)) {
    fail(where('description, when present, needs non-empty zh and en strings'));
  }
  if (theme.defaults !== undefined) {
    for (const [key, value] of Object.entries(theme.defaults)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(where(`defaults.${key} must be a finite number`));
    }
  }
  for (const scheme of ['light', 'dark']) {
    const colors = theme.colors?.[scheme];
    if (!colors || typeof colors !== 'object') fail(where(`colors.${scheme} is required`));
    if (!isTriplet(colors.uPaper)) fail(where(`colors.${scheme}.uPaper must be an [r, g, b] triplet`));
    for (const [name, value] of Object.entries(colors)) {
      if (!/^u[A-Z][A-Za-z0-9]*$/.test(name)) fail(where(`colors.${scheme}.${name} must look like a uniform name (uSomething)`));
      if (!isTriplet(value)) fail(where(`colors.${scheme}.${name} must be an [r, g, b] triplet`));
    }
    const palette = theme.palette?.[scheme];
    if (!palette || typeof palette !== 'object') fail(where(`palette.${scheme} is required`));
    for (const key of PALETTE_KEYS) {
      if (!isTriplet(palette[key])) fail(where(`palette.${scheme}.${key} must be an [r, g, b] triplet`));
    }
  }
  const lightColors = Object.keys(theme.colors.light).sort().join(',');
  const darkColors = Object.keys(theme.colors.dark).sort().join(',');
  if (lightColors !== darkColors) fail(where('colors.light and colors.dark must declare the same uniforms'));
  if (typeof theme.fragment !== 'string' || theme.fragment.trim() === '') fail(where('fragment must be a GLSL string'));
  if (!theme.fragment.includes('void main()')) fail(where('fragment must define void main()'));
  if (!isBalanced(theme.fragment)) fail(where('fragment has unbalanced braces or parentheses'));
  return theme;
}

async function loadThemes() {
  const files = (await readdir(themesDir)).filter(name => name.endsWith('.js'));
  if (files.length === 0) fail('themes/ holds no *.js file');
  const themes = [];
  for (const file of files.sort()) {
    const module = await import(new URL(file, themesDir).href);
    const theme = validateTheme(module.default, file);
    if (themes.some(existing => existing.id === theme.id)) fail(`themes/${file}: duplicate id "${theme.id}"`);
    themes.push(theme);
  }
  return themes.sort((left, right) => left.id.localeCompare(right.id));
}

async function loadSources() {
  const files = (await readdir(srcDir)).filter(name => name.endsWith('.js'));
  const extra = files.filter(name => !SRC_ORDER.includes(name));
  if (extra.length > 0) fail(`src/${extra[0]}: not listed in SRC_ORDER (scripts/build.mjs)`);
  const missing = SRC_ORDER.filter(name => !files.includes(name));
  if (missing.length > 0) fail(`src/${missing[0]}: missing`);
  const parts = [];
  for (const name of SRC_ORDER) {
    const source = (await readFile(new URL(name, srcDir), 'utf8')).trimEnd();
    parts.push(source);
  }
  return parts;
}

function render(themes, parts) {
  const indent = text => text.split('\n').map(line => (line === '' ? '' : `  ${line}`)).join('\n');
  const themesDecl = indent(`const THEMES = ${JSON.stringify(themes, null, 2)};`);
  const body = parts.map(part => indent(part)).join('\n\n');
  const licenseHeader = license.split('\n').map(line => line ? ` * ${line}` : ' *').join('\n');
  return `/*!
${licenseHeader}
 */
/* eslint-disable */
/**
 * GENERATED by scripts/build.mjs — do not edit.
 *
 * Sources: src/*.js (concatenated in SRC_ORDER) and themes/*.js (embedded as data).
 * Edit those, then run \`node scripts/build.mjs\`.
 *
 * Themes: ${themes.map(theme => theme.id).join(', ')}
 */

window.__ModuleLoader__.load({
  id: ${JSON.stringify(manifest.name)},
  factory(require) {
  const BUNDLE_ID = ${JSON.stringify(manifest.name)};
${themesDecl}

${body}
  }
});
`;
}

const themes = await loadThemes();
const parts = await loadSources();
const next = render(themes, parts);

if (process.argv.includes('--check')) {
  const current = await readFile(bundlePath, 'utf8').catch(() => '');
  if (current !== next) {
    console.error('build: client.js is stale — run `node scripts/build.mjs`');
    process.exitCode = 1;
  } else {
    console.log(`build: client.js is up to date (${themes.length} theme(s))`);
  }
} else {
  await writeFile(bundlePath, next);
  console.log(`build: wrote ${fileURLToPath(bundlePath)} (${themes.length} theme(s), ${parts.length} source module(s))`);
}
