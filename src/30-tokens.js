/**
 * The token layer: a theme's palette and the user's paper weights turned into the
 * `--dsw-*` aliases the shell paints with.
 *
 * `--dsw-alias-bg-base` is BOTH the window ground and the neutral card fill
 * (`AskQuestionCard`, schedule detail, inputs), so it stays opaque paper and the
 * stylesheet clears the field containers instead. Translucency there would
 * compound across the four nested field surfaces (body → frame → centre column →
 * conversation root) into an opaque veil; a transparent value would make every
 * card unreadable.
 */

/** Status colours every theme shares, unless its palette overrides them. */
const STATE_COLORS = {
  light: { error: [200, 50, 62], success: [10, 146, 75], warn: [185, 98, 0] },
  dark: { error: [255, 107, 122], success: [79, 213, 127], warn: [254, 162, 71] }
};

const luminance = rgb => {
  const [r, g, b] = unitRgb(rgb).map(channel => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Use the foreground with the better minimum contrast across normal and hover.
const buttonForeground = ({ accent, accentHover }) => {
  const normal = luminance(accent) + 0.05;
  const hover = luminance(accentHover) + 0.05;
  return Math.min(normal, hover) / 0.05 >= 1.05 / Math.max(normal, hover) ? '#000' : '#fff';
};

/**
 * Compose the alias map for one theme and one set of knob values.
 * @param theme - active theme spec.
 * @param values - resolved knob values (`scene`, `surface`, `sides`, `scrim`).
 * @returns token name → `{ light, dark }` values, the shape `overrideTokens` takes.
 */
const buildTokens = (theme, values) => {
  const surface = values.surface / 100;
  const sides = values.sides / 100;
  const code = Math.min(1, surface + 0.03);
  const tokens = {};

  for (const scheme of ['light', 'dark']) {
    const palette = theme.palette[scheme];
    const state = palette.state ?? STATE_COLORS[scheme];
    const inkAlpha = alpha => rgbaCss(palette.ink, alpha);
    tokens['--dsh-pixel-paper'] = tokens['--dsh-pixel-paper'] ?? {};

    const set = (name, value) => {
      tokens[name] = tokens[name] ?? {};
      tokens[name][scheme] = value;
    };

    // Paper ground as a bare `R, G, B` triplet so the stylesheet can mix it into
    // the veil and scrim at any alpha.
    set('--dsh-pixel-paper', triplet(palette.paper));

    set('--dsw-alias-bg-base', rgbCss(palette.paper));
    set('--dsw-alias-bg-layer-1', rgbaCss(palette.surface, surface));
    set('--dsw-alias-bg-layer-2', rgbaCss(palette.surfaceDeep, surface));
    set('--dsw-alias-bg-layer-3', rgbaCss(mixRgb(palette.surfaceDeep, palette.ink, 0.06), surface));
    set('--dsw-alias-bg-overlay', rgbCss(palette.surface));
    set('--dsw-alias-bg-module-platform', rgbaCss(palette.surfaceDeep, surface));
    set('--dsw-specific-menu', rgbaCss(palette.surface, 0.97));
    set('--dsw-menu-surface-fill', rgbaCss(palette.surface, 0.97));
    set('--dsw-specific-tip', rgbaCss(palette.surface, 0.97));

    set('--dsw-alias-label-primary', rgbCss(palette.ink));
    set('--dsw-alias-label-secondary', rgbCss(palette.inkSoft));
    set('--dsw-alias-label-tertiary', rgbCss(palette.inkFaint));

    set('--dsw-alias-brand-primary', rgbCss(palette.accent));
    set('--dsw-alias-brand-primary-soft', rgbaCss(palette.accent, 0.15));
    set('--dsw-alias-brand-text', rgbCss(palette.accent));
    set('--dsw-alias-label-primary-foreground', buttonForeground(palette));
    set('--dsw-alias-button-primary-fill', rgbCss(palette.accent));
    set('--dsw-alias-button-primary-hover', rgbCss(palette.accentHover));
    set('--dsw-alias-button-primary-dimmed', rgbaCss(palette.accent, 0.45));
    set('--dsw-focus-ring-color', rgbCss(palette.accent));

    set('--dsw-alias-border-l1', inkAlpha(0.12));
    set('--dsw-alias-border-l2', inkAlpha(0.2));
    set('--dsw-alias-border-l3', inkAlpha(0.3));
    set('--dsw-alias-border-l4', inkAlpha(0.42));

    // Side columns: paper-heavy so lists of sessions, files and tool output stay crisp
    set('--dsw-specific-sidebar-fill', rgbaCss(palette.paper, sides));
    set('--dsw-specific-sidebar-nav-item-active', rgbaCss(palette.accent, 0.14));
    set('--dsw-specific-sidebar-nav-item-hover', inkAlpha(0.05));

    set('--dsw-specific-input-major', rgbaCss(palette.surface, surface));
    set('--dsw-specific-selector', rgbaCss(palette.surfaceDeep, surface));
    set('--dsw-specific-bubble', rgbaCss(palette.surface, surface));
    set('--dsw-specific-bubble-highlight', rgbaCss(mixRgb(palette.surface, palette.ink, 0.04), surface));

    set('--dsw-alias-interactive-bg-hover', inkAlpha(0.05));
    set('--dsw-alias-interactive-bg-active', inkAlpha(0.09));

    set('--dsw-alias-markdown-code-block', rgbaCss(palette.surfaceDeep, code));
    set('--dsw-alias-markdown-inline-code', rgbaCss(palette.surfaceDeep, code));

    set('--dsw-alias-state-error-primary', rgbCss(state.error));
    set('--dsw-alias-state-success-primary', rgbCss(state.success));
    set('--dsw-alias-state-warn-primary', rgbCss(state.warn));
  }

  return tokens;
};

/**
 * The two readable layers are plain CSS variables rather than tokens: a slider
 * drag then touches one property each instead of republishing the token layer.
 * @param values - resolved knob values.
 */
const surfaceVariables = values => ({
  [VEIL_VAR]: round3((100 - values.scene) / 100 * 0.9),
  [SCRIM_VAR]: round3(values.scrim / 100)
});
