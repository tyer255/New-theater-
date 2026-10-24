import * as THREE from 'three';

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 1831565813) >>> 0;
    let n = t;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;
  return { c, g };
}

interface TexOpts {
  linear?: boolean;
  repeat?: boolean;
  nearest?: boolean;
  noMips?: boolean;
  aniso?: number;
}

function toTexture(canvas: HTMLCanvasElement, opts: TexOpts = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  if (opts.nearest) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
  } else if (opts.noMips) {
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
  }
  if (opts.aniso) {
    tex.anisotropy = opts.aniso;
  }
  tex.needsUpdate = true;
  return tex;
}

function addGrain(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
  seed: number
) {
  const img = g.getImageData(0, 0, width, height);
  const data = img.data;
  const rng = mulberry32(seed);
  for (let i = 0; i < data.length; i += 4) {
    const d = (rng() - 0.5) * amount;
    data[i] += d;
    data[i + 1] += d;
    data[i + 2] += d;
  }
  g.putImageData(img, 0, 0);
}

function drawTrackedText(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  tracking: number
) {
  const chars = text.split('');
  const widths = chars.map((ch) => g.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let x = cx - totalWidth / 2;
  const prevAlign = g.textAlign;
  g.textAlign = 'left';
  chars.forEach((ch, idx) => {
    g.fillText(ch, x, cy);
    x += widths[idx] + tracking;
  });
  g.textAlign = prevAlign;
}

export function makeCarpetTexture(aniso?: number): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 512);
  const rng = mulberry32(7);
  g.fillStyle = '#2c070d';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) {
    g.fillStyle =
      rng() < 0.5
        ? `rgba(95,16,26,${0.06 + rng() * 0.1})`
        : `rgba(12,2,5,${0.08 + rng() * 0.12})`;
    g.beginPath();
    g.arc(rng() * 512, rng() * 512, 4 + rng() * 18, 0, Math.PI * 2);
    g.fill();
  }
  const margin = 60;
  const tileWrap = (x: number, y: number, fn: (dx: number, dy: number) => void) => {
    const xs = x < margin ? [0, 512] : x > 512 - margin ? [0, -512] : [0];
    const ys = y < margin ? [0, 512] : y > 512 - margin ? [0, -512] : [0];
    for (const dx of xs) for (const dy of ys) fn(dx, dy);
  };
  const cells = 4;
  const step = 512 / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const cx = (i + 0.5 + (j % 2) * 0.5) * step;
      const cy = (j + 0.5) * step;
      const rot = rng() * Math.PI * 2;
      const sc = 0.85 + rng() * 0.3;
      tileWrap(cx, cy, (dx, dy) => {
        g.save();
        g.translate(cx + dx, cy + dy);
        g.rotate(rot);
        g.scale(sc, sc);
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(160,38,42,0.55)';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(0, -34);
        g.bezierCurveTo(32, -30, 36, 16, 0, 30);
        g.bezierCurveTo(-28, 22, -22, -6, 0, -6);
        g.bezierCurveTo(14, -6, 12, 10, 2, 12);
        g.stroke();
        g.strokeStyle = 'rgba(18,3,7,0.75)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(4, 4, 9, 0, Math.PI * 1.6);
        g.stroke();
        g.strokeStyle = 'rgba(120,24,30,0.5)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-44, 40);
        g.quadraticCurveTo(-10, 20, -32, -12);
        g.stroke();
        g.beginPath();
        g.moveTo(40, -44);
        g.quadraticCurveTo(22, -14, 48, -4);
        g.stroke();
        g.fillStyle = 'rgba(200,80,55,0.45)';
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2;
          g.beginPath();
          g.arc(Math.cos(ang) * 46, Math.sin(ang) * 46, 2.6, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      });
    }
  }
  addGrain(g, 512, 512, 26, 11);
  return toTexture(c, { repeat: true, aniso });
}

export function makeWallTexture(aniso?: number): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 256);
  const rng = mulberry32(3);
  g.fillStyle = '#1d1613';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 2) {
    g.fillStyle = `rgba(0,0,0,${0.04 + rng() * 0.07})`;
    g.fillRect(x, 0, 1, 256);
  }
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(0.18, 'rgba(0,0,0,0)');
  grad.addColorStop(0.82, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.9)';
  g.fillRect(0, 0, 5, 256);
  g.fillStyle = 'rgba(255,205,160,0.07)';
  g.fillRect(5, 0, 2, 256);
  addGrain(g, 256, 256, 14, 5);
  return toTexture(c, { repeat: true, aniso });
}

