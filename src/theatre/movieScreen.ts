import * as THREE from 'three';
import { SCREEN_GEOMETRY, smoothstep01 } from './math';
import { makeImaxLogoTexture } from './textures';

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uA;
uniform float uB;
uniform float uTA;
uniform float uTB;
uniform float uMix;
uniform vec2 uRes;
uniform sampler2D uLogo;
uniform float uLogoA;

#define PI 3.14159265

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}
vec3 starField(vec2 p, float scale, float thr, float t) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id);
  if (h < thr) return vec3(0.0);
  vec2 o = vec2(hash12(id + 17.1), hash12(id + 31.7)) - 0.5;
  float d = length(f - o * 0.6);
  float tw = 0.65 + 0.35 * sin(t * (1.5 + h * 3.0) + h * 60.0);
  float s = smoothstep(0.14, 0.0, d) * tw * (0.35 + 0.65 * (h - thr) / (1.0 - thr)) * 1.7;
  vec3 c = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash12(id + 5.3));
  return c * s;
}

/* ---------------- Scene 0 : Earthrise ---------------- */
vec3 sceneSpace(vec2 p, float t) {
  vec2 q = p + vec2(t * 0.006, t * 0.002);
  vec3 col = vec3(0.004, 0.006, 0.022);
  float n1 = fbm(q * 1.8 + vec2(0.0, t * 0.01));
  float n2 = fbm(q * 3.2 + n1 * 1.5 - vec2(t * 0.012, 0.0));
  col += vec3(0.32, 0.07, 0.45) * pow(n2, 3.0) * 1.7;
  col += vec3(0.03, 0.18, 0.45) * pow(n1, 2.2) * 0.9;
  col += starField(q, 70.0, 0.86, t) + starField(q + 3.7, 120.0, 0.9, t) * 0.7;

  vec2 c = vec2(-0.55, -1.76 + t * 0.0012);
  float R = 1.55;
  vec2 rel = p - c;
  float d = length(rel);
  vec2 sunDir = normalize(vec2(0.45, 1.0));
  float rise = smoothstep(0.0, 9.0, t);
  vec2 sunPos = c + sunDir * (R + 0.012 + 0.045 * rise);
  vec3 L = normalize(vec3(sunDir, 0.35));
  if (d < R) {
    vec2 s2 = rel / R;
    float z = sqrt(max(1.0 - dot(s2, s2), 0.0));
    vec3 nrm = vec3(s2, z);
    vec2 sph = vec2(atan(nrm.x, nrm.z) + t * 0.015, asin(clamp(nrm.y, -1.0, 1.0)));
    float land = smoothstep(0.5, 0.56, fbm(sph * vec2(3.0, 4.0) + 2.0));
    vec3 surf = mix(vec3(0.01, 0.06, 0.18), vec3(0.09, 0.11, 0.05), land);
    float cl = smoothstep(0.52, 0.8, fbm(sph * vec2(5.0, 9.0) + vec2(t * 0.02, 0.0)));
    surf = mix(surf, vec3(0.78, 0.82, 0.88), cl * 0.7);
    float diff = max(dot(nrm, L), 0.0);
    vec3 lit = surf * (diff * 1.6 + 0.02);
    float night = smoothstep(0.15, -0.1, dot(nrm, L));
    float city = smoothstep(0.62, 0.9, noise(sph * 60.0)) * land * night;
    lit += vec3(1.0, 0.62, 0.25) * city * 1.3;
    float fres = pow(1.0 - z, 2.5);
    lit += vec3(0.15, 0.45, 1.0) * fres * (0.25 + 1.3 * diff);
    col = lit;
  }
  float outside = max(d - R, 0.0);
  float sunSide = max(dot(normalize(rel), sunDir), 0.0);
  col += vec3(0.25, 0.55, 1.0) * exp(-outside * 26.0) * step(R, d) * (0.25 + 0.95 * pow(sunSide, 3.0));
  vec2 sr = p - sunPos;
  float sd = length(sr);
  col += vec3(1.0, 0.9, 0.75) * 0.0026 / (sd * sd + 0.0012) * rise;
  col += vec3(1.0, 0.55, 0.25) * exp(-sd * 6.0) * 0.5 * rise;
  col += vec3(1.0, 0.72, 0.45) * exp(-abs(sr.y) * 90.0) * exp(-abs(sr.x) * 1.6) * 0.8 * rise;
  return col;
}

