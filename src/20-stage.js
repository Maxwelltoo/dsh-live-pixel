/**
 * One opaque paper layer behind the app. WebGL draws into a canvas above it,
 * which is revealed only after drawing a frame and hidden on GPU failure.
 */
const STAGE_VERTEX_SHADER = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

function createStage({ theme, isDark }) {
  const backdrop = document.createElement('div');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.dataset.dshPixelScene = theme.id;
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden';
  const paletteOf = dark => theme.colors[dark ? 'dark' : 'light'];
  let gl = null;
  let paper = '';
  const updatePaper = () => {
    const dark = isDark();
    backdrop.style.backgroundColor = rgbCss(theme.palette[dark ? 'dark' : 'light'].paper);
    paper = rgbCss(paletteOf(dark).uPaper);
  };
  updatePaper();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;image-rendering:pixelated;image-rendering:crisp-edges';
  canvas.style.visibility = 'hidden';
  canvas.style.backgroundColor = paper;

  try {
    gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false
    });
  } catch (error) {
    console.warn(`[${BUNDLE_ID}] WebGL context could not be created:`, error);
  }

  if (!gl) {
    document.body.prepend(backdrop);
    return {
      refresh: updatePaper,
      destroy() {
        backdrop.remove();
      }
    };
  }

  const colorNames = Object.keys(theme.colors.dark);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const start = performance.now();
  let vertex = null;
  let fragment = null;
  let program = null;
  let buffer = null;
  let locations = {};
  let ready = false;
  let lost = false;
  let destroyed = false;
  let raf = null;
  let last = 0;
  let pointer = 0;
  let pointerTarget = 0;

  const stop = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  };

  const releaseResources = () => {
    const resources = { program, buffer, fragment, vertex };
    vertex = fragment = program = buffer = null;
    locations = {};
    if (lost) return;
    const release = (label, action) => {
      try {
        action();
      } catch (error) {
        console.warn(`[${BUNDLE_ID}] could not release ${label}:`, error);
      }
    };
    if (resources.program) release('program binding', () => gl.useProgram(null));
    if (resources.buffer) release('vertex buffer', () => gl.deleteBuffer(resources.buffer));
    if (resources.program) release('program', () => gl.deleteProgram(resources.program));
    if (resources.fragment) release('fragment shader', () => gl.deleteShader(resources.fragment));
    if (resources.vertex) release('vertex shader', () => gl.deleteShader(resources.vertex));
  };

  const showPaper = () => {
    ready = false;
    stop();
    canvas.style.visibility = 'hidden';
    releaseResources();
  };

  const compile = (shader, source) => {
    if (!shader) throw new Error('could not allocate shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
    }
  };

  const build = () => {
    vertex = gl.createShader(gl.VERTEX_SHADER);
    compile(vertex, STAGE_VERTEX_SHADER);
    fragment = gl.createShader(gl.FRAGMENT_SHADER);
    compile(fragment, theme.fragment);
    program = gl.createProgram();
    if (!program) throw new Error('could not allocate program');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
    }

    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('could not allocate vertex buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const name of ['uRes', 'uTime', 'uPointer', 'uNight', ...colorNames]) {
      locations[name] = gl.getUniformLocation(program, name);
    }
  };

  const canDraw = () => ready && !lost && !destroyed;
  const render = action => {
    try {
      action();
    } catch (error) {
      showPaper();
      console.warn(`[${BUNDLE_ID}] WebGL failed for theme "${theme.id}":`, error);
    }
  };

  const draw = now => {
    if (!canDraw()) return;
    render(() => {
      const dark = isDark();
      const colors = paletteOf(dark);
      const nextPaper = rgbCss(colors.uPaper);
      if (nextPaper !== paper) {
        paper = nextPaper;
        canvas.style.backgroundColor = paper;
      }
      const time = motion.matches ? ENGINE.stillFrame : (now - start) / 1000;
      pointer += (pointerTarget - pointer) * 0.08;

      gl.viewport(0, 0, canvas.width, canvas.height);
      // A fragment shader can omit uniforms it does not use.
      if (locations.uRes !== null) gl.uniform2f(locations.uRes, canvas.width, canvas.height);
      if (locations.uTime !== null) gl.uniform1f(locations.uTime, time);
      if (locations.uPointer !== null) gl.uniform1f(locations.uPointer, pointer);
      if (locations.uNight !== null) gl.uniform1f(locations.uNight, dark ? 1 : 0);
      for (const name of colorNames) {
        if (locations[name] !== null) gl.uniform3fv(locations[name], unitRgb(colors[name]));
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (canvas.style.visibility === 'hidden') canvas.style.visibility = 'visible';
    });
  };

  const resize = () => {
    if (!canDraw()) return;
    // Snap the grid to whole device pixels so every cell is the same size.
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

  const shouldAnimate = () => canDraw() && !motion.matches && !document.hidden;
  const tick = now => {
    raf = null;
    if (!shouldAnimate()) return;
    if (now - last >= 1000 / ENGINE.fps - 2) {
      last = now;
      draw(now);
    }
    if (shouldAnimate()) raf = requestAnimationFrame(tick);
  };

  const play = () => {
    stop();
    if (shouldAnimate()) raf = requestAnimationFrame(tick);
    else if (!document.hidden && motion.matches) draw(performance.now());
  };

  const onPointer = event => {
    pointerTarget = event.clientX / window.innerWidth - 0.5;
  };

  const onLost = event => {
    event.preventDefault();
    lost = true;
    showPaper();
  };

  const onRestored = () => {
    if (destroyed) return;
    lost = false;
    render(() => {
      build();
      ready = true;
      resize();
      play();
    });
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    backdrop.remove();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', play);
    motion.removeEventListener?.('change', play);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    showPaper();
    if (!lost) gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  try {
    backdrop.append(canvas);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', play);
    motion.addEventListener?.('change', play);
    document.body.prepend(backdrop);
    onRestored();
  } catch (error) {
    destroy();
    throw error;
  }

  return {
    refresh() {
      updatePaper();
      draw(performance.now());
    },
    destroy
  };
}
