/**
 * The stage: one fixed <canvas> behind the window, drawing whichever theme is
 * active through its own fragment shader.
 *
 * The engine owns the parts every theme shares — the vertex quad, the dither
 * cell grid, the frame budget, the pointer easing, the visibility and
 * reduced-motion handling, WebGL loss recovery — and hands the shader the four
 * uniforms it drives: `uRes`, `uTime`, `uPointer`, `uNight`.
 */

const STAGE_VERTEX_SHADER = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * Mount the canvas and start drawing.
 * @param theme - active theme spec (its `fragment` and `colors` are used).
 * @param isDark - reads the current color scheme.
 * @returns refresh/destroy handles.
 */
function createStage({ theme, isDark }) {
  const colorNames = Object.keys(theme.colors.dark);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.dshPixelScene = theme.id;
  // The CSS background is the paper: if WebGL is unavailable or the context is
  // lost, the window still shows the theme's ground colour.
  canvas.style.cssText = [
    'position: fixed',
    'left: 0',
    'top: 0',
    'z-index: -1',
    'pointer-events: none',
    'image-rendering: pixelated',
    'image-rendering: crisp-edges'
  ].join(';');

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false
  });

  const paletteOf = dark => theme.colors[dark ? 'dark' : 'light'];
  let paper = rgbCss(paletteOf(isDark()).uPaper);
  canvas.style.background = paper;

  const mount = () => {
    if (canvas.isConnected) return true;
    if (!document.body) return false;
    document.body.prepend(canvas);
    return true;
  };

  if (!gl) {
    console.warn(`[${BUNDLE_ID}] WebGL unavailable: keeping the flat palette without the scene.`);
    return { refresh() {}, destroy() {} };
  }

  mount();

  let program = null;
  let locations = {};
  let raf = 0;
  let last = 0;
  const start = performance.now();
  let lost = false;
  let pointer = 0;
  let pointerTarget = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(`[${BUNDLE_ID}] theme "${theme.id}" shader compile failed:`, gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };

  const build = () => {
    const vertex = compile(gl.VERTEX_SHADER, STAGE_VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, theme.fragment);
    if (!vertex || !fragment) {
      program = null;
      return;
    }

    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(`[${BUNDLE_ID}] theme "${theme.id}" program link failed:`, gl.getProgramInfoLog(program));
      program = null;
      return;
    }

    gl.useProgram(program);
    // One triangle that covers the viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    locations = {};
    for (const name of ['uRes', 'uTime', 'uPointer', 'uNight', ...colorNames]) {
      locations[name] = gl.getUniformLocation(program, name);
    }
  };

  const draw = now => {
    if (!program || lost) return;

    const dark = isDark();
    const colors = paletteOf(dark);
    const nextPaper = rgbCss(colors.uPaper);
    if (nextPaper !== paper) {
      paper = nextPaper;
      canvas.style.background = paper;
    }

    // reduced motion holds one still frame, picked so no shooting star is in flight
    const time = motion.matches ? ENGINE.stillFrame : ((now - start) / 1000);
    pointer += (pointerTarget - pointer) * 0.08;

    gl.viewport(0, 0, canvas.width, canvas.height);
    // A theme's shader may ignore some of these (a night-only scene need not
    // declare `uNight`, a self-paletted one need not declare `uPaper`); an
    // undeclared uniform yields a null location, which must simply be skipped.
    if (locations.uRes !== null) gl.uniform2f(locations.uRes, canvas.width, canvas.height);
    if (locations.uTime !== null) gl.uniform1f(locations.uTime, time);
    if (locations.uPointer !== null) gl.uniform1f(locations.uPointer, pointer);
    if (locations.uNight !== null) gl.uniform1f(locations.uNight, dark ? 1 : 0);

    for (const name of colorNames) {
      if (locations[name] === null) continue;
      gl.uniform3fv(locations[name], unitRgb(colors[name]));
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    if (!canvas.isConnected) mount();
    // Whole device pixels per cell, so every cell is the same size.
    const dpr = window.devicePixelRatio || 1;
    const snapped = Math.max(1, Math.round(ENGINE.cell * dpr)) / dpr;
    const columns = Math.max(1, Math.ceil(window.innerWidth / snapped));
    const rows = Math.max(1, Math.ceil(window.innerHeight / snapped));
    canvas.width = columns;
    canvas.height = rows;
    canvas.style.width = `${columns * snapped}px`;
    canvas.style.height = `${rows * snapped}px`;
    draw(performance.now());
  };

  const tick = now => {
    raf = requestAnimationFrame(tick);
    if (now - last >= 1000 / ENGINE.fps - 2) {
      last = now;
      draw(now);
    }
  };

  const play = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!motion.matches && !document.hidden) {
      raf = requestAnimationFrame(tick);
    } else {
      draw(performance.now());
    }
  };

  const onPointer = event => {
    pointerTarget = event.clientX / window.innerWidth - 0.5;
  };

  const onLost = event => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
  };

  const onRestored = () => {
    lost = false;
    build();
    resize();
    play();
  };

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', play);
  if (typeof motion.addEventListener === 'function') motion.addEventListener('change', play);

  build();
  resize();
  play();

  return {
    refresh() {
      draw(performance.now());
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', play);
      if (typeof motion.removeEventListener === 'function') motion.removeEventListener('change', play);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    }
  };
}
