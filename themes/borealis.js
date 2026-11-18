/**
 * Borealis — a live dithered landscape.
 *
 * Ported from hermes-borealis by Adolanium (MIT): an aurora over three ridges and
 * a lake by night, a two-ink riso dawn by day, drawn in one WebGL fragment shader
 * at 8x8 Bayer ordered dithering.
 *
 * ── Theme contract ──────────────────────────────────────────────────────────
 * Plain data only (no imports, no functions); `scripts/build.mjs` validates it
 * and embeds it in the bundle.
 *
 *   id          unique kebab-case id, also the storage key
 *   label       display name per locale (`zh`, `en` required)
 *   description one sentence per locale, shown under the picker
 *   defaults    initial values for the shared readability knobs (optional;
 *               missing knobs fall back to the engine defaults)
 *   colors      shader uniforms per scheme. `uPaper` is required: the engine
 *               paints it as the canvas fallback and mixes it into the readable
 *               veil/scrim. The engine supplies `uRes`, `uTime`, `uPointer` and
 *               `uNight` (1 in dark mode, 0 in light) itself.
 *   palette     UI colours per scheme, as `[r, g, b]`:
 *                 paper        window ground / side columns
 *                 surface      cards, menus, composer
 *                 surfaceDeep  nested surfaces, code blocks
 *                 ink          primary text
 *                 inkSoft      secondary text
 *                 inkFaint     tertiary text
 *                 accent       brand colour (mint by night, teal on paper)
 *                 accentHover  accent, one step brighter/darker
 *   fragment    the GLSL fragment shader (string)
 */

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPointer;
uniform float uNight;
uniform vec3 uPaper;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec3 uInk;
uniform vec3 uHot;

const float HORIZON = 0.12;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Gradient noise in about [-1, 1], quintic fade.
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

// Four octaves, remapped to [0, 1].
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

// Ordered-dither threshold in [0, 1), from the recursive 2x2 Bayer step.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float bayer8(vec2 a) {
  return bayer2(a * 0.25) * 0.0625 + bayer2(a * 0.5) * 0.25 + bayer2(a);
}

// Tall curtains whose rays follow a folded coordinate, so they bunch up and
// brighten where the curtain turns.
float aurora(vec2 p, float t) {
  float x = p.x + t * 0.3 * 0.03;
  float light = 0.0;
  for (int i = 0; i < 2; i++) {
    float k = float(i);
    float edge = 0.2 + k * 0.1 + 1.2 * 0.06 * noise(vec2(x * 0.7 + k * 3.7, t * 0.04 + k * 1.3));
    float d = p.y - edge;
    float w = x + 0.24 * noise(vec2(x * 1.4 + k * 5.0, t * 0.05 + k * 2.0));
    float w2 = x + 0.01 + 0.24 * noise(vec2((x + 0.01) * 1.4 + k * 5.0, t * 0.05 + k * 2.0));
    float fold = clamp(0.01 / max(abs(w2 - w), 0.0025), 0.0, 4.0);
    float reach = mix(0.3, 1.7, fbm(vec2(w * 2.2 + k * 9.0, t * 0.03 + k)));
    float rays = mix(0.06, 1.0, smoothstep(0.36, 0.68, fbm(vec2(w * 13.0 + k * 7.0, t * 0.05 + k))));
    float body = d > 0.0 ? exp(-d * 6.4 / reach) : exp(d * 45.0);
    float rim = exp(-abs(d) * 38.0) * 0.8;
    light += (body * rays * (0.65 + 0.35 * fold) + rim * (0.35 + 0.65 * rays)) * (1.0 - k * 0.3);
  }
  float tone = (1.0 - exp(-light * 1.15)) * 0.86;
  // by day the curtains thin out to bands of dawn colour
  return tone * mix(0.5, 1.0, uNight) * smoothstep(0.66, 0.297, p.y);
}

// A ridge line in [0, 1]: two octaves of sharp crests and a little grit.
float ridge(float x, float seed) {
  float a = 1.0 - abs(noise(vec2(x, seed)));
  float b = 1.0 - abs(noise(vec2(x * 2.3 + 7.0, seed + 3.0)));
  return a * a * 0.64 + b * b * 0.3 + 0.05 * noise(vec2(x * 7.0, seed + 9.0));
}

// One mountain layer. By night a ridge is a silhouette with mist at its foot;
// by day a flat ink that pales towards the shore.
void mountain(inout float tone, inout float ground, vec2 p, float depth, float amp, float freq, float seed, vec2 day, vec2 night) {
  float x = p.x + uPointer * 0.014 * (0.4 + 2.0 * depth);
  float top = HORIZON + amp * ridge(x * freq + seed, seed);
  if (p.y < top) {
    vec2 ink = mix(day, night, uNight);
    tone = ink.x + ink.y * smoothstep(top, HORIZON, p.y);
    ground = 1.0;
  }
}

// A shooting star now and then: a one-cell line whose tail thins into dots.
float meteor(vec2 p, float t, float aspect) {
  float cycle = floor(t / 13.0);
  float age = t - cycle * 13.0;
  if (age > 1.1) {
    return 0.0;
  }
  vec2 dir = normalize(vec2(-1.0, -0.42));
  vec2 head = vec2((hash(vec2(cycle, 3.7)) * 0.55 - 0.1) * aspect, 0.72 + 0.22 * hash(vec2(cycle, 9.2))) + dir * age * 0.55;
  vec2 rel = p - head;
  float along = dot(rel, -dir);
  float across = abs(dot(rel, vec2(-dir.y, dir.x)));
  float tail = 0.16 * min(age * 3.0, 1.0);
  if (along < 0.0 || along > tail || across > 0.75 / uRes.y) {
    return 0.0;
  }
  return (1.0 - along / tail) * smoothstep(1.1, 0.7, age);
}

