/**
 * Neon — a bar window on a rainy night city.
 *
 * Original scene. A complete standalone fragment shader: it carries its own
 * six-ramp palette and its own 4x4 Bayer dither, and ignores `uNight` (the scene
 * is a night scene in both color schemes, and the UI palette mirrors the dark
 * one). The engine supplies `uRes`, `uTime` and `uPointer`.
 */

const FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPointer;
const float BAR = 30.0;
float gRamp;
float gTone;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 g = fract(p);
  vec2 u = g * g * g * (g * (g * 6.0 - 15.0) + 10.0);
  float a0 = 6.2831853 * hash(i);
  float a1 = 6.2831853 * hash(i + vec2(1.0, 0.0));
  float a2 = 6.2831853 * hash(i + vec2(0.0, 1.0));
  float a3 = 6.2831853 * hash(i + vec2(1.0, 1.0));
  float n0 = dot(vec2(cos(a0), sin(a0)), g);
  float n1 = dot(vec2(cos(a1), sin(a1)), g - vec2(1.0, 0.0));
  float n2 = dot(vec2(cos(a2), sin(a2)), g - vec2(0.0, 1.0));
  float n3 = dot(vec2(cos(a3), sin(a3)), g - vec2(1.0, 1.0));
  return 1.4142 * mix(mix(n0, n1, u.x), mix(n2, n3, u.x), u.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 1.7);
    amp *= 0.5;
  }
  return clamp(0.5 + 0.5 * sum / 0.875, 0.0, 1.0);
}
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(a * 0.5) * 0.25 + bayer2(a);
}
vec3 pal(float r, float i) {
  if (i < 0.5) return vec3(0.0431, 0.0235, 0.0784);
  if (r < 0.5) return i < 1.5 ? vec3(0.1098, 0.0588, 0.2196) : i < 2.5 ? vec3(0.2275, 0.1137, 0.4314) : i < 3.5 ? vec3(0.4196, 0.2039, 0.6902) : vec3(0.7059, 0.5490, 0.9412);
  else if (r < 1.5) return i < 1.5 ? vec3(0.2392, 0.0392, 0.1804) : i < 2.5 ? vec3(0.5608, 0.0667, 0.3137) : i < 3.5 ? vec3(0.9098, 0.1490, 0.4353) : vec3(1.0000, 0.6118, 0.7529);
  else if (r < 2.5) return i < 1.5 ? vec3(0.0235, 0.1569, 0.2275) : i < 2.5 ? vec3(0.0431, 0.3725, 0.4706) : i < 3.5 ? vec3(0.0980, 0.7647, 0.7882) : vec3(0.6588, 1.0000, 0.9412);
  else if (r < 3.5) return i < 1.5 ? vec3(0.0510, 0.0824, 0.3137) : i < 2.5 ? vec3(0.1216, 0.2000, 0.7216) : i < 3.5 ? vec3(0.2902, 0.4235, 1.0000) : vec3(0.7255, 0.7843, 1.0000);
  else if (r < 4.5) return i < 1.5 ? vec3(0.2510, 0.1255, 0.1020) : i < 2.5 ? vec3(0.6275, 0.2902, 0.1569) : i < 3.5 ? vec3(1.0000, 0.7020, 0.2784) : vec3(1.0000, 0.9529, 0.8392);
  return vec3(0.0);
}
void put(float ramp, float tone) {
  gRamp = ramp;
  gTone = tone;
}
void scene(vec2 q, float t) {
  q = floor(q);
  float W = uRes.x;
  float H = uRes.y;
  float Hs = H - BAR;
  float yy = (q.y - BAR) / Hs;
  float smog = fbm(vec2(q.x * 0.012 + t * 0.007, q.y * 0.04));
  float glow = exp(-yy * 3.4) * (0.52 + 0.3 * smog);
  if (glow > 0.22) put(1.0, glow);
  else put(0.0, 0.25 * smoothstep(1.02, 0.5, yy + 0.22 * (smog - 0.5)));
  vec2 a = q + vec2(floor(uPointer * 2.0 + 0.5), 0.0);
  float ai = floor(a.x / 13.0);
  float ah = hash(vec2(ai, 4.0));
  float atop = BAR + floor((0.2 + 0.42 * ah * ah) * Hs);
  if (a.y < atop && mod(a.x, 13.0) < 9.0 + floor(ah * 4.0)) {
    put(0.0, 0.4);
    vec2 w = floor(a / 3.0);
    if (mod(a.x, 3.0) < 1.0 && mod(a.y, 3.0) < 1.0 && a.y < atop - 2.0 && hash(w) < 0.07) {
      put(0.0, 0.7);
    }
  }
  for (int lane = 0; lane < 2; lane++) {
    float l = float(lane);
    float sp = lane == 0 ? 8.0 : -11.0;
    float span = W + 80.0;
    for (int j = 0; j < 2; j++) {
      float k = float(j);
      float y0 = BAR + floor(Hs * (lane == 0 ? 0.47 : 0.63)) + floor(hash(vec2(k, l)) * 5.0);
      float x = floor(mod(t * sp + hash(vec2(k, l + 5.0)) * span + k * span / 2.0, span) - span * 0.5);
      float back = (x - q.x) * sign(sp);
      if (q.y == y0 && back >= 0.0) {
        if (back < 2.0) put(4.0, 1.0);
        else if (back < 9.0) put(1.0, 0.72 - back * 0.05);
      }
    }
  }
  vec2 m = q + vec2(floor(uPointer * 5.0 + 0.5), 0.0);
  float mi = floor(m.x / 24.0);
  float mh = hash(vec2(mi, 8.0));
  float lx = mod(m.x, 24.0);
  float bw = 13.0 + floor(hash(vec2(mi, 3.0)) * 9.0);
  float mtop = BAR + floor((0.14 + 0.44 * mh) * Hs);
  float inset = m.y > mtop - floor(mh * 14.0) ? 3.0 : 0.0;
  if (m.y < mtop && lx >= inset && lx < bw - inset) {
    put(0.0, lx < inset + 1.0 ? 0.34 : 0.13);
    vec2 w = vec2(floor(m.x / 4.0), floor(m.y / 5.0));
    float hw = hash(w);
    bool lit = hw < 0.1 || (hw < 0.13 && sin(t * 0.12 + hw * 90.0) > 0.0);
    if (hash(vec2(mi, w.y) + 3.7) > 0.93 && hw > 0.3) lit = true;
    if (lit && mod(m.x, 4.0) < 2.0 && mod(m.y, 5.0) < 2.0 && lx > inset + 1.5 && lx < bw - inset - 2.0 && m.y < mtop - 3.0) {
      float hc = hash(w + 21.0);
      put(hc < 0.9 ? 1.0 : 2.0, hc < 0.9 ? 0.5 + 0.2 * hash(w + 5.0) : 0.6);
    }
  }
  if (mh > 0.62) {
    float axx = floor(bw * 0.5);
    if (lx == axx && m.y >= mtop && m.y < mtop + 7.0) put(0.0, 0.13);
    bool blink = fract(t * 0.3 + mh * 3.0) < 0.5;
    vec2 hd = abs(vec2(lx - axx, m.y - mtop - 7.0));
    if (blink && hd.x + hd.y < 0.5) put(1.0, 0.95);
    else if (blink && hd.x + hd.y < 1.5) put(1.0, 0.5);
  }
  vec2 c = m - vec2(floor(-W * 0.17), BAR + floor(Hs * 0.40));
  if (abs(c.x) <= 15.0 && abs(c.y) <= 5.0) {
    put(0.0, abs(c.x) > 14.0 || abs(c.y) > 4.0 ? 0.3 : 0.0);
    float ci = floor((c.x + 13.0) / 7.0);
    float cx = mod(c.x + 13.0, 7.0);
    float beat = mod(floor(t * 1.1), 6.0);
    if (ci >= 0.0 && ci < 4.0 && abs(c.y) <= 3.0 && (cx == 4.0 - abs(c.y) || cx == 5.0 - abs(c.y))) {
      put(2.0, ci < beat && beat < 5.0 ? 0.9 : 0.3);
    }
  }
  vec2 s = m - vec2(floor(W * 0.19), BAR + floor(Hs * 0.56));
  if (abs(s.x) <= 2.0 && s.y < 0.0) put(0.0, 0.13);
  if (s.x >= -9.0 && s.x <= 9.0 && s.y >= 0.0 && s.y <= 27.0) {
    bool off = hash(vec2(floor(t * 6.0), 2.0)) < 0.025;
    bool border = s.x < -8.0 || s.x > 8.0 || s.y < 1.0 || s.y > 26.0;
    put(1.0, 0.16);
    if (border) put(2.0, off ? 0.4 : 0.72);
    else {
      vec2 g = vec2(s.x + 6.0, s.y - 2.0);
      float gi = floor(g.y / 8.0);
      vec2 cellp = floor(vec2(g.x, mod(g.y, 8.0)) / 2.0);
      float page = floor(t / 14.0);
      if (g.x >= 0.0 && g.x < 12.0 && cellp.y < 3.0 && gi < 3.0 && hash(cellp + vec2(gi * 7.0, page * 3.0)) < 0.55) {
        put(1.0, off ? 0.4 : 0.92);
      }
    }
  }
  vec2 r = vec2(q.x + floor(q.y * 0.3), q.y);
  float rc = floor(r.x / 2.0);
  float rh = hash(vec2(rc, 1.0));
  if (rh < 0.07 && mod(r.x, 2.0) < 1.0) {
    float speed = 34.0 + 22.0 * hash(vec2(rc, 2.0));
    float period = 62.0 + 40.0 * hash(vec2(rc, 3.0));
    if (fract((r.y + t * speed) / period + rh * 7.0) < 0.08) put(3.0, 0.3);
  }
  vec2 f = q + vec2(floor(uPointer * 10.0 + 0.5), 0.0);
  vec2 np = f - vec2(floor(-W * 0.33), floor(BAR + Hs * 0.70));
  float stutter = (mod(t, 13.0) < 1.2 && hash(vec2(floor(t * 14.0), 5.0)) < 0.45) ? 0.35 : 1.0;
  float dr = abs(length(np) - 9.0);
  float halo = exp(-dr / 6.0) * 0.5 * stutter;
  if (halo > gTone && halo > 0.12) put(1.0, halo);
  if (np.x == -6.0 || np.x == 6.0) {
    if (np.y > 8.0) put(0.0, 0.3);
  }
  if (dr < 0.75) put(1.0, stutter > 0.5 ? (dr < 0.4 ? 1.0 : 0.8) : 0.45);
  vec2 st = abs(np - vec2(15.0, 8.0));
  if ((st.x < 0.5 && st.y < 3.5) || (st.y < 0.5 && st.x < 3.5)) put(2.0, stutter > 0.5 ? (st.x + st.y < 1.5 ? 1.0 : 0.75) : 0.4);
  if (f.y > H - 7.0) put(0.0, f.y < H - 6.0 ? 0.3 : 0.0);
  float mull = abs(abs(f.x) - floor(W * 0.25));
  if (mull < 1.6) put(0.0, (abs(f.x) - floor(W * 0.25)) * sign(f.x) < -1.0 ? 0.3 : 0.0);
  vec2 gp = f - vec2(floor(-W * 0.3), BAR);
  float pulse = 0.88 + 0.12 * sin(t * 0.6);
  float gl = exp(-dot(gp - vec2(0.0, 11.0), gp - vec2(0.0, 11.0)) / 70.0) * 0.42 * pulse;
  if (gl > gTone && gl > 0.1 && gp.y >= 0.0) put(2.0, gl);
  if (gp.y >= 0.0 && gp.y < 15.0) {
    float hwid = gp.y - 6.0;
    if (gp.y < 1.0) { if (abs(gp.x) <= 3.0) put(0.0, 0.75); }
    else if (gp.y < 8.0) { if (gp.x == 0.0) put(0.0, 0.75); }
    else if (abs(gp.x) <= hwid) {
      if (abs(gp.x) > hwid - 1.0 || gp.y > 13.5) put(0.0, 0.85);
      else if (gp.y < 13.0) put(2.0, gp.y > 11.5 ? 1.0 : 0.72 * pulse);
    }
  }
  float bx0 = floor(min(W * 0.27, W * 0.5 - 58.0));
  for (int i = 0; i < 5; i++) {
    float k = float(i);
    float h1 = hash(vec2(k, 41.0));
    float h2 = hash(vec2(k, 43.0));
    vec2 bp = f - vec2(bx0 + k * 11.0 + floor(h1 * 3.0), BAR);
    float hw = 2.0 + floor(h2 * 2.0);
    float bh = 12.0 + floor(h1 * 11.0);
    float nh = 4.0 + floor(h2 * 5.0);
    bool body = bp.y >= 0.0 && bp.y < bh && abs(bp.x) <= hw;
    bool neck = bp.y >= bh && bp.y < bh + nh && abs(bp.x) <= 1.0;
    if (body || neck) {
      put(0.0, body ? 0.5 : 0.4);
      if (bp.x == (body ? -hw : -1.0)) put(mod(k, 2.0) < 1.0 ? 1.0 : 2.0, 0.8);
      else if (body && bp.y >= 3.0 && bp.y < 7.0 && bp.x < hw) put(4.0, 0.5);
      if (neck && bp.y >= bh + nh - 1.0) put(0.0, 0.8);
    }
  }
}
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 q = vec2(cell.x - floor(uRes.x * 0.5), cell.y);
  float t = uTime;
  float fx = q.x + floor(uPointer * 10.0 + 0.5);
  if (q.y >= BAR) {
    scene(q, t);
  } else if (q.y >= BAR - 1.0) {
    put(1.0, 0.8);
  } else if (q.y >= BAR - 8.0) {
    float depth = (BAR - 1.0 - q.y) / 7.0;
    scene(vec2(q.x, BAR + floor((BAR - 2.0 - q.y) * 3.5)), t);
    gTone = gTone * mix(0.7, 0.4, depth) * (mod(cell.y, 2.0) < 1.0 ? 1.0 : 0.6) + 0.06;
  } else {
    float seam = mod(fx, 22.0) < 1.0 ? 1.0 : 0.0;
    put(0.0, q.y >= BAR - 9.0 ? 0.0 : seam > 0.5 ? 0.3 : 0.14 + 0.05 * step(BAR - 12.0, q.y));
  }
  float tone = clamp(gTone, 0.0, 1.0);
  tone = floor(tone * 32.0 + 0.5) / 32.0;
  float scaled = tone * 4.0;
  float index = floor(scaled);
  index = min(index + step(bayer4(cell) + 0.5 / 16.0, scaled - index), 4.0);
  gl_FragColor = vec4(pal(gRamp, index), 1.0);
}
`;

export default {
  id: 'neon',
  label: { zh: '霓虹', en: 'Neon' },
  description: {
    zh: '雨夜街角的酒吧橱窗：霓虹招牌、闪烁的窗格、窗外的雨丝与台上的酒瓶。',
    en: 'A bar window on a rainy night: neon signage, blinking panes, rain streaks and bottles on the sill.'
  },
  defaults: { scene: 100, surface: 93, sides: 90, scrim: 60 },
  // The scene is night-only; `light` mirrors `dark` so the shell stays in the
  // same mood whichever color scheme the app is in.
  colors: {
    light: { uPaper: [11, 6, 20] },
    dark: { uPaper: [11, 6, 20] }
  },
  palette: {
    light: {
      paper: [11, 6, 20],
      surface: [20, 12, 34],
      surfaceDeep: [30, 18, 50],
      ink: [245, 238, 255],
      inkSoft: [176, 160, 205],
      inkFaint: [120, 106, 150],
      accent: [240, 64, 140],
      accentHover: [255, 120, 180]
    },
    dark: {
      paper: [11, 6, 20],
      surface: [20, 12, 34],
      surfaceDeep: [30, 18, 50],
      ink: [245, 238, 255],
      inkSoft: [176, 160, 205],
      inkFaint: [120, 106, 150],
      accent: [240, 64, 140],
      accentHover: [255, 120, 180]
    }
  },
  fragment: FRAGMENT
};
