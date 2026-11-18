/**
 * Deep — light shafts, a passing blue whale and jellyfish in deep water.
 *
 * Original scene. A complete standalone fragment shader: it carries its own
 * six-ramp palette and its own 8x8 Bayer dither, and ignores `uNight` (the scene
 * is night-only, so both color schemes share one palette).
 */

const FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPointer;
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
float bayer8(vec2 a) {
  return bayer2(a * 0.25) * 0.0625 + bayer2(a * 0.5) * 0.25 + bayer2(a);
}
vec3 pal(float r, float i) {
  if (i < 0.5) return vec3(0.0078, 0.0314, 0.0706);
  if (r < 0.5) return i < 1.5 ? vec3(0.0235, 0.0941, 0.2275) : i < 2.5 ? vec3(0.0471, 0.2039, 0.4392) : i < 3.5 ? vec3(0.1098, 0.3843, 0.6902) : vec3(0.4980, 0.7686, 0.9412);
  else if (r < 1.5) return i < 1.5 ? vec3(0.0196, 0.1647, 0.1882) : i < 2.5 ? vec3(0.0392, 0.3529, 0.3686) : i < 3.5 ? vec3(0.0941, 0.6902, 0.6275) : vec3(0.6039, 0.9608, 0.8784);
  else if (r < 2.5) return i < 1.5 ? vec3(0.1098, 0.0588, 0.2275) : i < 2.5 ? vec3(0.2902, 0.1255, 0.5647) : i < 3.5 ? vec3(0.6431, 0.3529, 0.8784) : vec3(0.9098, 0.7529, 1.0000);
  else if (r < 3.5) return i < 1.5 ? vec3(0.0431, 0.1098, 0.2000) : i < 2.5 ? vec3(0.1059, 0.2275, 0.3686) : i < 3.5 ? vec3(0.2275, 0.4000, 0.5647) : vec3(0.5608, 0.7059, 0.8157);
  else if (r < 4.5) return i < 1.5 ? vec3(0.0431, 0.1529, 0.2000) : i < 2.5 ? vec3(0.1216, 0.3216, 0.3882) : i < 3.5 ? vec3(0.3725, 0.6392, 0.6784) : vec3(0.8118, 0.9333, 0.9333);
  else if (r < 5.5) return i < 1.5 ? vec3(0.0980, 0.0941, 0.2275) : i < 2.5 ? vec3(0.2196, 0.2039, 0.4235) : i < 3.5 ? vec3(0.5098, 0.4745, 0.7294) : vec3(0.8627, 0.8392, 0.9529);
  return vec3(0.0);
}
void put(float ramp, float tone) {
  gRamp = ramp;
  gTone = tone;
}
float ground(float x) {
  float n = 0.5 + 0.5 * noise(vec2(x * 0.021, 9.0));
  float m = 0.5 + 0.5 * noise(vec2(x * 0.07, 4.0));
  return floor(7.0 + 15.0 * n + 5.0 * m * m + 10.0 * smoothstep(0.2, 0.5, abs(x) / uRes.x));
}
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  float W = uRes.x;
  float H = uRes.y;
  vec2 q = vec2(cell.x - floor(W * 0.5), cell.y);
  float t = uTime;
  float yy = q.y / H;
  float force = -1.0;
  float lightDepth = pow(smoothstep(0.12, 1.05, yy), 1.7);
  float rx = q.x + (H - q.y) * 0.34;
  float band = fbm(vec2(rx * 0.03 + t * 0.016, t * 0.022));
  float fine = 0.5 + 0.5 * noise(vec2(rx * 0.11 - t * 0.025, 7.0));
  float rays = smoothstep(0.46, 0.8, band) * (0.55 + 0.45 * fine) * smoothstep(0.18, 1.0, yy);
  float scatter = fbm(vec2(q.x * 0.028 + sin(t * 0.06) * 2.0, q.y * 0.042 - t * 0.018)) - 0.5;
  float water = 0.3 * lightDepth + rays * 0.2 + scatter * 0.09 * (0.3 + yy);
  put(0.0, water);
  vec2 a = q + vec2(floor(uPointer * 2.0 + 0.5), 0.0);
  float L = min(132.0, W * 0.46);
  float k = L / 132.0;
  // The distant whale takes twice as long to cross, with the same off-screen pause.
  const float WHALE_CROSSING = 187.2;
  const float WHALE_PAUSE = 26.4;
  float trip = mod(t - 16.0, WHALE_CROSSING + WHALE_PAUSE) / WHALE_CROSSING;
  float headX = mix(W * 0.5 + 10.0, -W * 0.5 - L * 1.15, trip);
  vec2 p = a - vec2(floor(headX), floor(H * 0.74 + sin(t * 0.13) * 5.0));
  float u = p.x / L;
  if (trip < 1.0 && u > -0.01 && u < 1.08 && abs(p.y) < 22.0) {
    float y = p.y - sin(u * 3.2 - t * 0.9) * 4.5 * u * u * k;
    float prof = pow(clamp(u / 0.11, 0.0, 1.0), 0.45);
    float top = 8.5 * k * prof * (1.0 - 0.9 * smoothstep(0.3, 0.95, u));
    float bot = 11.0 * k * prof * (1.0 - 0.93 * smoothstep(0.2, 0.9, u));
    bool body = u >= 0.0 && u <= 0.97 && y <= top && y >= -bot;
    bool dorsal = u > 0.72 && u < 0.79 && y > top - 1.0 && y <= top + 3.2 * k * min((u - 0.72) / 0.05, (0.79 - u) / 0.02);
    float fl = (u - 0.92) / 0.13;
    bool fluke = fl > 0.0 && u < 1.06 && abs(y) <= 8.5 * k * fl && !(u > 1.01 && abs(y) < (u - 1.01) / 0.05 * 5.0 * k);
    float s = (u - 0.27) * L;
    float flipY = -bot * 0.75 - s * (0.5 + 0.12 * sin(t * 0.7));
    bool flipper = s >= 0.0 && s < 17.0 * k && abs(y - flipY) < 0.9 + 2.2 * k * (1.0 - s / (17.0 * k));
    if (body || dorsal || fluke || flipper) {
      float v = clamp((y + bot) / max(top + bot, 1.0), 0.0, 1.0);
      float tone = mix(0.5, 0.31, smoothstep(0.22, 0.6, v));
      if (body && v < 0.4 && u < 0.56 && u > 0.03 && mod(floor(y + 64.0), 2.0) < 1.0) tone -= 0.08;
      if (body && y > top - 1.2) tone += 0.1;
      tone += rays * 0.22 * v;
      if (!body) tone = 0.3;
      if (body && abs(u - 0.115) < 0.006 && abs(y + 1.5 * k) < 0.8) tone = 0.06;
      if (body && u < 0.17 && abs(y + 2.5 * k + u * 9.0 * k) < 0.6) tone -= 0.1;
      put(3.0, mix(water * 0.6 + 0.08, tone, 0.86));
    }
  }
  vec2 fc = vec2(mod(t * 6.5 + 120.0, W + 260.0) - W * 0.5 - 130.0, H * 0.4 + sin(t * 0.17) * 9.0);
  for (int i = 0; i < 7; i++) {
    float n = float(i);
    vec2 fp = floor(fc + vec2(hash(vec2(n, 71.0)) * 30.0 - 15.0 + sin(t * 0.6 + n) * 1.5, hash(vec2(n, 73.0)) * 14.0 - 7.0 + sin(t * 0.8 + n * 2.0) * 1.2));
    vec2 d = q - fp;
    if (d.y == 0.0 && d.x <= 0.0 && d.x >= -2.0) put(0.0, d.x > -1.5 ? 0.62 : 0.4);
  }
  vec2 j = q + vec2(floor(uPointer * 5.0 + 0.5), 0.0);
  float veil = bayer8(cell + vec2(3.0, 5.0));
  for (int i = 0; i < 5; i++) {
    float n = float(i);
    float h1 = hash(vec2(n, 11.0));
    float h2 = hash(vec2(n, 13.0));
    float h3 = hash(vec2(n, 17.0));
    bool near = i < 2;
    float r = near ? 7.0 + floor(h1 * 3.0) : 3.5 + floor(h1 * 2.0);
    float dim = near ? 1.0 : 0.7;
    float cyc = t * (0.19 + 0.06 * h3) + h2 * 7.0;
    float ph = fract(cyc);
    float glide = floor(cyc) + ph - 0.72 * sin(6.2831853 * ph) / 6.2831853;
    float squeeze = pow(0.5 - 0.5 * cos(6.2831853 * (ph + 0.13)), 1.6);
    float span = H + 90.0;
    float sway = t * 0.045 + n * 1.7;
    float lean = cos(sway) * 0.24;
    vec2 pos = vec2((hash(vec2(n, 19.0)) - 0.5) * W * 0.86 + sin(sway) * 15.0,
                    mod(h2 * span + glide * (near ? 9.0 : 6.0), span) - 45.0);
    vec2 d = j - pos;
    if (abs(d.x) > 46.0 || abs(d.y) > 50.0) continue;
    d = vec2(d.x * cos(lean) + d.y * sin(lean), -d.x * sin(lean) + d.y * cos(lean));
    float jr = mod(n, 2.0) < 1.0 ? 4.0 : 5.0;
    float wr = r * (1.12 - 0.3 * squeeze);
    float hr = r * (0.7 + 0.24 * squeeze);
    float al = 0.0;
    float tn = 0.0;
    vec2 fd = d - vec2(0.0, -r * 0.5);
    float fog = exp(-dot(fd, fd) / (r * r * 2.6)) * 0.4 * dim * (0.8 + 0.2 * squeeze) - 0.04;
    if (fog > 0.0) { al = fog; tn = 0.32; }
    if (d.y < 0.0) {
      float len = r * 3.4 + 4.0;
      float fade = 1.0 + d.y / len;
      float lag = -d.y;
      if (fade > 0.0) {
        for (int m = 0; m < 6; m++) {
          float mm = float(m);
          if (!near && mod(mm, 2.0) > 0.5) continue;
          float tx = (mm / 5.0 - 0.5) * 1.7 * wr * (1.0 - 0.3 * squeeze)
            + sin(lag * 0.34 - t * 1.05 + mm * 1.9 + n) * (0.6 + lag * 0.07);
          if (abs(d.x - tx) < 0.62) { al = max(al, (0.12 + 0.46 * fade) * dim); tn = 0.5; }
        }
      }
      float fade2 = 1.0 + d.y / (len * 0.62);
      if (fade2 > 0.0) {
        for (int m = 0; m < 2; m++) {
          float sd = float(m) * 2.0 - 1.0;
          float ax = sd * wr * 0.2 + sin(lag * 0.27 - t * 0.85 + sd * 1.3 + n) * (0.5 + lag * 0.1);
          if (abs(d.x - ax) < 0.5 + 1.1 * fade2) { al = max(al, 0.66 * fade2 * dim); tn = 0.66; }
        }
      }
      if (d.y > -1.3 && abs(d.x) < wr * 0.94) { al = max(al, 0.5 * dim); tn = 0.6; }
    } else {
      float e = (d.x * d.x) / (wr * wr) + (d.y * d.y) / (hr * hr);
      if (e <= 1.0) {
        al = mix(0.4, 0.96, smoothstep(0.4, 1.0, e)) * dim;
        tn = mix(0.5, 0.86, smoothstep(0.5, 1.0, e));
        if (e > 0.78 && d.y > hr * 0.45) tn = 1.0;
        vec2 c = vec2(d.x / (wr * 0.46), (d.y - hr * 0.2) / (hr * 0.42));
        if (near && dot(c, c) < 1.0) { al = max(al, 0.78); tn = 0.74 + 0.2 * squeeze; }
      }
    }
    if (veil < al) put(jr, tn * (near ? 1.0 : 0.82));
  }
  vec2 f = q + vec2(floor(uPointer * 9.0 + 0.5), 0.0);
  float g = ground(f.x);
  if (f.y < g) {
    float edge = min(g, min(ground(f.x - 1.0), ground(f.x + 1.0))) - f.y;
    put(3.0, edge < 1.0 ? 0.52 : (edge < 6.0 && hash(f) < 0.08 ? 0.2 : 0.02));
  } else {
    for (int m = -1; m <= 1; m++) {
      float vx = floor(f.x / 6.0) + float(m);
      float hv = hash(vec2(vx, 23.0));
      float cx0 = vx * 6.0 + 3.0;
      if (hv < 0.4 && abs(cx0) > W * 0.27) {
        float h = f.y - ground(cx0);
        float len = 12.0 + hash(vec2(vx, 29.0)) * 0.22 * H;
        if (h >= 0.0 && h < len) {
          float cx = cx0 + floor(sin(t * 0.55 + vx * 1.3 + h * 0.11) * h * 0.07 + 0.5);
          float side = mod(h + vx, 8.0) < 4.0 ? 1.0 : -1.0;
          if (f.x == cx || (mod(h, 4.0) < 2.0 && f.x == cx + side)) put(1.0, 0.24 + 0.3 * h / len);
        }
      }
    }
    float cx1 = floor(f.x / 11.0) * 11.0 + 5.0;
    float hp = hash(vec2(cx1, 37.0));
    if (hp < 0.3) {
      vec2 d = f - vec2(cx1, ground(cx1));
      float glow = 0.75 + 0.25 * sin(t * (0.5 + hp * 2.0) + hp * 50.0);
      float pr = hp < 0.15 ? 1.0 : 2.0;
      if (d.y >= 0.0 && d.y < 3.0 && abs(d.x) + d.y < 2.5 - step(1.5, d.y)) put(pr, (d.y > 1.5 ? 1.0 : 0.72) * glow);
      else if (d.y >= 0.0 && dot(d, d) < 40.0) {
        float halo = exp(-dot(d, d) / 12.0) * 0.36 * glow;
        if (halo > 0.1 && halo > gTone) put(pr, halo);
      }
    }
  }
  for (int c = 0; c < 3; c++) {
    float cc = float(c);
    float bx0 = floor(W * (c == 0 ? -0.37 : c == 1 ? 0.13 : 0.4));
    float span = H * 1.05;
    for (int b = 0; b < 5; b++) {
      float bb = float(b);
      float hb = hash(vec2(bb, cc + 60.0));
      float by = mod(t * (8.0 + 6.0 * hb) + hb * span * 3.0 + bb * span / 5.0, span);
      float bx = bx0 + sin(by * 0.07 + bb * 2.0 + t * 0.4) * (2.0 + by * 0.025);
      vec2 d = f - floor(vec2(bx, by));
      if (by < ground(bx0) || abs(d.x) > 2.0 || abs(d.y) > 2.0) continue;
      if (hb < 0.55) {
        if (d.x == 0.0 && d.y == 0.0) put(0.0, 0.74);
      } else if (max(abs(d.x), abs(d.y)) == 1.0 && abs(d.x) + abs(d.y) == 1.0) {
        put(0.0, d.y > 0.5 || d.x < -0.5 ? 0.98 : 0.6);
      }
    }
  }
  float tone = clamp(gTone, 0.0, 1.0);
  tone = floor(tone * 64.0 + 0.5) / 64.0;
  float scaled = tone * 4.0;
  float index = floor(scaled);
  index = min(index + step(bayer8(cell) + 0.5 / 64.0, scaled - index), 4.0);
  float ramp = gRamp;
  vec2 mp = cell + vec2(floor(t * 0.9), floor(t * 1.7));
  vec2 block = floor(mp / 17.0);
  vec2 spot = floor(vec2(hash(block + vec2(1.3, 5.7)), hash(block + vec2(9.1, 2.9))) * 17.0);
  if (index < 1.5 && q.y > g + 2.0 && hash(block + vec2(17.0, 31.0)) < 0.22 && all(equal(mp - block * 17.0, spot))) {
    float s = hash(block + vec2(4.2, 8.4));
    if (sin(t * (0.3 + s) + s * 40.0) > -0.3) {
      ramp = 0.0;
      index = 2.0;
    }
  }
  gl_FragColor = vec4(pal(ramp, index), 1.0);
}
`;

export default {
  id: 'deep',
  label: { zh: '深海', en: 'The Deep' },
  description: {
    zh: '深海：光柱自水面落下，一头蓝鲸缓缓游过，水母在暗处漂浮，海草随水流摆动。',
    en: 'Deep water: light shafts from the surface, a blue whale drifting past, jellyfish in the dark, kelp swaying.'
  },
  defaults: { scene: 100, surface: 93, sides: 90, scrim: 60 },
  // Night-only scene; both schemes share one palette.
  colors: {
    light: { uPaper: [2, 8, 18] },
    dark: { uPaper: [2, 8, 18] }
  },
  palette: {
    light: {
      paper: [2, 8, 18],
      surface: [10, 20, 38],
      surfaceDeep: [16, 30, 52],
      ink: [222, 238, 250],
      inkSoft: [150, 175, 200],
      inkFaint: [104, 128, 155],
      accent: [30, 200, 190],
      accentHover: [70, 225, 210]
    },
    dark: {
      paper: [2, 8, 18],
      surface: [10, 20, 38],
      surfaceDeep: [16, 30, 52],
      ink: [222, 238, 250],
      inkSoft: [150, 175, 200],
      inkFaint: [104, 128, 155],
      accent: [30, 200, 190],
      accentHover: [70, 225, 210]
    }
  },
  fragment: FRAGMENT
};