// Everything above the water. ground is 1 on a mountain, 0 in the sky.
float scene(vec2 uv, float t, out float ground) {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  ground = 0.0;
  float tone = aurora(p, t);

  // day: a low sun with a soft halo
  float sun = length(p - vec2(0.2 * aspect, HORIZON + 0.16));
  tone = max(tone, (1.0 - uNight) * (sun < 0.09 ? 0.38 : 0.24 * exp(-(sun - 0.09) * 9.0)));

  // night: a thin crescent, high on the right, and shooting stars
  vec2 moon = p - vec2(0.36 * aspect, 0.8);
  if (length(moon) < 0.032 && length(moon - vec2(0.014, 0.007)) > 0.03) {
    tone = max(tone, uNight);
  }
  tone = max(tone, uNight * meteor(p, t, aspect));

  mountain(tone, ground, p, 0.0, 0.19, 1.7, 11.0, vec2(0.25, -0.1), vec2(0.13, 0.15));
  mountain(tone, ground, p, 0.5, 0.125, 2.6, 23.0, vec2(0.5, -0.1), vec2(0.05, 0.14));
  mountain(tone, ground, p, 1.0, 0.07, 3.9, 37.0, vec2(0.75, 0.0), vec2(0.0, 0.07));
  return tone;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) / uRes;
  float ground;
  float tone;

  if (uv.y < HORIZON) {
    // The lake: the scene upside down and squashed, pushed sideways by ripples
    // that grow towards the near shore, on every other row so it reads as water.
    float depth = (HORIZON - uv.y) / HORIZON;
    float ripple = sin(cell.y * 0.9 + uTime * 1.3) * 0.0016 + noise(vec2(uv.y * 70.0, uTime * 0.35)) * 0.006;
    tone = scene(vec2(uv.x + ripple * (0.3 + depth), HORIZON + (HORIZON - uv.y) * 1.7), uTime, ground);
    tone *= mix(0.95, 0.5, depth) * (mod(cell.y, 2.0) < 1.0 ? 1.0 : 0.5);
    ground = 1.0;
  } else {
    tone = scene(uv, uTime, ground);
  }

  tone = clamp(tone, 0.0, 1.0);
  tone = floor(tone * 64.0 + 0.5) / 64.0;
  float threshold = bayer8(cell) + 0.5 / 64.0;
  float scaled = tone * 4.0;
  float index = floor(scaled);
  index = min(index + step(threshold, scaled - index), 4.0);

  // A sparse sky of single-cell stars that twinkle in the empty paper.
  vec2 block = floor(cell / 20.0);
  float h = hash(block + vec2(17.0, 31.0));
  vec2 spot = floor(vec2(hash(block + vec2(1.3, 5.7)), hash(block + vec2(9.1, 2.9))) * 20.0);
  if (uNight > 0.5 && ground < 0.5 && index < 0.5 && h < 0.24 && all(equal(cell - block * 20.0, spot))) {
    float s = hash(block + vec2(4.2, 8.4));
    if (sin(uTime * (0.4 + s * 1.4) + s * 40.0) > -0.35) {
      index = 3.0;
    }
  }

  vec3 color = index < 0.5 ? uPaper : index < 1.5 ? uTint1 : index < 2.5 ? uTint2 : index < 3.5 ? uInk : uHot;
  gl_FragColor = vec4(color, 1.0);
}
`;

export default {
  id: 'borealis',
  label: { zh: '极光', en: 'Borealis' },
  description: {
    zh: '夜幕下的极光、群山与湖泊倒影；白昼下双色孔版印刷的晨曦。',
    en: 'An aurora over mountains and a lake by night; a two-ink riso dawn by day.'
  },
  defaults: { scene: 100, surface: 93, sides: 90, scrim: 60 },
  colors: {
    light: {
      // cream paper, faint pink, hot riso pink, teal ridge ink, solid letters
      uPaper: [242, 238, 228],
      uTint1: [238, 195, 215],
      uTint2: [232, 80, 154],
      uInk: [10, 123, 108],
      uHot: [23, 21, 31]
    },
    dark: {
      // near-black indigo, violet mist, blue-green body, mint edge, moon white
      uPaper: [8, 8, 13],
      uTint1: [68, 50, 110],
      uTint2: [52, 115, 112],
      uInk: [111, 240, 196],
      uHot: [236, 251, 243]
    }
  },
  palette: {
    light: {
      paper: [242, 238, 228],
      surface: [250, 247, 240],
      surfaceDeep: [231, 225, 211],
      ink: [23, 21, 31],
      inkSoft: [93, 88, 82],
      inkFaint: [138, 131, 122],
      accent: [10, 123, 108],
      accentHover: [8, 100, 86]
    },
    dark: {
      paper: [8, 8, 13],
      surface: [23, 22, 33],
      surfaceDeep: [38, 36, 52],
      ink: [236, 235, 245],
      inkSoft: [155, 152, 174],
      inkFaint: [111, 108, 133],
      accent: [111, 240, 196],
      accentHover: [142, 244, 207]
    }
  },
  fragment: FRAGMENT
};
