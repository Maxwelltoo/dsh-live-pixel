/**
 * The Client plugin: owns the token layer, the stage and the Settings page, and
 * keeps them in step with the active theme and the user's knobs.
 */

return {
  inject: ['theme', 'slots', 'locale'],
  apply(ctx) {
    const store = createSettingsStore();

    /* ── Copy ──────────────────────────────────────────────────────────── */

    const dictionaries = {
      en: {
        nav: 'Pixel themes',
        'row.theme.title': 'Theme',
        'knob.scene.title': 'Scene strength',
        'knob.scene.description': 'How much of the dithered scene shows through the window. Lower it when text over the artwork is hard to read.',
        'knob.surface.title': 'Surface paper',
        'knob.surface.description': 'Paper opacity of cards, the composer, message bubbles and code blocks.',
        'knob.sides.title': 'Side columns',
        'knob.sides.description': 'Paper opacity of the session list and the right-hand panel.',
        'knob.scrim.title': 'Bottom scrim',
        'knob.scrim.description': 'Strength of the fade above the composer, which protects text scrolling over the bright part of the scene.',
        'footer.note': 'Saved for this client.',
        'footer.reset': 'Restore defaults',
        'error.title': 'This page failed to render',
        'error.hint': 'The reason is above; the browser console has the full error.'
      },
      zh: {
        nav: '动态像素主题',
        'row.theme.title': '主题',
        'knob.scene.title': '风景强度',
        'knob.scene.description': '点阵风景透出窗口的程度。若画面上的文字难以辨认，可往下调。',
        'knob.surface.title': '卡片纸色',
        'knob.surface.description': '卡片、输入框、消息气泡与代码块的纸色不透明度。',
        'knob.sides.title': '侧栏纸色',
        'knob.sides.description': '会话列表与右侧面板的纸色不透明度。',
        'knob.scrim.title': '底部柔光',
        'knob.scrim.description': '输入框上方渐隐层的强度，用于保护滚过亮部画面的正文。',
        'footer.note': '偏好保存在当前浏览器。',
        'footer.reset': '恢复默认',
        'error.title': '这个设置页渲染失败',
        'error.hint': '原因见上方；完整错误在浏览器控制台。'
      }
    };

    const registerDictionaries = typeof ctx.locale?.register === 'function'
      ? () => ctx.locale.register(LOCALE_NS, dictionaries)
      : () => () => {};
    const localeT = typeof ctx.locale?.bind === 'function' ? ctx.locale.bind(LOCALE_NS) : key => key;

    /** Copy that falls back to the key itself, so a missing dictionary never blanks a label. */
    const text = (key, fallback) => {
      const value = (() => {
        try {
          return localeT(key);
        } catch {
          return key;
        }
      })();
      return typeof value === 'string' && value !== '' && value !== key ? value : fallback;
    };

    const activeLocale = () => {
      try {
        return String(ctx.locale?.getLocale?.()?.active ?? 'en');
      } catch {
        return 'en';
      }
    };

    /** Localized value out of a `{ zh, en }` record written by a theme. */
    const localized = (record, fallback) => {
      if (!record || typeof record !== 'object') return fallback;
      const locale = activeLocale();
      const candidates = [locale, locale.split('-')[0], 'en', 'zh'];
      for (const key of candidates) {
        if (typeof record[key] === 'string' && record[key] !== '') return record[key];
      }
      return fallback;
    };

    const themeLabel = theme => localized(theme.label, theme.id);
    const themeDescription = theme => localized(theme.description, '');

    const sectionNavLabel = () => text('nav', 'Pixel themes');

    /* ── Color scheme ──────────────────────────────────────────────────── */

    const isDark = () => {
      try {
        const scheme = ctx.theme?.getTheme?.()?.active?.colorScheme;
        if (scheme) return scheme === 'dark';
      } catch {
        // fall through to the document marker
      }
      return document.body?.hasAttribute('data-ds-dark-theme') === true;
    };

    /* ── Page-side state ───────────────────────────────────────────────── */

    const root = document.documentElement;
    let disposeTokens = null;
    let style = null;
    let stage = null;
    let disposed = false;
    let mountedThemeId = null;
    const cleanups = [];

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      root.removeAttribute(ROOT_ATTRIBUTE);
      root.style.removeProperty(VEIL_VAR);
      root.style.removeProperty(SCRIM_VAR);
      style?.remove();
      for (const cleanup of [disposeTokens, () => stage?.destroy(), ...cleanups.reverse()]) {
        try {
          cleanup?.();
        } catch (error) {
          console.warn(`[${BUNDLE_ID}] cleanup failed:`, error);
        }
      }
    };

    const applySurfaceVariables = values => {
      for (const [name, value] of Object.entries(surfaceVariables(values))) {
        root.style.setProperty(name, String(value));
      }
    };

    const publishTokens = () => {
      const { theme, values } = store.get();
      const next = ctx.theme.overrideTokens(BUNDLE_ID, buildTokens(theme, values));
      if (disposed) {
        next();
        return;
      }
      const previous = disposeTokens;
      disposeTokens = next;
      previous?.();
    };

    const mountStage = () => {
      const { theme } = store.get();
      if (stage && mountedThemeId === theme.id) return;
      stage?.destroy();
      stage = createStage({ theme, isDark });
      mountedThemeId = theme.id;
    };

    const sync = () => {
      const { values } = store.get();
      mountStage();
      applySurfaceVariables(values);
      publishTokens();
      if (disposed) return;
      stage.refresh();
      // The shell goes transparent only once the opaque backdrop is in place.
      root.setAttribute(ROOT_ATTRIBUTE, 'active');
    };

    const guard = action => () => {
      if (disposed) return;
      try {
        action();
      } catch (error) {
        dispose();
        console.warn(`[${BUNDLE_ID}] theme rolled back:`, error);
      }
    };

    /* ── Mount ─────────────────────────────────────────────────────────── */

    const mount = () => {
      if (disposed) return;

      style = document.createElement('style');
      style.id = 'dsh-pixel-themes-style';
      style.textContent = THEME_CSS;
      (document.head ?? root).append(style);

      // The palette attribute lives on <body>, so watch it for scheme flips that
      // arrive outside the theme service (first paint, host boot script).
      const observer = new MutationObserver(guard(() => stage?.refresh()));
      cleanups.push(() => observer.disconnect());
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
      cleanups.push(store.subscribe(guard(sync)));
      sync();
    };

    try {
      cleanups.push(registerDictionaries());
      cleanups.push(ctx.on('theme/change', guard(() => stage?.refresh())));

      const Section = createSection({ t: key => text(key, key), store, themeLabel, themeDescription });
      cleanups.push(ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'pixel-themes',
        order: 60,
        label: sectionNavLabel,
        locale: LOCALE_NS
      }, Section)));

      // An immediate client bundle may evaluate before <body> is parsed.
      if (document.body) {
        mount();
      } else {
        const onReady = guard(mount);
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
        cleanups.push(() => document.removeEventListener('DOMContentLoaded', onReady));
      }
    } catch (error) {
      dispose();
      throw error;
    }

    return dispose;
  }
};
