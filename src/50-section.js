/**
 * The Settings page: one theme picker and the shared readability knobs.
 *
 * Controls are written here rather than imported from a Harness UI package on
 * purpose (the plugin guidance forbids `require`-ing them); the row markup,
 * spacing and type sizes copy the host's own settings rows, and every colour is
 * a `--dsw-alias-*` token, so the page follows light/dark like the rest of the
 * application.
 */

/**
 * Build the section component.
 * @param deps.t - bound translator for this plugin's namespace.
 * @param deps.store - settings store.
 * @param deps.themeLabel - theme → display name for the active locale.
 * @param deps.themeDescription - theme → one-line description for the active locale.
 * @returns a React component to register in `settings.section`.
 */
const createSection = ({ t, store, themeLabel, themeDescription }) => {
  function KnobRow({ knob, values }) {
    const value = values[knob.key];
    return h(
      'div',
      { className: 'dsh-pixel-row' },
      h(
        'div',
        { className: 'dsh-pixel-rowText' },
        h('div', { className: 'dsh-pixel-title' }, t(knob.title)),
        h('div', { className: 'dsh-pixel-description' }, t(knob.description))
      ),
      h(
        'div',
        { className: 'dsh-pixel-control' },
        h('input', {
          type: 'range',
          className: 'dsh-pixel-range',
          min: knob.min,
          max: knob.max,
          step: knob.step,
          value,
          'aria-label': t(knob.title),
          onChange: event => store.setKnob(knob.key, event.target.value)
        }),
        h('span', { className: 'dsh-pixel-value', 'aria-hidden': true }, `${value}${knob.unit}`)
      )
    );
  }

  function PixelThemesPage() {
    const snapshot = React.useSyncExternalStore(store.subscribe, store.get, store.get);
    const { theme, values } = snapshot;

    return h(
      'div',
      { className: 'dsh-pixel-section' },
      h(
        'div',
        { className: 'dsh-pixel-row' },
        h(
          'div',
          { className: 'dsh-pixel-rowText' },
          h('div', { className: 'dsh-pixel-title' }, t('row.theme.title')),
          h('div', { className: 'dsh-pixel-description' }, themeDescription(theme))
        ),
        h(
          'div',
          { className: 'dsh-pixel-control' },
          h(
            'select',
            {
              className: 'dsh-pixel-select',
              value: theme.id,
              'aria-label': t('row.theme.title'),
              onChange: event => store.setTheme(event.target.value)
            },
            THEMES.map(candidate =>
              h('option', { key: candidate.id, value: candidate.id }, themeLabel(candidate))
            )
          )
        )
      ),
      KNOBS.map(knob => h(KnobRow, { key: knob.key, knob, values })),
      h(
        'div',
        { className: 'dsh-pixel-footer' },
        h('span', { className: 'dsh-pixel-note' }, t('footer.note')),
        h(
          'button',
          { type: 'button', className: 'dsh-pixel-action', onClick: () => store.reset() },
          t('footer.reset')
        )
      )
    );
  }

  /**
   * A crashing settings row must show its reason instead of an empty page: the
   * shell renders a failed slot entry as nothing at all.
   */
  class PageBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
      return { error };
    }

    componentDidCatch(error) {
      console.warn(`[${BUNDLE_ID}] settings page failed:`, error);
    }

    render() {
      if (this.state.error === null) return this.props.children;
      const reason = this.state.error?.message ?? String(this.state.error);
      return h(
        'div',
        { className: 'dsh-pixel-section' },
        h(
          'div',
          { className: 'dsh-pixel-row' },
          h(
            'div',
            { className: 'dsh-pixel-rowText' },
            h('div', { className: 'dsh-pixel-title' }, t('error.title')),
            h('div', { className: 'dsh-pixel-description' }, reason)
          )
        ),
        h('div', { className: 'dsh-pixel-footer' }, h('span', { className: 'dsh-pixel-note' }, t('error.hint')))
      );
    }
  }

  return function PixelThemesSettings() {
    return h(PageBoundary, null, h(PixelThemesPage, null));
  };
};