/* ---------------- Scene 1 : Aurora ---------------- */
vec3 sceneAurora(vec2 p, float t) {
  vec3 col = mix(vec3(0.006, 0.025, 0.06), vec3(0.0, 0.004, 0.016), smoothstep(-0.2, 0.5, p.y));
  col += starField(p + vec2(t * 0.003, 0.0), 80.0, 0.88, t) * smoothstep(-0.15, 0.3, p.y);
  vec3 aur = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x * (0.9 + fi * 0.35) + fi * 2.3;
    float w = 0.12 * sin(x * 1.7 + t * 0.25 + fi) + 0.06 * sin(x * 4.1 - t * 0.4)
            + 0.14 * (fbm(vec2(x * 1.2, t * 0.06 + fi)) - 0.5);
    float base = -0.02 + fi * 0.09 + w;
    float dy = p.y - base;
    float curtain = smoothstep(-0.01, 0.015, dy) * exp(-max(dy, 0.0) * (5.0 - fi));
    float rays = 0.45 + 0.55 * noise(vec2(x * 28.0 + t * 0.6, fi * 7.0));
    rays *= 0.6 + 0.4 * noise(vec2(x * 7.0 - t * 0.3, 3.0 + fi));
    vec3 c1 = mix(vec3(0.1, 1.0, 0.45), vec3(0.05, 0.75, 0.9), fi * 0.4);
    vec3 c2 = vec3(0.65, 0.2, 0.95);
    aur += mix(c1, c2, smoothstep(0.03, 0.3, dy)) * curtain * rays * (0.6 - fi * 0.1);
  }
  col += aur;
  float m1 = -0.2 + 0.13 * fbm(vec2(p.x * 1.6 + 4.0, 0.5)) - 0.04 * cos(p.x * 2.0);
  float m2 = -0.3 + 0.09 * fbm(vec2(p.x * 3.2 + 11.0, 2.5));
  if (p.y < m1) col = vec3(0.012, 0.03, 0.04) + aur * 0.14 * smoothstep(m1 - 0.07, m1, p.y);
  if (p.y < m2) col = vec3(0.003, 0.008, 0.012) + vec3(0.0, 0.05, 0.04) * smoothstep(m2 - 0.01, m2, p.y);
  return col;
}

/* ---------------- Scene 2 : Hyperspace ---------------- */
vec3 sceneWarp(vec2 p, float t) {
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = vec3(0.0);
  float sp = t * 0.9;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float N = 70.0 + fi * 45.0;
    float sa = a / (2.0 * PI) * N;
    float id = floor(sa);
    float fa = fract(sa) - 0.5;
    float h = hash12(vec2(id, fi * 13.0));
    float z = fract(h * 7.13 + sp * (0.25 + 0.35 * h));
    float rad = 0.02 + z * z * 1.4;
    float len = 0.02 + z * z * 0.35;
    float seg = smoothstep(len, 0.0, abs(r - rad));
    float thin = smoothstep(0.28, 0.0, abs(fa));
    float s = seg * thin * smoothstep(0.0, 0.25, z) * step(0.3, h);
    vec3 c = 0.55 + 0.45 * cos(2.0 * PI * (h * 0.6 + t * 0.04 + vec3(0.0, 0.33, 0.67)));
    col += c * s * (0.9 + z);
  }
  vec3 core = 0.5 + 0.5 * cos(2.0 * PI * (t * 0.05 + vec3(0.55, 0.75, 0.95)));
  col += core * 0.06 / (r + 0.06);
  col += vec3(0.4, 0.15, 0.7) * 0.16 * smoothstep(0.9, 0.1, r);
  col += core * 0.08 * pow(0.5 + 0.5 * sin(3.0 / (r + 0.05) - t * 6.0), 6.0) * smoothstep(0.05, 0.4, r);
  return col;
}

