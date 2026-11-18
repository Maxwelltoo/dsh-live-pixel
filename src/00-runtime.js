/**
 * Shared runtime: platform imports, the ids every module agrees on, and the few
 * colour helpers the token layer and the stage need.
 *
 * Concatenated into `client.js` by `scripts/build.mjs` — this file has no imports
 * and no exports; it shares one function scope with its sibling modules.
 */

const React = require('react');
const h = React.createElement;

/** Locale namespace owned by this plugin. */
const LOCALE_NS = 'pixel-themes';
/** Browser-local preference record. */
const STORAGE_KEY = 'dsh-pixel-themes:v1';
/** Marker attribute the stylesheet keys on. */
const ROOT_ATTRIBUTE = 'data-dsh-pixel-themes';
/** CSS variables carrying the two readable layers. */
const VEIL_VAR = '--dsh-pixel-veil';
const SCRIM_VAR = '--dsh-pixel-scrim';

/**
 * Drawing parameters shared by every theme. A theme owns its shader and colours;
 * the dither cell and the frame budget belong to the engine.
 */
const ENGINE = {
  cell: 3, // CSS px per dither cell
  fps: 24, // the motion is slow; more frames only cost power
  stillFrame: 38 // the moment held when the user asks for reduced motion
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const round3 = value => Number(value.toFixed(3));
const triplet = rgb => `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
const rgbCss = rgb => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
const rgbaCss = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${round3(alpha)})`;
const unitRgb = rgb => [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
const mixRgb = (from, to, t) => [0, 1, 2].map(index => Math.round(from[index] + (to[index] - from[index]) * t));
