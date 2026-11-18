/**
 * Well — lamplit ruins at the bottom of a well.
 *
 * Original scene. A complete standalone fragment shader: five colour ramps plus
 * its own 8x8 Bayer dither, so it carries its own palette and ignores `uNight`
 * (night-only, both schemes share one palette).
 */

const FRAGMENT = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPointer;
const float WATER = 24.0;
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
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 1.7);
    amp *= 0.5;
  }
  return clamp(0.5 + 0.5 * sum / 0.9375, 0.0, 1.0);
}
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer8(vec2 a) {
  return bayer2(a * 0.25) * 0.0625 + bayer2(a * 0.5) * 0.25 + bayer2(a);
}
vec3 pal(float r, float i) {
  if (i < 0.5) return vec3(0.0196, 0.0235, 0.0588);
  if (r < 0.5) return i < 1.5 ? vec3(0.0667, 0.1020, 0.3059) : i < 2.5 ? vec3(0.1294, 0.2196, 0.6431) : i < 3.5 ? vec3(0.2667, 0.4392, 0.9020) : vec3(0.7059, 0.8235, 1.0000);
  else if (r < 1.5) return i < 1.5 ? vec3(0.0235, 0.1412, 0.1725) : i < 2.5 ? vec3(0.0431, 0.3529, 0.3686) : i < 3.5 ? vec3(0.1216, 0.7176, 0.6353) : vec3(0.6039, 0.9608, 0.8392);
  else if (r < 2.5) return i < 1.5 ? vec3(0.0784, 0.0431, 0.1922) : i < 2.5 ? vec3(0.1686, 0.0980, 0.3922) : i < 3.5 ? vec3(0.3569, 0.2118, 0.6980) : vec3(0.6667, 0.5569, 0.9490);
  else if (r < 3.5) return i < 1.5 ? vec3(0.2196, 0.1373, 0.0392) : i < 2.5 ? vec3(0.5490, 0.3569, 0.0706) : i < 3.5 ? vec3(0.9529, 0.7804, 0.2510) : vec3(1.0000, 0.9647, 0.7608);
  else if (r < 4.5) return i < 1.5 ? vec3(0.1647, 0.0392, 0.1608) : i < 2.5 ? vec3(0.4784, 0.1059, 0.4039) : i < 3.5 ? vec3(0.9412, 0.3608, 0.7098) : vec3(1.0000, 0.7686, 0.9098);
  return vec3(0.0);
}
float poolHalf() {
  return min(72.0, uRes.x * 0.22);
}
float ceilBottom(float tx) {
  float x = tx * 8.0 + 4.0;
  if (abs(x) < 14.0) return uRes.y + 1.0;
  float n = 0.5 + 0.5 * noise(vec2(tx * 0.23 + 4.0, 2.5));
  return uRes.y - 8.0 * (1.0 + floor(2.6 * n + 2.0 * smoothstep(0.22, 0.5, abs(x) / uRes.x)));
}
float groundTop(float tx) {
  float x = abs(tx * 8.0 + 4.0);
  float pool = poolHalf();
  if (x < pool) return 0.0;
  return WATER - 2.0 + 8.0 * (1.0 + floor(min(2.0, (x - pool) / 64.0) + 0.8 * hash(vec2(floor(tx / 3.0), 5.0))));
}
vec3 lamp(int i, float t) {
  float k = float(i);
  float fx = i == 0 ? -0.31 : i == 1 ? 0.21 : 0.39;
  float fy = i == 0 ? 0.60 : i == 1 ? 0.47 : 0.70;
  float x0 = floor(uRes.x * fx);
  float swing = sin(t * (0.55 + 0.13 * k) + k * 2.1) * 2.2;
  return vec3(x0 + floor(swing + 0.5), floor(uRes.y * fy), x0);
}
float lightAt(vec2 q, float t) {
  float L = 0.0;
  float reach = clamp(uRes.x / 260.0, 0.45, 1.0);
  for (int i = 0; i < 3; i++) {
    vec3 lp = lamp(i, t);
    vec2 d = q - lp.xy;
    float flick = 0.86 + 0.14 * noise(vec2(t * 2.3, float(i) * 7.0));
    L += flick * (exp(-dot(d, d) / (2600.0 * reach * reach)) + 0.5 * exp(-dot(d, d) / 90.0));
  }
  float w = 9.0 + (uRes.y - q.y) * 0.06;
  float shaft = smoothstep(w, w * 0.25, abs(q.x)) * (0.2 + 0.8 * q.y / uRes.y);
  shaft *= 0.72 + 0.28 * noise(vec2(q.x * 0.16 + q.y * 0.02, t * 0.18));
  return L + shaft;
}
void scene(vec2 q, float t) {
  q = floor(q);
  float H = uRes.y;
  vec2 f = q + vec2(floor(uPointer * 9.0 + 0.5), 0.0);
  float L = lightAt(f, t);
  vec2 b = q + vec2(floor(uPointer * 2.0 + 0.5), 0.0);
  float row = floor(b.y / 8.0);
  float bx = b.x + mod(row, 2.0) * 8.0;
  float line = (mod(b.y, 8.0) < 1.0 || mod(bx, 16.0) < 1.0) ? 1.0 : 0.0;
  float patch = step(0.56, fbm(vec2(floor(bx / 16.0) * 16.0, row * 8.0) / 64.0 + 3.0));
  gRamp = 0.0;
  gTone = patch * (0.05 + 0.2 * line) * (0.1 + L * 1.5) + max(L - 0.2, 0.0) * 0.2;
  vec2 e = b - vec2(floor(-uRes.x * 0.17), floor(H * 0.34));
  float age = mod(t, 19.0);
  if (age < 6.5 && abs(e.y) < 1.0 && abs(abs(e.x) - 2.0) < 0.5 && abs(age - 3.4) > 0.12 && L < 0.3) {
    gRamp = 3.0;
    gTone = 0.75 * smoothstep(0.0, 0.5, age) * smoothstep(6.5, 6.0, age);
  }
  vec2 m = q + vec2(floor(uPointer * 5.0 + 0.5), 0.0);
  float ci = floor(m.x / 58.0);
  float hc = hash(vec2(ci, 7.0));
  float cx = floor((ci + 0.5) * 58.0 + (hc - 0.5) * 16.0);
  if (abs(cx) > 34.0) {
    float br = hash(vec2(ci, 2.0));
    float top = br < 0.4 ? WATER + 28.0 + br * 2.5 * H * 0.6 - floor(hash(vec2(m.x, ci)) * 4.0) : 1.0e4;
    float hw = 4.0 + floor(hash(vec2(ci, 5.0)) * 2.0);
    float w = hw + (m.y < WATER + 14.0 ? 2.0 : 0.0) + (mod(m.y - 40.0 * hc, 56.0) < 3.0 ? 1.0 : 0.0);
    float dx = m.x - cx;
    if (abs(dx) <= w && m.y < top) {
      float a = dx < -w + 1.5 ? 0.9 : dx > w - 1.5 ? 0.25 : mod(dx + w, 3.0) < 1.0 ? 0.62 : 0.45;
      gRamp = 0.0;
      gTone = a * (0.62 + L * 0.7);
    }
  }
  float md = fbm(vec2(q.x * 0.016 - t * 0.035, q.y * 0.03 + t * 0.012));
  float mt = smoothstep(0.5, 0.86, md) * smoothstep(1.0, 0.1, (q.y - WATER) / 72.0) * 0.62 * (0.7 + L);
  if (mt > gTone) {
    gRamp = 2.0;
    gTone = mt;
  }
  for (int i = 0; i < 3; i++) {
    vec3 lp = lamp(i, t);
    vec2 d = f - lp.xy;
    float chainX = floor(mix(lp.x, lp.z, clamp(d.y / (H - lp.y), 0.0, 1.0)) + 0.5);
    if (d.y > 3.0 && f.x == chainX && mod(f.y, 2.0) < 1.0) {
      gRamp = 0.0;
      gTone = 0.72;
    }
    if (abs(d.x) <= 2.0 && abs(d.y) <= 3.0 && !(abs(d.x) > 1.5 && abs(d.y) > 2.5)) {
      bool core = abs(d.x) < 1.5 && abs(d.y) < 2.5;
      gRamp = core ? 3.0 : 0.0;
      gTone = core ? (d.y < 0.5 ? 1.0 : 0.72) : 0.95;
    }
  }
  float tx = floor(f.x / 8.0);
  float cb = ceilBottom(tx);
  if (f.y >= cb) {
    float edge = (mod(f.x, 8.0) < 1.0 || mod(H - f.y, 8.0) < 1.0) ? 1.0 : 0.0;
    float a = f.y < cb + 1.0 ? 0.7 : edge > 0.5 ? 0.3 : 0.09;
    gRamp = 0.0;
    gTone = a * (0.75 + L * 1.1);
  } else {
    for (int k = -1; k <= 1; k++) {
      float vx = tx + float(k);
      float hv = hash(vec2(vx, 13.0));
      if (hv < 0.26) {
        float depth = ceilBottom(vx) - f.y;
        float len = 6.0 + hash(vec2(vx, 17.0)) * 0.24 * H;
        if (depth > 0.0 && depth <= len) {
          float px = vx * 8.0 + 3.0 + floor(sin(t * 0.9 + vx * 1.7 + depth * 0.12) * depth * 0.045 + 0.5);
          float side = mod(depth, 10.0) < 5.0 ? 1.0 : -1.0;
          if (f.x == px || (mod(depth, 5.0) < 1.0 && f.x == px + side)) {
            gRamp = 1.0;
            gTone = (0.42 + 0.35 * depth / len) * (0.8 + L);
          }
          if (hv < 0.1 && depth > len - 2.0 && abs(f.x - px) <= 1.0) {
            gRamp = 4.0;
            gTone = 0.8;
          }
        }
      }
    }
  }
  float gt = groundTop(tx);
  if (f.y < gt) {
    float edge = (mod(f.x, 8.0) < 1.0 || mod(gt - f.y, 8.0) < 1.0) ? 1.0 : 0.0;
    float a = f.y > gt - 2.0 ? 0.72 : edge > 0.5 ? 0.3 : 0.09;
    gRamp = 0.0;
    gTone = a * (0.75 + L * 1.1);
  } else if (gt > 0.0) {
    float k = f.y - gt;
    float sx = f.x - floor(sin(t * 1.1 + tx * 0.9) * k * 0.22 + 0.5);
    float tx2 = floor(sx / 8.0);
    float lx = mod(sx, 8.0);
    if (groundTop(tx2) == gt && hash(vec2(tx2, 31.0)) < 0.62 && mod(lx, 2.0) < 1.0) {
      float h = floor(hash(vec2(tx2 * 8.0 + lx, 3.0)) * 10.0) - 2.0;
      if (k < h) {
        gRamp = 1.0;
        gTone = (0.4 + 0.5 * k / h) * (0.8 + L);
      }
    }
  }
}
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 q = vec2(cell.x - floor(uRes.x * 0.5), cell.y);
  float t = uTime;
  float H = uRes.y;
  float shift = floor(uPointer * 9.0 + 0.5);
  float pool = poolHalf();
  bool water = q.y < WATER && q.y >= groundTop(floor((q.x + shift) / 8.0));
  if (water) {
    float depth = (WATER - q.y) / WATER;
    float rip = (sin(q.y * 1.3 + t * 1.6) * 1.2 + noise(vec2(q.y * 0.9, t * 0.5)) * 2.6) * depth;
    scene(vec2(q.x + floor(rip + 0.5), WATER + floor((WATER - 1.0 - q.y) * 2.6)), t);
    gTone *= mix(0.95, 0.4, depth) * (mod(cell.y, 2.0) < 1.0 ? 1.0 : 0.55);
    float glint = noise(vec2(q.x * 0.22 - t * 0.3, q.y * 1.7 + t * 0.22));
    float lit = lightAt(vec2(q.x + shift, WATER + 26.0), t);
    if (glint > (q.y > WATER - 2.0 ? -0.1 : 0.62 - 0.55 * min(lit, 1.0) * (1.0 - depth))) {
      gRamp = 0.0;
      gTone = max(gTone, q.y > WATER - 2.0 ? 0.5 : 0.3);
    }
  } else {
    scene(q, t);
  }
  for (int i = 0; i < 2; i++) {
    float k = float(i);
    float period = 7.0 + k * 4.3;
    float n = floor((t + k * 3.1) / period);
    float age = t + k * 3.1 - n * period;
    float dx = floor((hash(vec2(n, k + 1.0)) - 0.5) * 1.5 * pool);
    if (abs(dx) < 16.0) dx += 26.0;
    float top = ceilBottom(floor((dx + shift) / 8.0));
    top = min(top, H);
    float fall = sqrt((top - WATER) / 90.0);
    float y = top - 90.0 * age * age;
    if (age < fall && q.x == dx && q.y <= y && q.y > y - 2.0) {
      gRamp = 0.0;
      gTone = 0.9;
    }
    float ring = age - fall;
    if (water && ring > 0.0 && ring < 2.2) {
      float r = ring * 15.0 * (1.0 - 0.25 * (WATER - 1.0 - q.y));
      if (q.y > WATER - 4.0 && abs(abs(q.x - dx) - r) < 0.8) {
        gRamp = 0.0;
        gTone = max(gTone, 0.75 * (1.0 - ring / 2.2));
      }
    }
  }
  float tone = clamp(gTone, 0.0, 1.0);
  tone = floor(tone * 64.0 + 0.5) / 64.0;
  float scaled = tone * 4.0;
  float index = floor(scaled);
  index = min(index + step(bayer8(cell) + 0.5 / 64.0, scaled - index), 4.0);
  float ramp = gRamp;
  vec2 mp = cell + vec2(0.0, floor(t * 2.2));
  vec2 block = floor(mp / 13.0);
  vec2 spot = floor(vec2(hash(block + vec2(1.3, 5.7)), hash(block + vec2(9.1, 2.9))) * 13.0);
  float w = 8.0 + (H - q.y) * 0.07;
  if (!water && abs(q.x) < w && q.y > WATER + 6.0 && index < 2.5 && hash(block + vec2(17.0, 31.0)) < 0.3 && all(equal(mp - block * 13.0, spot))) {
    float s = hash(block + vec2(4.2, 8.4));
    if (sin(t * (0.5 + s) + s * 40.0) > -0.2) {
      ramp = 0.0;
      index = 3.0;
    }
  }
  for (int i = 0; i < 11; i++) {
    float k = float(i);
    float h1 = hash(vec2(k, 1.0));
    float h2 = hash(vec2(k, 2.0));
    float h3 = hash(vec2(k, 3.0));
    vec2 home = vec2((h1 - 0.5) * uRes.x * 0.92, WATER + 10.0 + h2 * H * 0.5);
    vec2 pos = floor(home + vec2(
      sin(t * (0.13 + 0.1 * h3) + h3 * 6.0) * 22.0 + sin(t * 0.31 + k) * 6.0,
      cos(t * (0.11 + 0.1 * h1) + h2 * 9.0) * 12.0));
    float glow = sin(t * (0.7 + h3) + h3 * 20.0);
    vec2 d = abs(q - pos);
    if (glow > -0.15 && d.x + d.y < 0.5) {
      ramp = 3.0;
      index = glow > 0.6 ? 4.0 : 3.0;
    } else if (glow > 0.6 && d.x + d.y < 1.5 && index < 2.5) {
      ramp = 3.0;
      index = 2.0;
    }
  }
  gl_FragColor = vec4(pal(ramp, index), 1.0);
}
`;

export default {
  id: 'well',
  label: { zh: '深井', en: 'The Well' },
  description: {
    zh: '井底的灯下遗迹：吊灯的光晕、垂下的藤蔓、水面倒影与滴落的水珠。',
    en: 'A lamplit ruin at the bottom of a well: hanging lamps, drooping vines, a mirrored pool and falling drops.'
  },
  defaults: { scene: 100, surface: 93, sides: 90, scrim: 60 },
  // Night-only scene; both schemes share one palette.
  colors: {
    light: { uPaper: [5, 6, 15] },
    dark: { uPaper: [5, 6, 15] }
  },
  palette: {
    light: {
      paper: [5, 6, 15],
      surface: [14, 16, 32],
      surfaceDeep: [22, 25, 48],
      ink: [232, 236, 255],
      inkSoft: [160, 168, 200],
      inkFaint: [110, 118, 150],
      accent: [243, 199, 64],
      accentHover: [255, 219, 110]
    },
    dark: {
      paper: [5, 6, 15],
      surface: [14, 16, 32],
      surfaceDeep: [22, 25, 48],
      ink: [232, 236, 255],
      inkSoft: [160, 168, 200],
      inkFaint: [110, 118, 150],
      accent: [243, 199, 64],
      accentHover: [255, 219, 110]
    }
  },
  fragment: FRAGMENT
};
