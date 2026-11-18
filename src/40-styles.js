/**
 * Stylesheet: clears the shell's field containers so the canvas below them is the
 * paper, stacks the two readable layers, and dresses the Settings page.
 *
 * The field selectors pair the shell's stable CSS-module local names (`_frame`,
 * `_centerCol`, …) with structural `:has()` anchors on slot keys, so a renamed
 * class in a future DSH loses that one surface instead of breaking the theme.
 */

const THEME_CSS = `
/* ── The field goes clear so the scene shows through ─────────────────────── */

:root[${ROOT_ATTRIBUTE}='active'] body,
:root[${ROOT_ATTRIBUTE}='active'] #root,
:root[${ROOT_ATTRIBUTE}='active'] #root > *,
:root[${ROOT_ATTRIBUTE}='active'] [class*='_frame']:not([role='dialog']),
:root[${ROOT_ATTRIBUTE}='active'] [class*='_centerCol']:not([role='dialog']),
:root[${ROOT_ATTRIBUTE}='active'] [class*='_bottomRow']:not([role='dialog']),
:root[${ROOT_ATTRIBUTE}='active'] [class*='_page']:not([role='dialog']),
:root[${ROOT_ATTRIBUTE}='active'] :where(:has(> [data-slot='conversation.header']):not([role='dialog'])),
:root[${ROOT_ATTRIBUTE}='active'] :where(:has(> [data-slot='conversation.composer.bar']):not([role='dialog'])) {
  background-color: transparent !important;
}

/* The side columns keep most of their paper, so lists of sessions, files and
   tool output stay crisp; the sky only glows through them. The paper weight is
   the sidebar-fill token, adjusted on the Settings page. */
:root[${ROOT_ATTRIBUTE}='active'] [class*='_sidebarCol']:not([role='dialog']),
:root[${ROOT_ATTRIBUTE}='active'] [class*='_rightbarCol']:not([role='dialog']) {
  background-color: var(--dsw-specific-sidebar-fill) !important;
}

/* The sticky composer seat also paints a gradient that turns fully opaque.
   Let the theme's scrim handle the fade. The composer card keeps its own fill. */
:root[${ROOT_ATTRIBUTE}='active'] [data-composer-seat] {
  background-image: none;
}

/* ── Readable layers between the scene and the app ──────────────────────── */

/* \`::after\` is body's last child, so among the negative-z layers it paints above
   the canvas (prepended first) and still below every piece of app content.
   Background colour is the veil (uniform paper over the whole scene, raised by
   lowering "scene strength"); the gradient on top is the bottom scrim. */
:root[${ROOT_ATTRIBUTE}='active'] body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: rgba(var(--dsh-pixel-paper), var(${VEIL_VAR}, 0));
  background-image: linear-gradient(
    to top,
    rgba(var(--dsh-pixel-paper), calc(0.62 * var(${SCRIM_VAR}, 0.6))) 0%,
    rgba(var(--dsh-pixel-paper), calc(0.34 * var(${SCRIM_VAR}, 0.6))) 28%,
    rgba(var(--dsh-pixel-paper), calc(0.08 * var(${SCRIM_VAR}, 0.6))) 63%,
    rgba(var(--dsh-pixel-paper), 0) 100%
  );
  background-position: center bottom;
  background-repeat: no-repeat;
  background-size: 100% min(48px, 8vh);
}

/* ── The Settings page ──────────────────────────────────────────────────── */

.dsh-pixel-section {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.dsh-pixel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.dsh-pixel-rowText {
  min-width: 0;
}

.dsh-pixel-title {
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}

.dsh-pixel-description {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dsh-pixel-control {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.dsh-pixel-range {
  width: 180px;
  max-width: 40vw;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
  background: transparent;
}

.dsh-pixel-select {
  min-width: 148px;
  padding: 5px 8px;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm, 8px);
  cursor: pointer;
}

.dsh-pixel-select:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 1px;
}

.dsh-pixel-value {
  min-width: 42px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
}

.dsh-pixel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
}

.dsh-pixel-note {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-pixel-action {
  flex: none;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  padding: 5px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}

.dsh-pixel-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-pixel-action:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 1px;
}

@media (max-width: 767px) {
  .dsh-pixel-row {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .dsh-pixel-control {
    justify-content: space-between;
  }

  .dsh-pixel-range {
    flex: 1;
    max-width: none;
  }

  .dsh-pixel-select {
    width: 100%;
  }

  .dsh-pixel-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;
