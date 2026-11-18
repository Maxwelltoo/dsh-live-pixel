/**
 * Readability settings: the knobs every theme shares, per-theme values, and the
 * small store the Settings page and the live surface both read.
 */

/**
 * The shared knobs. A theme may override any default through `theme.defaults`;
 * the ranges stay global so one slider always means the same thing.
 */
const KNOBS = [
  {
    key: 'scene',
    min: 0,
    max: 100,
    step: 5,
    fallback: 100,
    unit: '%',
    title: 'knob.scene.title',
    description: 'knob.scene.description'
  },
  {
    key: 'surface',
    min: 60,
    max: 100,
    step: 2,
    fallback: 93,
    unit: '%',
    title: 'knob.surface.title',
    description: 'knob.surface.description'
  },
  {
    key: 'sides',
    min: 60,
    max: 100,
    step: 2,
    fallback: 90,
    unit: '%',
    title: 'knob.sides.title',
    description: 'knob.sides.description'
  },
  {
    key: 'scrim',
    min: 0,
    max: 100,
    step: 10,
    fallback: 60,
    unit: '%',
    title: 'knob.scrim.title',
    description: 'knob.scrim.description'
  }
];

const knobByKey = key => KNOBS.find(knob => knob.key === key);
const findTheme = id => THEMES.find(theme => theme.id === id) ?? THEMES[0];

/** The knob values a theme starts from. */
const themeDefaults = theme => {
  const values = {};
  for (const knob of KNOBS) {
    const declared = theme.defaults?.[knob.key];
    values[knob.key] = clampNumber(
      Number.isFinite(declared) ? declared : knob.fallback,
      knob.min,
      knob.max
    );
  }
  return values;
};

const readStoredState = () => {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn(`[${BUNDLE_ID}] preferences could not be read:`, error);
    return {};
  }
};

/**
 * One settings store for the page.
 *
 * State shape: `{ themeId, values: { [themeId]: { scene, surface, sides, scrim } } }`
 * so switching themes never loses the tuning of the other one.
 */
const createSettingsStore = () => {
  const stored = readStoredState();
  const knownTheme = typeof stored.theme === 'string' && THEMES.some(theme => theme.id === stored.theme);
  let state = {
    theme: knownTheme ? stored.theme : THEMES[0].id,
    values: { ...(stored.values && typeof stored.values === 'object' ? stored.values : {}) }
  };

  const listeners = new Set();

  // `useSyncExternalStore` calls getSnapshot during render and again after
  // subscribing, and React 18 requires the SAME reference while nothing changed:
  // a fresh object per call is an infinite update loop ("Maximum update depth
  // exceeded"), which blanks the Settings page. Cache until the state moves.
  let cachedSnapshot = null;

  const valuesFor = themeId => {
    const theme = findTheme(themeId);
    const merged = themeDefaults(theme);
    const saved = state.values[themeId];
    if (saved && typeof saved === 'object') {
      for (const knob of KNOBS) {
        if (Number.isFinite(saved[knob.key])) merged[knob.key] = clampNumber(saved[knob.key], knob.min, knob.max);
      }
    }
    return merged;
  };

  const snapshot = () => {
    if (cachedSnapshot === null) {
      cachedSnapshot = {
        themeId: state.theme,
        theme: findTheme(state.theme),
        values: valuesFor(state.theme)
      };
    }
    return cachedSnapshot;
  };

  const commit = () => {
    cachedSnapshot = null;
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn(`[${BUNDLE_ID}] preferences could not be saved:`, error);
    }
    for (const listener of [...listeners]) listener();
  };

  return {
    get: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTheme(themeId) {
      if (!THEMES.some(theme => theme.id === themeId) || state.theme === themeId) return;
      state = { ...state, theme: themeId };
      commit();
    },
    setKnob(key, value) {
      const knob = knobByKey(key);
      if (!knob) return;
      const next = clampNumber(Number(value), knob.min, knob.max);
      const current = valuesFor(state.theme);
      if (current[key] === next) return;
      state = {
        ...state,
        values: { ...state.values, [state.theme]: { ...current, [key]: next } }
      };
      commit();
    },
    reset() {
      state = {
        ...state,
        values: { ...state.values, [state.theme]: themeDefaults(findTheme(state.theme)) }
      };
      commit();
    }
  };
};