/* ---------------- Scene 3 : Neon sunset ---------------- */
vec3 sceneSunset(vec2 p, float t) {
  float hz = -0.08;
  vec3 col;
  if (p.y > hz) {
    float k = (p.y - hz) / 0.58;
    col = mix(vec3(1.0, 0.55, 0.2), vec3(0.95, 0.2, 0.45), smoothstep(0.0, 0.35, k));
    col = mix(col, vec3(0.12, 0.03, 0.28), smoothstep(0.3, 1.0, k));
    col += starField(p, 90.0, 0.9, t) * smoothstep(0.5, 0.9, k);
    vec2 sc = vec2(0.0, hz + 0.2 + 0.015 * sin(t * 0.2));
    float sd = length(p - sc);
    float sunR = 0.26;
    vec3 sunCol = mix(vec3(1.0, 0.95, 0.45), vec3(1.0, 0.3, 0.55), smoothstep(sc.y + sunR, sc.y - sunR, p.y));
    float mask = 1.0;
    if (p.y < sc.y) {
      float yy = (sc.y - p.y) / sunR;
      mask = step(yy * 0.55, fract(p.y * 26.0 + t * 0.35));
    }
    float disc = smoothstep(sunR, sunR - 0.004, sd) * mask;
    col = mix(col, sunCol, disc);
    col += vec3(1.0, 0.35, 0.4) * 0.35 * exp(-max(sd - sunR, 0.0) * 7.0);
    float mh = hz + (0.05 + 0.15 * fbm(vec2(p.x * 2.2 + 3.0, 1.0))) * smoothstep(0.12, 0.75, abs(p.x));
    if (p.y < mh) {
      col = mix(vec3(0.07, 0.01, 0.11), vec3(0.3, 0.05, 0.3), smoothstep(hz, mh, p.y) * 0.6);
      col += vec3(1.0, 0.3, 0.6) * 0.6 * smoothstep(mh - 0.006, mh, p.y);
    }
  } else {
    float dpt = max(hz - p.y, 0.002);
    float z = 0.09 / dpt;
    vec2 g = vec2(p.x * z * 1.4, z + t * 1.6);
    vec2 fw = vec2(abs(z * 1.4) + abs(p.x * 1.4 * 0.09 / (dpt * dpt)), 0.09 / (dpt * dpt)) / uRes.y * 1.3 + 1e-4;
    vec2 dd = abs(fract(g + 0.5) - 0.5);
    float line = max(1.0 - smoothstep(0.0, fw.x, dd.x), 1.0 - smoothstep(0.0, fw.y, dd.y));
    float fade = smoothstep(0.0, 0.08, dpt);
    col = vec3(0.05, 0.0, 0.1) + vec3(1.0, 0.2, 0.75) * line * (0.3 + 0.7 * fade) * min(1.0, 0.25 + 0.75 / (fw.y * 6.0 + 1.0));
    col += vec3(1.0, 0.45, 0.3) * 0.45 * exp(-dpt * 18.0);
    col += vec3(1.0, 0.4, 0.5) * 0.25 * exp(-abs(p.x) * 5.0) * exp(-dpt * 6.0);
  }
  return col;
}

vec3 sceneById(float id, vec2 p, float t) {
  if (id < 0.5) return sceneSpace(p, t);
  if (id < 1.5) return sceneAurora(p, t);
  if (id < 2.5) return sceneWarp(p, t);
  return sceneSunset(p, t);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 col = sceneById(uA, p, uTA);
  if (uMix > 0.001) col = mix(col, sceneById(uB, p, uTB), uMix);
  if (uLogoA > 0.001) {
    float la = texture2D(uLogo, vUv).a * uLogoA;
    col = col * (1.0 - 0.55 * la) + vec3(1.0) * la;
  }
  float vig = 1.0 - 0.32 * pow(length((vUv - 0.5) * vec2(1.0, 1.2)), 2.2);
  col *= vig;
  col += (hash12(vUv * uRes + fract(uTime * 7.0) * 311.0) - 0.5) * 0.02;
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
}`;

const REDUCE_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tMovie;
void main() {
  float cell = floor(vUv.x * 3.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 3; j++) {
      vec2 uv = vec2((cell + (float(i) + 0.5) / 4.0) / 3.0, (float(j) + 0.5) / 3.0);
      acc += textureLod(tMovie, uv, 4.5).rgb;
    }
  }
  acc /= 12.0;
  gl_FragColor = vec4(min(acc * 2.0, vec3(1.0)), 1.0);
}`;