export function makeCeilingTexture(aniso?: number): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = '#121318';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 6; y < 128; y += 9) {
    for (let x = 6; x < 128; x += 9) {
      g.fillRect(x, y, 2, 2);
    }
  }
  g.fillStyle = '#050608';
  g.fillRect(0, 0, 128, 3);
  g.fillRect(0, 0, 3, 128);
  addGrain(g, 128, 128, 10, 9);
  return toTexture(c, { repeat: true, aniso });
}

export function makeFabricTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.06)';
  g.lineWidth = 1;
  for (let i = -128; i < 256; i += 3) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.stroke();
  }
  addGrain(g, 128, 128, 46, 21);
  return toTexture(c, { repeat: true });
}

export function makeDoorTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 512);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#2e1912');
  grad.addColorStop(0.5, '#43251a');
  grad.addColorStop(1, '#2e1912');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  g.save();
  g.beginPath();
  g.rect(18, 18, 220, 476);
  g.clip();
  g.lineWidth = 3;
  for (let i = -512; i < 768; i += 64) {
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 512, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i - 512, 512);
    g.stroke();
    g.strokeStyle = 'rgba(255,190,150,0.06)';
    g.beginPath();
    g.moveTo(i + 3, 0);
    g.lineTo(i + 3 + 512, 512);
    g.stroke();
  }
  for (let row = 0; row * 32 < 512; row++) {
    for (let col = -1; col * 64 < 320; col++) {
      const px = col * 64 + (row % 2) * 32;
      const py = row * 32;
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.beginPath();
      g.arc(px, py, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,200,160,0.18)';
      g.beginPath();
      g.arc(px - 1, py - 1, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.lineWidth = 8;
  g.strokeRect(14, 14, 228, 484);
  g.strokeStyle = 'rgba(210,160,90,0.25)';
  g.lineWidth = 2;
  g.strokeRect(20, 20, 216, 472);
  addGrain(g, 256, 512, 16, 31);
  return toTexture(c);
}

function makeAlphaGradient(
  width: number,
  height: number,
  fn: (u: number, v: number) => number
): THREE.CanvasTexture {
  const { c, g } = makeCanvas(width, height);
  const img = g.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = Math.max(0, Math.min(1, fn((x + 0.5) / width, (y + 0.5) / height)));
      const idx = (y * width + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { linear: true });
}

export function makeRadialGlowTexture(): THREE.CanvasTexture {
  return makeAlphaGradient(128, 128, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    if (r >= 1) return 0;
    const core = Math.exp(-r * r * 9);
    const halo = Math.pow(1 - r, 2.2) * 0.5;
    return core * 0.75 + halo;
  });
}

export function makeStripGlowTexture(): THREE.CanvasTexture {
  return makeAlphaGradient(64, 128, (u, v) => {
    const x = (u - 0.5) * 2;
    const edge = Math.min(1, v / 0.12, (1 - v) / 0.12);
    return (
      (0.65 * Math.exp(-x * x * 40) + 0.35 * Math.exp(-x * x * 6)) *
      Math.max(0, edge) *
      (1 - x * x)
    );
  });
}

export function makeWashGlowTexture(): THREE.CanvasTexture {
  return makeAlphaGradient(16, 128, (_u, v) => Math.pow(1 - v, 2.4));
}

export function makeConeGlowTexture(): THREE.CanvasTexture {
  return makeAlphaGradient(128, 128, (u, v) => {
    const t = 1 - v;
    const spread = 0.07 + 0.42 * t;
    const x = (u - 0.5) / spread;
    return Math.exp(-x * x * 2.2) * Math.pow(1 - t, 1.4) * Math.min(1, t / 0.04);
  });
}

export function makeSoftRectTexture(): THREE.CanvasTexture {
  return makeAlphaGradient(256, 128, (u, v) => {
    const dx = Math.max(0.14 - u, 0, u - 0.86) / 0.14;
    const dy = Math.max(0.2 - v, 0, v - 0.8) / 0.2;
    const r = Math.hypot(dx, dy);
    return Math.exp(-r * r * 4.5) * (1 - Math.min(1, r) * 0.15);
  });
}

export function makeContactShadowTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

const FONT_NARROW = "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
const FONT_BLACK = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

export function makeNowShowingTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(1024, 256);
  g.fillStyle = '#0b0603';
  g.fillRect(0, 0, 1024, 256);
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, 'rgba(255,140,50,0.10)');
  bg.addColorStop(0.5, 'rgba(255,140,50,0.02)');
  bg.addColorStop(1, 'rgba(255,140,50,0.10)');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 256);
  g.shadowColor = '#ff8a2a';
  g.shadowBlur = 20;
  g.strokeStyle = '#ffb066';
  g.lineWidth = 6;
  g.strokeRect(16, 16, 992, 224);
  for (let x = 46; x < 994; x += 44) {
    for (const y of [36, 220]) {
      g.fillStyle = '#ffe2ae';
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.font = `bold 112px ${FONT_NARROW}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const tg = g.createLinearGradient(0, 70, 0, 190);
  tg.addColorStop(0, '#fff6df');
  tg.addColorStop(1, '#ffbf6e');
  g.fillStyle = tg;
  g.shadowColor = '#ff9a3c';
  g.shadowBlur = 32;
  drawTrackedText(g, 'NOW SHOWING', 512, 132, 10);
  g.shadowBlur = 10;
  drawTrackedText(g, 'NOW SHOWING', 512, 132, 10);
  return toTexture(c, { noMips: false });
}

export function makeExitSignTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(256, 112);
  g.fillStyle = '#063a1a';
  g.fillRect(0, 0, 256, 112);
  g.fillStyle = '#0fa049';
  g.fillRect(6, 6, 244, 100);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(58, 26, 9, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(52, 42);
  g.lineTo(42, 66);
  g.moveTo(52, 42);
  g.lineTo(70, 52);
  g.lineTo(80, 44);
  g.moveTo(52, 42);
  g.lineTo(34, 48);
  g.moveTo(42, 66);
  g.lineTo(58, 78);
  g.lineTo(56, 94);
  g.moveTo(42, 66);
  g.lineTo(30, 84);
  g.lineTo(18, 84);
  g.stroke();
  g.font = `bold 62px ${FONT_BLACK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('EXIT', 170, 59);
  return toTexture(c);
}

export function makePopcornSignTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(512, 128);
  g.fillStyle = '#a90f18';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ffd34a';
  g.lineWidth = 5;
  g.strokeRect(10, 10, 492, 108);
  for (let x = 30; x < 492; x += 32) {
    g.fillStyle = '#fff1b0';
    g.beginPath();
    g.arc(x, 22, 4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(x, 106, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.font = `italic bold 72px ${FONT_BLACK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#5a0006';
  g.fillText('POPCORN', 260, 70);
  g.fillStyle = '#ffe14a';
  g.fillText('POPCORN', 256, 66);
  return toTexture(c);
}

export function makeImaxLogoTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(1024, 512);
  g.clearRect(0, 0, 1024, 512);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(160,210,255,0.9)';
  g.shadowBlur = 24;
  g.font = `bold 210px ${FONT_BLACK}`;
  drawTrackedText(g, 'IMAX', 512, 220, 18);
  g.shadowBlur = 10;
  g.font = `600 44px ${FONT_NARROW}`;
  drawTrackedText(g, 'A BIGGER WORLD', 512, 360, 16);
  return toTexture(c, { noMips: true, linear: true });
}

export function makePostersTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(1024, 384);
  const rng = mulberry32(99);

  const drawStars = (x0: number, count: number, maxH: number) => {
    for (let i = 0; i < count; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + rng() * 0.75})`;
      const s = rng() < 0.1 ? 2 : 1;
      g.fillRect(x0 + rng() * 256, rng() * maxH, s, s);
    }
  };

  const drawTitle = (
    x0: number,
    lines: string[],
    y: number,
    size: number,
    color: string,
    glow: string
  ) => {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${size}px ${FONT_BLACK}`;
    g.fillStyle = color;
    g.shadowColor = glow;
    g.shadowBlur = 16;
    lines.forEach((line, idx) => drawTrackedText(g, line, x0 + 128, y + idx * size * 1.05, 3));
    g.restore();
  };

  const drawSubtitle = (x0: number, text: string, y: number, color: string) => {
    g.save();
    g.textAlign = 'center';
    g.font = `600 11px ${FONT_NARROW}`;
    g.fillStyle = color;
    drawTrackedText(g, text, x0 + 128, y, 3);
    g.restore();
  };

  const drawCredits = (x0: number, y: number) => {
    g.fillStyle = 'rgba(200,200,210,0.45)';
    for (let i = 0; i < 3; i++) {
      const w = 150 - i * 30;
      g.fillRect(x0 + 128 - w / 2, y + i * 7, w, 2);
    }
  };

  const drawSilhouette = (x: number, y: number, s: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x - 2 * s, y - 16 * s, 4 * s, 4 * s);
    g.fillRect(x - 2 * s, y - 12 * s, 4 * s, 6 * s);
    g.fillRect(x - 4 * s, y - 12 * s, 2 * s, 6 * s);
    g.fillRect(x + 2 * s, y - 12 * s, 2 * s, 6 * s);
    g.fillRect(x - 2 * s, y - 6 * s, 2 * s, 6 * s);
    g.fillRect(x, y - 6 * s, 2 * s, 6 * s);
  };

  // Poster 0: IMAX A BIGGER WORLD
  {
    g.save();
    g.beginPath();
    g.rect(0, 0, 256, 384);
    g.clip();
    const bg = g.createLinearGradient(0, 0, 0, 384);
    bg.addColorStop(0, '#02030a');
    bg.addColorStop(0.6, '#081633');
    bg.addColorStop(1, '#02050d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 384);
    drawStars(0, 160, 384 * 0.7);
    const neb = g.createRadialGradient(190, 90, 0, 190, 90, 140);
    neb.addColorStop(0, 'rgba(140,60,200,0.35)');
    neb.addColorStop(1, 'rgba(140,60,200,0)');
    g.fillStyle = neb;
    g.fillRect(0, 0, 256, 384);
    const planet = g.createRadialGradient(150, 420, 60, 128, 470, 270);
    planet.addColorStop(0, '#0d3a74');
    planet.addColorStop(0.7, '#061b3c');
    planet.addColorStop(1, '#02060f');
    g.fillStyle = planet;
    g.beginPath();
    g.arc(128, 480, 265, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7cc8ff';
    g.shadowColor = '#4aa8ff';
    g.shadowBlur = 22;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(128, 480, 265, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    g.shadowBlur = 0;
    const sun = g.createRadialGradient(168, 218, 0, 168, 218, 70);
    sun.addColorStop(0, 'rgba(255,255,240,1)');
    sun.addColorStop(0.15, 'rgba(255,210,140,0.85)');
    sun.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = sun;
    g.fillRect(0, 120, 256, 200);
    g.fillStyle = 'rgba(255,220,170,0.6)';
    g.fillRect(0, 216, 256, 2);
    drawSilhouette(98, 222, 2.2, '#05070c');
    g.textAlign = 'center';
    g.font = `bold 16px ${FONT_BLACK}`;
    g.fillStyle = '#ffffff';
    drawTrackedText(g, 'IMAX', 128, 34, 6);
    drawTitle(0, ['A BIGGER', 'WORLD'], 290, 30, '#ffffff', 'rgba(120,190,255,0.8)');
    drawSubtitle(0, 'IN THEATRES NOW', 352, '#9fb7dd');
    drawCredits(0, 362);
    g.restore();
  }

  // Poster 1: NEON HORIZON
  {
    g.save();
    g.beginPath();
    g.rect(256, 0, 256, 384);
    g.clip();
    const sky = g.createLinearGradient(0, 0, 0, 250);
    sky.addColorStop(0, '#12002a');
    sky.addColorStop(0.55, '#7a1060');
    sky.addColorStop(0.85, '#ff4f7a');
    sky.addColorStop(1, '#ffb347');
    g.fillStyle = sky;
    g.fillRect(256, 0, 256, 250);
    drawStars(256, 60, 120);
    const sun = g.createLinearGradient(0, 140, 0, 250);
    sun.addColorStop(0, '#ffe86a');
    sun.addColorStop(1, '#ff3f8e');
    g.fillStyle = sun;
    g.beginPath();
    g.arc(384, 220, 74, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 7; i++) {
      const y = 200 + i * 9;
      g.fillStyle = '#c1206a';
      g.fillRect(256, y, 256, 2 + i * 0.8);
    }
    g.fillStyle = '#1a0326';
    g.fillRect(256, 250, 256, 134);
    g.strokeStyle = '#ff3fd0';
    g.shadowColor = '#ff3fd0';
    g.shadowBlur = 8;
    g.lineWidth = 1.5;
    for (let i = -12; i <= 12; i++) {
      g.beginPath();
      g.moveTo(384 + i * 6, 250);
      g.lineTo(384 + i * 60, 384);
      g.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const y = 250 + Math.pow(i / 8, 2.2) * 134;
      g.beginPath();
      g.moveTo(256, y);
      g.lineTo(512, y);
      g.stroke();
    }
    g.shadowBlur = 0;
    g.fillStyle = '#16021f';
    g.beginPath();
    g.moveTo(256, 250);
    g.lineTo(296, 205);
    g.lineTo(326, 228);
    g.lineTo(351, 250);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(512, 250);
    g.lineTo(462, 196);
    g.lineTo(432, 230);
    g.lineTo(402, 250);
    g.closePath();
    g.fill();
    drawTitle(256, ['NEON', 'HORIZON'], 52, 34, '#ffe6fb', '#ff3fd0');
    drawSubtitle(256, 'THE FUTURE IS BRIGHT', 340, '#ffb3e6');
    drawCredits(256, 352);
    g.restore();
  }

  // Poster 2: AURORA
  {
    g.save();
    g.beginPath();
    g.rect(512, 0, 256, 384);
    g.clip();
    const bg = g.createLinearGradient(0, 0, 0, 384);
    bg.addColorStop(0, '#01060f');
    bg.addColorStop(0.7, '#062437');
    bg.addColorStop(1, '#010409');
    g.fillStyle = bg;
    g.fillRect(512, 0, 256, 384);
    drawStars(512, 120, 384 * 0.6);
    g.globalCompositeOperation = 'lighter';
    (
      [
        ['rgba(40,255,140,0.45)', 120],
        ['rgba(60,220,255,0.35)', 160],
        ['rgba(190,80,255,0.3)', 90],
      ] as const
    ).forEach(([col, y], idx) => {
      g.strokeStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 24;
      g.lineWidth = 16 - idx * 3;
      g.beginPath();
      g.moveTo(492, y + 30);
      g.bezierCurveTo(582, y - 50, 662, y + 70, 788, y - 10);
      g.stroke();
    });
    g.globalCompositeOperation = 'source-over';
    g.shadowBlur = 0;
    g.fillStyle = '#02070b';
    g.beginPath();
    g.moveTo(512, 300);
    g.lineTo(562, 240);
    g.lineTo(602, 275);
    g.lineTo(652, 215);
    g.lineTo(712, 270);
    g.lineTo(768, 235);
    g.lineTo(768, 384);
    g.lineTo(512, 384);
    g.closePath();
    g.fill();
    drawTitle(512, ['AURORA'], 316, 36, '#e9fff6', 'rgba(60,255,170,0.9)');
    drawSubtitle(512, 'LIGHT BEYOND THE NORTH', 346, '#8fe3c4');
    drawCredits(512, 358);
    g.restore();
  }

  // Poster 3: HYPER DRIVE
  {
    g.save();
    g.beginPath();
    g.rect(768, 0, 256, 384);
    g.clip();
    g.fillStyle = '#020208';
    g.fillRect(768, 0, 256, 384);
    const cx = 896;
    const cy = 170;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 140; i++) {
      const ang = rng() * Math.PI * 2;
      const r0 = 12 + rng() * 40;
      const r1 = r0 + 60 + rng() * 220;
      const hue = rng() < 0.5 ? 190 + rng() * 30 : 290 + rng() * 40;
      const lg = g.createLinearGradient(
        cx + Math.cos(ang) * r0,
        cy + Math.sin(ang) * r0,
        cx + Math.cos(ang) * r1,
        cy + Math.sin(ang) * r1
      );
      lg.addColorStop(0, `hsla(${hue},100%,70%,0)`);
      lg.addColorStop(1, `hsla(${hue},100%,70%,0.9)`);
      g.strokeStyle = lg;
      g.lineWidth = 1 + rng() * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      g.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      g.stroke();
    }
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, 70);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.3, 'rgba(140,200,255,0.5)');
    core.addColorStop(1, 'rgba(80,40,200,0)');
    g.fillStyle = core;
    g.fillRect(768, 0, 256, 384);
    g.globalCompositeOperation = 'source-over';
    drawTitle(768, ['HYPER', 'DRIVE'], 296, 34, '#e8f8ff', 'rgba(70,200,255,0.9)');
    drawSubtitle(768, 'HOLD ON TO YOUR SEAT', 356, '#a6d9ff');
    drawCredits(768, 366);
    g.restore();
  }

  return toTexture(c);
}

export function makeCharacterTexture(): THREE.CanvasTexture {
  const { c, g } = makeCanvas(64, 64);
  const rng = mulberry32(42);
  const pick = (arr: string[]) => arr[Math.floor(rng() * arr.length)];
  const hair = ['#3b2614', '#46301a', '#2f1e0f', '#4f3820'];
  const skin = ['#c8987a', '#bf8e6e', '#cfa284'];
  const skinDark = ['#a87a5c', '#9e7054'];
  const shirt = ['#12a3a6', '#0f9497', '#16b0b3'];
  const shirtDark = ['#0c7f82', '#0b7477'];
  const pants = ['#3a3c9a', '#33358c', '#4143a6'];
  const shoes = ['#5c5c5c', '#4f4f4f', '#676767'];

  const px = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };
  const fillRegion = (
    x0: number,
    y0: number,
    w: number,
    h: number,
    fn: (dx: number, dy: number) => string
  ) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        px(x0 + dx, y0 + dy, fn(dx, dy));
      }
    }
  };

  fillRegion(8, 0, 8, 8, () => pick(hair));
  fillRegion(16, 0, 8, 8, () => pick(skinDark));
  fillRegion(0, 8, 8, 8, (dx, dy) =>
    dy < 2 || (dy < 4 && dx < 5) || (dy < 6 && dx < 2) ? pick(hair) : pick(skin)
  );
  fillRegion(16, 8, 8, 8, (dx, dy) =>
    dy < 2 || (dy < 4 && dx > 2) || (dy < 6 && dx > 5) ? pick(hair) : pick(skin)
  );
  fillRegion(24, 8, 8, 8, (_dx, dy) => (dy < 7 ? pick(hair) : pick(skinDark)));
  fillRegion(8, 8, 8, 8, (dx, dy) =>
    dy < 2 || (dy === 2 && (dx === 0 || dx === 7)) ? pick(hair) : pick(skin)
  );
  px(9, 12, '#ffffff');
  px(10, 12, '#3f3aa8');
  px(13, 12, '#3f3aa8');
  px(14, 12, '#ffffff');
  px(11, 13, '#9a6448');
  px(12, 13, '#9a6448');
  for (let x = 10; x <= 13; x++) px(x, 14, '#6e3f2a');
  px(10, 15, '#83513a');
  px(13, 15, '#83513a');

  const torsoCol = (dy: number) => (dy > 9 ? pick(shirtDark) : pick(shirt));
  fillRegion(20, 16, 8, 4, () => pick(shirt));
  fillRegion(28, 16, 8, 4, () => pick(pants));
  fillRegion(16, 20, 4, 12, (_dx, dy) => torsoCol(dy));
  fillRegion(28, 20, 4, 12, (_dx, dy) => torsoCol(dy));
  fillRegion(32, 20, 8, 12, (_dx, dy) => torsoCol(dy));
  fillRegion(20, 20, 8, 12, (dx, dy) =>
    (dy === 0 && dx >= 2 && dx <= 5) || (dy === 1 && (dx === 3 || dx === 4))
      ? pick(skin)
      : torsoCol(dy)
  );
  fillRegion(44, 16, 4, 4, () => pick(shirt));
  fillRegion(48, 16, 4, 4, () => pick(skinDark));
  fillRegion(40, 20, 16, 12, (_dx, dy) =>
    dy < 4 ? pick(shirt) : dy > 9 ? pick(skinDark) : pick(skin)
  );
  fillRegion(4, 16, 4, 4, () => pick(pants));
  fillRegion(8, 16, 4, 4, () => '#3a3a3a');
  fillRegion(0, 20, 16, 12, (_dx, dy) => (dy < 9 ? pick(pants) : pick(shoes)));

  return toTexture(c, { nearest: true });
}