const CLIPS = [
  { id: 0, dur: 20 },
  { id: 1, dur: 16 },
  { id: 2, dur: 12 },
  { id: 3, dur: 16 },
];
const CROSSFADE_DUR = 1.8;
const TOTAL_REEL_DUR = CLIPS.reduce((sum, c) => sum + c.dur, 0);

// Analytical 3-zone palettes per scene for software WebGL (avoids synchronous readPixels GPU stall)
const SCENE_PALETTES: [number, number, number][][] = [
  // Scene 0: Earthrise
  [
    [0.05, 0.11, 0.24],
    [0.08, 0.14, 0.28],
    [0.11, 0.09, 0.22],
  ],
  // Scene 1: Aurora
  [
    [0.03, 0.18, 0.14],
    [0.04, 0.22, 0.18],
    [0.08, 0.14, 0.22],
  ],
  // Scene 2: Hyperspace
  [
    [0.12, 0.11, 0.25],
    [0.18, 0.16, 0.32],
    [0.14, 0.1, 0.24],
  ],
  // Scene 3: Neon Sunset
  [
    [0.24, 0.07, 0.18],
    [0.32, 0.14, 0.18],
    [0.24, 0.07, 0.18],
  ],
];

export class MovieScreenRenderer {
  texture: THREE.Texture;
  colors = [
    new THREE.Color(0.04, 0.06, 0.12),
    new THREE.Color(0.05, 0.07, 0.14),
    new THREE.Color(0.06, 0.06, 0.1),
  ];
  target = [
    new THREE.Color(0.04, 0.06, 0.12),
    new THREE.Color(0.05, 0.07, 0.14),
    new THREE.Color(0.06, 0.06, 0.1),
  ];
  rt: THREE.WebGLRenderTarget;
  reduceRT: THREE.WebGLRenderTarget;
  mat: THREE.ShaderMaterial;
  reduceMat: THREE.ShaderMaterial;
  quad: THREE.Mesh;
  qScene = new THREE.Scene();
  qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  acc = 1;
  pending = false;
  lastRead = -1;
  buf = new Uint8Array(12);
  asyncOK = true;
  logo: THREE.CanvasTexture;
  isSoftwareGl: boolean;

  constructor(renderer: THREE.WebGLRenderer, mobile: boolean, isSoftwareGl: boolean) {
    this.isSoftwareGl = isSoftwareGl;
    const h = isSoftwareGl ? 256 : mobile ? 400 : 540;
    const w = Math.round((h * SCREEN_GEOMETRY.width) / SCREEN_GEOMETRY.height);

    this.rt = new THREE.WebGLRenderTarget(w, h, {
      colorSpace: THREE.SRGBColorSpace,
      generateMipmaps: !isSoftwareGl,
      minFilter: isSoftwareGl ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.rt.texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

    this.reduceRT = new THREE.WebGLRenderTarget(3, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    this.logo = makeImaxLogoTexture();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uA: { value: 0 },
        uB: { value: 1 },
        uTA: { value: 0 },
        uTB: { value: 0 },
        uMix: { value: 0 },
        uRes: { value: new THREE.Vector2(w, h) },
        uLogo: { value: this.logo },
        uLogoA: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.reduceMat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: REDUCE_FRAGMENT_SHADER,
      uniforms: {
        tMovie: { value: this.rt.texture },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
    this.texture = this.rt.texture;
  }

  setTiming(elapsed: number) {
    const u = this.mat.uniforms;
    const tMod = elapsed % TOTAL_REEL_DUR;
    let offset = 0;
    let idx = 0;
    while (idx < CLIPS.length - 1 && !(tMod < offset + CLIPS[idx].dur)) {
      offset += CLIPS[idx].dur;
      idx++;
    }
    const cur = CLIPS[idx];
    const next = CLIPS[(idx + 1) % CLIPS.length];
    const localT = tMod - offset;
    const fadeStart = cur.dur - CROSSFADE_DUR;
    const mix = localT > fadeStart ? smoothstep01((localT - fadeStart) / CROSSFADE_DUR) : 0;

    u.uA.value = cur.id;
    u.uTA.value = localT;
    u.uB.value = next.id;
    u.uTB.value = localT - cur.dur;
    u.uMix.value = mix;
    u.uTime.value = elapsed % 1000;
    u.uLogoA.value =
      cur.id === 0 ? smoothstep01((localT - 0.8) / 1.5) * (1 - smoothstep01((localT - 6.5) / 2)) : 0;

    if (this.isSoftwareGl) {
      const palA = SCENE_PALETTES[cur.id] ?? SCENE_PALETTES[0];
      const palB = SCENE_PALETTES[next.id] ?? SCENE_PALETTES[0];
      for (let i = 0; i < 3; i++) {
        this.target[i].setRGB(
          palA[i][0] + (palB[i][0] - palA[i][0]) * mix,
          palA[i][1] + (palB[i][1] - palA[i][1]) * mix,
          palA[i][2] + (palB[i][2] - palA[i][2]) * mix
        );
      }
    }
  }

  update(renderer: THREE.WebGLRenderer, elapsed: number, dt: number) {
    this.acc += dt;
    const stepInterval = this.isSoftwareGl ? 1 / 12 : 1 / 30;
    if (this.acc >= stepInterval) {
      this.acc %= stepInterval;
      this.setTiming(elapsed);
      this.quad.material = this.mat;
      renderer.setRenderTarget(this.rt);
      renderer.render(this.qScene, this.qCam);
      if (!this.isSoftwareGl && !this.pending && elapsed - this.lastRead > 0.1) {
        this.readColors(renderer, elapsed);
      }
      renderer.setRenderTarget(null);
    }
    const k = 1 - Math.exp(-dt * 5);
    for (let i = 0; i < 3; i++) {
      this.colors[i].lerp(this.target[i], k);
    }
  }

  readColors(renderer: THREE.WebGLRenderer, elapsed: number) {
    this.lastRead = elapsed;
    this.quad.material = this.reduceMat;
    renderer.setRenderTarget(this.reduceRT);
    renderer.render(this.qScene, this.qCam);
    this.quad.material = this.mat;
    const anyRenderer = renderer as unknown as {
      readRenderTargetPixelsAsync?: (
        rt: THREE.WebGLRenderTarget,
        x: number,
        y: number,
        w: number,
        h: number,
        buf: Uint8Array
      ) => Promise<void>;
    };
    if (this.asyncOK && typeof anyRenderer.readRenderTargetPixelsAsync === 'function') {
      this.pending = true;
      anyRenderer
        .readRenderTargetPixelsAsync(this.reduceRT, 0, 0, 3, 1, this.buf)
        .then(() => {
          this.pending = false;
          this.applyBuf();
        })
        .catch(() => {
          this.pending = false;
          this.asyncOK = false;
        });
    } else {
      renderer.readRenderTargetPixels(this.reduceRT, 0, 0, 3, 1, this.buf);
      this.applyBuf();
    }
  }

  applyBuf() {
    for (let i = 0; i < 3; i++) {
      this.target[i].setRGB(
        this.buf[i * 4] / 510,
        this.buf[i * 4 + 1] / 510,
        this.buf[i * 4 + 2] / 510
      );
    }
  }

  dispose() {
    this.rt.dispose();
    this.reduceRT.dispose();
    this.mat.dispose();
    this.reduceMat.dispose();
    this.logo.dispose();
    this.quad.geometry.dispose();
  }
}
