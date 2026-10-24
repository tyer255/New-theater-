import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  HALL_BOUNDS,
  STAGE_BOUNDS,
  TIER_STEPS,
  AISLE_STAIRS,
  SEAT_X_COORDS,
  SEAT_ROWS,
  SCREEN_GEOMETRY,
  POPCORN_STAND,
  PROJECTOR_POS,
  floorHeightAt,
} from './math';
import {
  mulberry32,
  makeCarpetTexture,
  makeWallTexture,
  makeCeilingTexture,
  makeFabricTexture,
  makeDoorTexture,
  makeRadialGlowTexture,
  makeStripGlowTexture,
  makeWashGlowTexture,
  makeConeGlowTexture,
  makeSoftRectTexture,
  makePostersTexture,
  makeNowShowingTexture,
  makeExitSignTexture,
  makePopcornSignTexture,
} from './textures';

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();

function composeMatrix(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.Matrix4 {
  _euler.set(rx, ry, rz);
  _quat.setFromEuler(_euler);
  _pos.set(x, y, z);
  _scale.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_pos, _quat, _scale);
}

function projectTriplanarUV(geom: THREE.BufferGeometry, scale: number) {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const nrm = geom.attributes.normal as THREE.BufferAttribute;
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    if (ny >= nx && ny >= nz) {
      uv.setXY(i, px * scale, pz * scale);
    } else if (nx >= nz) {
      uv.setXY(i, pz * scale, py * scale);
    } else {
      uv.setXY(i, px * scale, py * scale);
    }
  }
  uv.needsUpdate = true;
}

class GeometryBatcher {
  groups = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(
    geom: THREE.BufferGeometry,
    mat: THREE.Material,
    matrix: THREE.Matrix4,
    opts: { uv?: number; color?: THREE.Color } = {}
  ) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    g.applyMatrix4(matrix);
    if (opts.uv) projectTriplanarUV(g, opts.uv);
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        g.deleteAttribute(key);
      }
    }
    if ((mat as THREE.Material & { vertexColors?: boolean }).vertexColors) {
      const col = opts.color ?? new THREE.Color(1, 1, 1);
      const count = g.attributes.position.count;
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = col.r;
        arr[i * 3 + 1] = col.g;
        arr[i * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    g.clearGroups();
    let list = this.groups.get(mat);
    if (!list) {
      list = [];
      this.groups.set(mat, list);
    }
    list.push(g);
  }

  build(parent: THREE.Object3D) {
    for (const [mat, geoms] of this.groups) {
      const merged = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      if (mat.transparent) mesh.renderOrder = 2;
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

function makeAdditiveGlowMat(map: THREE.Texture) {
  return new THREE.MeshBasicMaterial({
    map,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}

function bendPlaneGeometry(geom: THREE.BufferGeometry, radius: number) {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const angle = pos.getX(i) / radius;
    pos.setX(i, radius * Math.sin(angle));
    pos.setZ(i, pos.getZ(i) + radius * (1 - Math.cos(angle)));
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

const scaledColor = (hex: number, scale = 1) => new THREE.Color(hex).multiplyScalar(scale);
const WARM_GOLD = 0xffa23c;
const EXIT_GREEN = 0x2dff3c;

const BEAM_VERTEX_SHADER = `
attribute float aT;
attribute float aU;
varying float vT;
varying float vU;
varying vec3 vN;
varying vec3 vV;
void main() {
  vT = aT;
  vU = aU;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const BEAM_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying float vT;
varying float vU;
varying vec3 vN;
varying vec3 vV;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  float along = pow(1.0 - vT, 1.35) * smoothstep(0.0, 0.025, vT);
  float rays = 0.5 + 0.5 * n1(vU * 55.0 + uTime * 0.25) * (0.6 + 0.4 * n1(vU * 17.0 - uTime * 0.15 + 3.0));
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float edge = smoothstep(0.0, 0.12, vU) * smoothstep(1.0, 0.88, vU);
  float a = along * rays * (0.5 + 0.5 * facing) * (0.5 + 0.5 * edge) * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

const DUST_VERTEX_SHADER = `
uniform float uTime;
uniform float uScale;
attribute float aSeed;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.15 + aSeed * 12.0) * 0.18;
  p.y += sin(uTime * 0.11 + aSeed * 7.0) * 0.12;
  p.z += cos(uTime * 0.13 + aSeed * 5.0) * 0.18;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (0.5 + aSeed) / max(-mv.z, 0.5);
  vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.8 + aSeed * 1.5) + aSeed * 40.0));
}`;

const DUST_FRAGMENT_SHADER = `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor * a * vA, 1.0);
}`;

export interface TheatreHallController {
  setStreaming(streaming: boolean): void;
  setLightsOut(lightsOut: number): void;
  update(elapsed: number, screenColors: THREE.Color[], dpr: number, dim: number): void;
}

export function buildTheatreHall(
  scene: THREE.Scene,
  movieTexture: THREE.Texture,
  opts: { aniso: number; mobile: boolean }
): TheatreHallController {
  const batch = new GeometryBatcher();
  const root = new THREE.Group();
  scene.add(root);

  const tex = {
    carpet: makeCarpetTexture(opts.aniso),
    wall: makeWallTexture(opts.aniso),
    ceiling: makeCeilingTexture(opts.aniso),
    fabric: makeFabricTexture(),
    door: makeDoorTexture(),
    radial: makeRadialGlowTexture(),
    strip: makeStripGlowTexture(),
    wash: makeWashGlowTexture(),
    cone: makeConeGlowTexture(),
    soft: makeSoftRectTexture(),
    posters: makePostersTexture(),
    nowShowing: makeNowShowingTexture(),
    exit: makeExitSignTexture(),
    popcorn: makePopcornSignTexture(),
  };

  const mat = {
    carpet: new THREE.MeshLambertMaterial({ map: tex.carpet }),
    riser: new THREE.MeshLambertMaterial({ color: 0x0f0d1f }),
    wall: new THREE.MeshLambertMaterial({ map: tex.wall }),
    black: new THREE.MeshLambertMaterial({ color: 0x060607 }),
    ceiling: new THREE.MeshLambertMaterial({ map: tex.ceiling }),
    seat: new THREE.MeshLambertMaterial({
      map: tex.fabric,
      color: 0x8e1526,
      emissive: 0x1e0307,
    }),
    plastic: new THREE.MeshLambertMaterial({ color: 0x1b19de >= 0 ? 0x1b19de : 0x1b19de }),
    metal: new THREE.MeshPhongMaterial({
      color: 0x8c8782,
      specular: 0xffffff,
      shininess: 70,
    }),
    gold: new THREE.MeshPhongMaterial({
      color: 0xb98a4a,
      specular: 0xffdf80,
      shininess: 60,
      emissive: 0x1a0e02,
    }),
    door: new THREE.MeshLambertMaterial({ map: tex.door }),
    red: new THREE.MeshLambertMaterial({ color: 0xa3112a, emissive: 0x2a0306 }),
    emissive: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glow: makeAdditiveGlowMat(tex.radial),
    strip: makeAdditiveGlowMat(tex.strip),
    wash: makeAdditiveGlowMat(tex.wash),
    cone: makeAdditiveGlowMat(tex.cone),
    posters: new THREE.MeshBasicMaterial({
      map: tex.posters,
      color: 0xd8d8d8,
      toneMapped: false,
    }),
    nowShowing: new THREE.MeshBasicMaterial({ map: tex.nowShowing, toneMapped: false }),
    exit: new THREE.MeshBasicMaterial({ map: tex.exit, toneMapped: false }),
    popcornSign: new THREE.MeshBasicMaterial({ map: tex.popcorn, toneMapped: false }),
    boothGlass: new THREE.MeshBasicMaterial({ color: 0x0a1424 }),
  };
  // Set exact plastic color from reference (1776158 = 0x1b1a1e)
  mat.plastic.color.setHex(1776158);

  const unitPlane = new THREE.PlaneGeometry(1, 1);

  const addBox = (
    m: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    extra: {
      round?: number;
      rx?: number;
      ry?: number;
      rz?: number;
      uv?: number;
      color?: THREE.Color;
    } = {}
  ) => {
    const geom = extra.round
      ? new RoundedBoxGeometry(w, h, d, 2, extra.round)
      : new THREE.BoxGeometry(w, h, d);
    batch.add(geom, m, composeMatrix(x, y, z, extra.rx ?? 0, extra.ry ?? 0, extra.rz ?? 0), {
      uv: extra.uv,
      color: extra.color,
    });
    geom.dispose();
  };

  const addPlane = (
    m: THREE.Material,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    color?: THREE.Color
  ) => {
    batch.add(unitPlane, m, composeMatrix(x, y, z, rx, ry, rz, w, h, 1), { color });
  };

  const hallW = HALL_BOUNDS.maxX - HALL_BOUNDS.minX;
  const hallD = HALL_BOUNDS.maxZ - HALL_BOUNDS.minZ;
  const hallH = HALL_BOUNDS.height;
  const midZ = (HALL_BOUNDS.minZ + HALL_BOUNDS.maxZ) / 2;
  const minX = HALL_BOUNDS.minX;
  const maxX = HALL_BOUNDS.maxX;
  const maxZ = HALL_BOUNDS.maxZ;
  const minZ = HALL_BOUNDS.minZ;

  type WallSide = 'L' | 'R' | 'B';
  const wallCoords = (side: WallSide, along: number, inset: number): [number, number, number] =>
    side === 'L'
      ? [minX + inset, along, Math.PI / 2]
      : side === 'R'
        ? [maxX - inset, along, -Math.PI / 2]
        : [along, maxZ - inset, Math.PI];

  const addWallPlane = (
    m: THREE.Material,
    side: WallSide,
    along: number,
    y: number,
    w: number,
    h: number,
    inset: number,
    color?: THREE.Color,
    rz = 0
  ) => {
    const [wx, wz, ry] = wallCoords(side, along, inset);
    batch.add(unitPlane, m, composeMatrix(wx, y, wz, 0, ry, rz, w, h, 1), { color });
  };

  const addWallBox = (
    m: THREE.Material,
    side: WallSide,
    along: number,
    y: number,
    w: number,
    h: number,
    d: number,
    extra: { round?: number; off?: number; color?: THREE.Color } = {}
  ) => {
    const [wx, wz, ry] = wallCoords(side, along, d / 2 + (extra.off ?? 0));
    addBox(m, w, h, d, wx, y, wz, { ...extra, ry });
  };

  // Outer walls, ceiling, and front floor carpet
  addBox(mat.wall, 0.3, hallH, hallD, minX - 0.15, hallH / 2, midZ, { uv: 1 / 1.6 });
  addBox(mat.wall, 0.3, hallH, hallD, maxX + 0.15, hallH / 2, midZ, { uv: 1 / 1.6 });
  addBox(mat.wall, hallW, hallH, 0.3, 0, hallH / 2, maxZ + 0.15, { uv: 1 / 1.6 });
  addBox(mat.black, hallW, hallH, 0.3, 0, hallH / 2, minZ - 0.15);
  addBox(mat.ceiling, hallW, 0.3, hallD, 0, hallH + 0.15, midZ, { uv: 1 / 1.2 });
  addBox(mat.carpet, hallW, 0.2, TIER_STEPS[0].z - minZ, 0, -0.1, (minZ + TIER_STEPS[0].z) / 2, {
    uv: 0.4,
  });

  // Front stage riser
  const stageDepth = STAGE_BOUNDS.frontZ - minZ;
  addBox(mat.riser, hallW, STAGE_BOUNDS.height, stageDepth, 0, STAGE_BOUNDS.height / 2, (minZ + STAGE_BOUNDS.frontZ) / 2);
  addBox(mat.plastic, hallW, 0.03, 0.05, 0, STAGE_BOUNDS.height - 0.015, STAGE_BOUNDS.frontZ - 0.02);
  addBox(mat.emissive, hallW - 0.3, 0.014, 0.014, 0, 0.035, STAGE_BOUNDS.frontZ + 0.008, {
    color: scaledColor(WARM_GOLD, 0.9),
  });
  addPlane(
    mat.wash,
    hallW - 0.3,
    0.7,
    0,
    0.006,
    STAGE_BOUNDS.frontZ + 0.35,
    -Math.PI / 2,
    0,
    0,
    scaledColor(WARM_GOLD, 0.3)
  );

  // Step lights helper
  const addStepLight = (x: number, y: number, z: number) => {
    addBox(mat.emissive, 0.2, 0.035, 0.012, x, y + 0.075, z - 0.006, {
      color: scaledColor(WARM_GOLD, 1),
    });
    addPlane(mat.glow, 1, 0.62, x, y + 0.005, z - 0.3, -Math.PI / 2, 0, 0, scaledColor(WARM_GOLD, 0.55));
    addPlane(mat.glow, 0.6, 0.24, x, y + 0.08, z - 0.009, 0, 0, 0, scaledColor(WARM_GOLD, 0.4));
  };

  const stepLightXs: number[] = [];
  for (let x = -5.75; x <= 5.76; x += 1.15) stepLightXs.push(x);

  // Tiered risers and aisle stairs
  TIER_STEPS.forEach((tier, idx) => {
    const prevY = idx === 0 ? 0 : TIER_STEPS[idx - 1].y;
    const depth = maxZ - tier.z;
    const centerZ = tier.z + depth / 2;
    const h = tier.y - prevY;
    addBox(mat.riser, hallW, h - 0.012, depth, 0, prevY + (h - 0.012) / 2, centerZ);
    addBox(mat.carpet, hallW, 0.012, depth, 0, tier.y - 0.006, centerZ, { uv: 0.4 });
    addBox(mat.plastic, hallW, 0.028, 0.045, 0, tier.y - 0.014, tier.z + 0.022);
    addBox(mat.emissive, hallW, 0.012, 0.012, 0, tier.y - 0.036, tier.z - 0.004, {
      color: scaledColor(WARM_GOLD, 0.75),
    });
    addBox(mat.emissive, hallW, 0.006, 0.014, 0, tier.y + 0.002, tier.z + 0.012, {
      color: scaledColor(WARM_GOLD, 0.55),
    });
    addPlane(mat.wash, hallW, 0.26, 0, tier.y - 0.17, tier.z - 0.007, 0, 0, 0, scaledColor(WARM_GOLD, 0.2));

    for (const lx of stepLightXs) {
      const ax = Math.abs(lx);
      if (!(ax > AISLE_STAIRS.inner - 0.15 && ax < AISLE_STAIRS.outer + 0.15)) {
        addStepLight(lx, prevY, tier.z);
      }
    }

    for (const sign of [-1, 1]) {
      const stairX = sign * ((AISLE_STAIRS.inner + AISLE_STAIRS.outer) / 2);
      const stairW = AISLE_STAIRS.outer - AISLE_STAIRS.inner;
      const midY = (prevY + tier.y) / 2;
      const stairCenterZ = tier.z - AISLE_STAIRS.depth / 2;
      const stairFrontZ = tier.z - AISLE_STAIRS.depth;
      addBox(
        mat.riser,
        stairW,
        midY - prevY - 0.012,
        AISLE_STAIRS.depth,
        stairX,
        prevY + (midY - prevY - 0.012) / 2,
        stairCenterZ
      );
      addBox(mat.carpet, stairW, 0.012, AISLE_STAIRS.depth, stairX, midY - 0.006, stairCenterZ, {
        uv: 0.4,
      });
      addBox(mat.plastic, stairW, 0.026, 0.04, stairX, midY - 0.013, stairFrontZ + 0.02);
      addBox(mat.emissive, stairW, 0.012, 0.012, stairX, midY - 0.034, stairFrontZ - 0.004, {
        color: scaledColor(WARM_GOLD, 0.85),
      });
      addBox(mat.emissive, stairW, 0.006, 0.014, stairX, midY + 0.002, stairFrontZ + 0.012, {
        color: scaledColor(WARM_GOLD, 0.55),
      });
      addStepLight(stairX - 0.35, prevY, stairFrontZ);
      addStepLight(stairX + 0.35, prevY, stairFrontZ);
      addStepLight(stairX, midY, tier.z);
    }
  });

  // 10 Premium Plush Seats (2 rows × 5 seats)
  const cupOuter = new THREE.CylinderGeometry(0.058, 0.058, 0.014, 16);
  const cupInner = new THREE.CylinderGeometry(0.045, 0.045, 0.016, 16);
  for (const row of SEAT_ROWS) {
    const ry = row.y;
    const rz = row.z;
    for (const sx of SEAT_X_COORDS) {
      addBox(mat.plastic, 0.8, 0.24, 0.62, sx, ry + 0.12, rz + 0.05);
      addBox(mat.seat, 0.78, 0.22, 0.08, sx, ry + 0.2, rz - 0.33, { round: 0.03 });
      addBox(mat.seat, 0.82, 0.2, 0.74, sx, ry + 0.36, rz - 0.02, { round: 0.06 });
      const tilt = 0.12;
      const backH = 0.84;
      addBox(
        mat.seat,
        0.84,
        backH,
        0.24,
        sx,
        ry + 0.42 + (Math.cos(tilt) * backH) / 2,
        rz + 0.36 + (Math.sin(tilt) * backH) / 2,
        { rx: tilt, round: 0.07 }
      );
      addBox(
        mat.seat,
        0.62,
        0.24,
        0.1,
        sx,
        ry + 0.42 + Math.cos(tilt) * 0.7 + Math.sin(tilt) * 0.17,
        rz + 0.36 + Math.sin(tilt) * 0.7 - Math.cos(tilt) * 0.17,
        { rx: tilt, round: 0.04 }
      );
      addBox(mat.plastic, 0.7, 0.34, 0.03, sx, ry + 0.34, rz + 0.495);
    }
    for (let i = 0; i <= SEAT_X_COORDS.length; i++) {
      const armX = SEAT_X_COORDS[0] - 0.575 + i * 1.15;
      addBox(mat.plastic, 0.16, 0.56, 0.8, armX, ry + 0.28, rz + 0.02, { round: 0.03 });
      addBox(mat.plastic, 0.19, 0.06, 0.86, armX, ry + 0.59, rz, { round: 0.025 });
      batch.add(cupOuter, mat.metal, composeMatrix(armX, ry + 0.622, rz - 0.27));
      batch.add(cupInner, mat.black, composeMatrix(armX, ry + 0.624, rz - 0.27));
    }
  }

  // Giant Curved IMAX Screen
  const screenCenterY = SCREEN_GEOMETRY.bottom + SCREEN_GEOMETRY.height / 2;
  const screenMat = new THREE.MeshBasicMaterial({
    map: movieTexture,
    toneMapped: false,
    fog: false,
  });
  const screenMesh = new THREE.Mesh(
    bendPlaneGeometry(
      new THREE.PlaneGeometry(SCREEN_GEOMETRY.width, SCREEN_GEOMETRY.height, 72, 1),
      SCREEN_GEOMETRY.radius
    ),
    screenMat
  );
  screenMesh.position.set(0, screenCenterY, SCREEN_GEOMETRY.z);
  root.add(screenMesh);

  batch.add(
    bendPlaneGeometry(
      new THREE.PlaneGeometry(SCREEN_GEOMETRY.width + 0.36, SCREEN_GEOMETRY.height + 0.3, 72, 1),
      SCREEN_GEOMETRY.radius
    ),
    mat.plastic,
    composeMatrix(0, screenCenterY, SCREEN_GEOMETRY.z - 0.03)
  );

  const haloMat = new THREE.MeshBasicMaterial({
    map: tex.soft,
    color: 0x000000,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const haloMesh = new THREE.Mesh(
    bendPlaneGeometry(
      new THREE.PlaneGeometry(SCREEN_GEOMETRY.width * 1.12, SCREEN_GEOMETRY.height * 1.35, 72, 1),
      SCREEN_GEOMETRY.radius
    ),
    haloMat
  );
  haloMesh.position.set(0, screenCenterY, SCREEN_GEOMETRY.z - 0.08);
  haloMesh.renderOrder = 2;
  root.add(haloMesh);

  const floorBounceMat = new THREE.MeshBasicMaterial({
    map: tex.cone,
    color: 0x000000,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  const floorBounce1 = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.5), floorBounceMat);
  floorBounce1.rotation.set(-Math.PI / 2, 0, Math.PI);
  floorBounce1.position.set(0, 0.008, STAGE_BOUNDS.frontZ + 3.75);
  floorBounce1.renderOrder = 2;
  root.add(floorBounce1);

  const floorBounce2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), floorBounceMat);
  floorBounce2.rotation.set(-Math.PI / 2, 0, Math.PI);
  floorBounce2.position.set(0, STAGE_BOUNDS.height + 0.006, STAGE_BOUNDS.frontZ - 0.8);
  floorBounce2.renderOrder = 2;
  root.add(floorBounce2);

  // Recessed ceiling lights
  const ceilDisc = new THREE.CircleGeometry(0.05, 12);
  const ceilRim = new THREE.CylinderGeometry(0.085, 0.085, 0.012, 14);
  for (const cx of [-5.2, -3.47, -1.73, 0, 1.73, 3.47, 5.2]) {
    for (const cz of [-7.4, -5.4, -3.4, -1.4, 0.6, 2.6, 4.6, 6.6]) {
      batch.add(ceilRim, mat.plastic, composeMatrix(cx, hallH - 0.006, cz));
      batch.add(ceilDisc, mat.emissive, composeMatrix(cx, hallH - 0.014, cz, Math.PI / 2, 0, 0), {
        color: scaledColor(0xfff0d6, 1),
      });
      addPlane(
        mat.glow,
        0.46,
        0.46,
        cx,
        hallH - 0.018,
        cz,
        Math.PI / 2,
        0,
        0,
        scaledColor(0xfff0d6, 0.42)
      );
    }
  }

  // Ceiling cove lighting along walls
  for (const side of ['L', 'R'] as const) {
    addWallBox(mat.emissive, side, midZ, hallH - 0.16, hallD, 0.022, 0.03, {
      color: scaledColor(WARM_GOLD, 0.7),
    });
    addWallPlane(
      mat.wash,
      side,
      midZ,
      hallH - 0.16 - 0.9,
      hallD,
      1.8,
      0.01,
      scaledColor(WARM_GOLD, 0.28)
    );
  }
  addWallBox(mat.emissive, 'B', 0, hallH - 0.16, hallW, 0.022, 0.03, {
    color: scaledColor(WARM_GOLD, 0.7),
  });
  addWallPlane(
    mat.wash,
    'B',
    0,
    hallH - 0.16 - 0.9,
    hallW,
    1.8,
    0.01,
    scaledColor(WARM_GOLD, 0.28)
  );

  // Wall light strips, sconces, surround speakers, exit signs, and posters
  const wallBaseY = (side: WallSide, along: number) =>
    side === 'B'
      ? TIER_STEPS[TIER_STEPS.length - 1].y
      : floorHeightAt(side === 'L' ? minX + 0.3 : maxX - 0.3, along);

  const addWallStrip = (side: WallSide, along: number) => {
    const y0 = wallBaseY(side, along) + 0.25;
    const y1 = 6.6;
    const h = y1 - y0;
    addWallBox(mat.emissive, side, along, (y0 + y1) / 2, 0.035, h, 0.03, {
      color: scaledColor(WARM_GOLD, 0.85),
    });
    addWallPlane(
      mat.strip,
      side,
      along,
      (y0 + y1) / 2,
      0.8,
      h + 0.35,
      0.01,
      scaledColor(WARM_GOLD, 0.42)
    );
  };

  const addWallSconce = (side: WallSide, along: number) => {
    const sy = wallBaseY(side, along) + 2.35;
    addWallBox(mat.plastic, side, along, sy, 0.2, 0.34, 0.13, { round: 0.02 });
    addWallBox(mat.emissive, side, along, sy + 0.176, 0.15, 0.012, 0.09, {
      color: scaledColor(WARM_GOLD, 1),
    });
    addWallBox(mat.emissive, side, along, sy - 0.176, 0.15, 0.012, 0.09, {
      color: scaledColor(WARM_GOLD, 1),
    });
    addWallPlane(
      mat.cone,
      side,
      along,
      sy + 0.17 + 0.8,
      1,
      1.6,
      0.011,
      scaledColor(WARM_GOLD, 0.55)
    );
    addWallPlane(
      mat.cone,
      side,
      along,
      sy - 0.17 - 0.6,
      0.9,
      1.2,
      0.011,
      scaledColor(WARM_GOLD, 0.42),
      Math.PI
    );
  };

  const addSpeaker = (side: WallSide, along: number) => {
    addWallBox(mat.plastic, side, along, 5.4, 0.5, 0.78, 0.34, { round: 0.03 });
    addWallBox(mat.black, side, along, 5.4, 0.42, 0.68, 0.01, { off: 0.34 });
  };

  const addExitSign = (side: WallSide, along: number, y: number) => {
    addWallBox(mat.plastic, side, along, y, 0.66, 0.31, 0.06);
    addWallPlane(mat.exit, side, along, y, 0.6, 0.262, 0.062);
    addWallPlane(mat.glow, side, along, y, 1.6, 1, 0.012, scaledColor(EXIT_GREEN, 0.5));
  };

  const addPoster = (side: WallSide, along: number, posterIdx: number) => {
    addWallBox(mat.plastic, side, along, 1.9, 1.14, 1.64, 0.08, { round: 0.015 });
    const pGeom = new THREE.PlaneGeometry(1, 1);
    const uv = pGeom.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, (posterIdx + uv.getX(i)) / 4);
    }
    const [wx, wz, ry] = wallCoords(side, along, 0.083);
    batch.add(pGeom, mat.posters, composeMatrix(wx, 1.9, wz, 0, ry, 0, 1, 1.5, 1));
    pGeom.dispose();
    addWallPlane(mat.glow, side, along, 1.9, 2.1, 2.7, 0.012, scaledColor(0xffe064, 0.2));
    addWallBox(mat.plastic, side, along, 2.9, 0.5, 0.04, 0.1);
    addWallBox(mat.emissive, side, along, 2.875, 0.44, 0.01, 0.06, {
      color: scaledColor(0xffefdc, 0.9),
    });
  };

  [-6.85, -4.75, -1.95, 1, 3.6, 6.2].forEach((z) => addWallStrip('L', z));
  [2.3, 4.9, 7.3].forEach((z) => addWallSconce('L', z));
  [-3.35, 0, 4.25].forEach((z) => addSpeaker('L', z));
  addPoster('L', -5.8, 0);
  addPoster('L', -1.05, 1);

  [-6.85, -4, -1.2, 1, 3.6, 5.5].forEach((z) => addWallStrip('R', z));
  [2.3, 4.6].forEach((z) => addWallSconce('R', z));
  [-3.35, 0, 4.25].forEach((z) => addSpeaker('R', z));
  addPoster('R', -5.45, 2);
  addPoster('R', -2.6, 3);

  [-5.4, -2.5, 2.5, 5.4].forEach((x) => addWallStrip('B', x));
  [-3.9, 3.9].forEach((x) => addWallSconce('B', x));

  // Left Entrance Double Doors + NOW SHOWING Marquee
  const doorZ = -3.35;
  const doorH = 2.45;
  const doorLeafW = 0.92;
  addBox(mat.plastic, 0.1, doorH + 0.16, doorLeafW * 2 + 0.24, minX + 0.05, (doorH + 0.16) / 2, doorZ);
  for (const sign of [-1, 1]) {
    const lz = doorZ + sign * (doorLeafW / 2 + 0.01);
    addBox(mat.door, 0.08, doorH, doorLeafW, minX + 0.12, doorH / 2, lz);
    addBox(mat.metal, 0.028, 0.62, 0.028, minX + 0.225, 1.12, doorZ + sign * 0.13);
    addBox(mat.metal, 0.07, 0.024, 0.024, minX + 0.19, 1.38, doorZ + sign * 0.13);
    addBox(mat.metal, 0.07, 0.024, 0.024, minX + 0.19, 0.86, doorZ + sign * 0.13);
    addBox(mat.metal, 0.01, 0.22, doorLeafW - 0.12, minX + 0.166, 0.13, lz);
  }
  addBox(mat.emissive, 0.02, 0.02, doorLeafW * 2 + 0.3, minX + 0.11, doorH + 0.17, doorZ, {
    color: scaledColor(WARM_GOLD, 0.9),
  });
  for (const sign of [-1, 1]) {
    addBox(
      mat.emissive,
      0.02,
      doorH + 0.17,
      0.02,
      minX + 0.11,
      (doorH + 0.17) / 2,
      doorZ + sign * (doorLeafW + 0.15),
      { color: scaledColor(WARM_GOLD, 0.9) }
    );
  }
  addPlane(
    mat.cone,
    2.8,
    2.6,
    minX + 0.176,
    doorH + 0.16 - 1.3,
    doorZ,
    0,
    Math.PI / 2,
    Math.PI,
    scaledColor(WARM_GOLD, 0.32)
  );
  addPlane(
    mat.glow,
    3,
    1.2,
    minX + 0.45,
    0.006,
    doorZ,
    -Math.PI / 2,
    0,
    Math.PI / 2,
    scaledColor(WARM_GOLD, 0.28)
  );
  addExitSign('L', doorZ, doorH + 0.42);
  addWallBox(mat.plastic, 'L', doorZ, 3.55, 2.5, 0.68, 0.1, { round: 0.02 });
  addWallPlane(mat.nowShowing, 'L', doorZ, 3.55, 2.36, 0.59, 0.103);
  addWallPlane(mat.glow, 'L', doorZ, 3.55, 4.4, 2, 0.012, scaledColor(WARM_GOLD, 0.55));

  // Right Rear Exit Door
  const exitDoorZ = 6.7;
  const rearY = TIER_STEPS[TIER_STEPS.length - 1].y;
  const exitDoorH = 2.3;
  const exitDoorW = 1.05;
  addWallBox(mat.plastic, 'R', exitDoorZ, rearY + (exitDoorH + 0.14) / 2, exitDoorW + 0.2, exitDoorH + 0.14, 0.1);
  addWallBox(mat.door, 'R', exitDoorZ, rearY + exitDoorH / 2, exitDoorW, exitDoorH, 0.08, { off: 0.04 });
  addWallBox(mat.metal, 'R', exitDoorZ, rearY + 1, exitDoorW - 0.22, 0.06, 0.05, { off: 0.12 });
  addWallBox(mat.emissive, 'R', exitDoorZ, rearY + exitDoorH + 0.16, exitDoorW + 0.26, 0.02, 0.02, {
    color: scaledColor(WARM_GOLD, 0.8),
    off: 0.1,
  });
  addExitSign('R', exitDoorZ, rearY + exitDoorH + 0.42);

  // Rear Projection Booth Windows & Projector Unit
  addWallBox(mat.plastic, 'B', 0, 5.45, 2.6, 1.5, 0.08);
  addWallBox(mat.boothGlass, 'B', 0, 5.45, 2.3, 1.22, 0.01, { off: 0.08 });
  for (const bx of [-2.5, 2.5]) {
    addWallBox(mat.plastic, 'B', bx, 5.45, 0.62, 0.48, 0.06);
    addWallBox(mat.boothGlass, 'B', bx, 5.45, 0.48, 0.34, 0.01, { off: 0.06 });
  }

  addBox(mat.plastic, 0.95, 0.5, 0.7, PROJECTOR_POS.x, PROJECTOR_POS.y + 0.03, 7.58, { round: 0.05 });
  for (let i = 0; i < 5; i++) {
    addBox(mat.black, 0.7, 0.012, 0.04, PROJECTOR_POS.x, PROJECTOR_POS.y + 0.285, 7.4 + i * 0.08);
  }
  addBox(mat.plastic, 0.5, 0.42, 0.25, PROJECTOR_POS.x, PROJECTOR_POS.y - 0.45, 7.86);

  const lensCyl = new THREE.CylinderGeometry(0.12, 0.145, 0.13, 20);
  batch.add(lensCyl, mat.metal, composeMatrix(PROJECTOR_POS.x, PROJECTOR_POS.y, 7.17, Math.PI / 2, 0, 0));
  batch.add(
    new THREE.CircleGeometry(0.1, 20),
    mat.emissive,
    composeMatrix(PROJECTOR_POS.x, PROJECTOR_POS.y, PROJECTOR_POS.z - 0.002, 0, Math.PI, 0),
    { color: scaledColor(0xe8f3ff, 1) }
  );
  addBox(mat.emissive, 0.02, 0.02, 0.01, PROJECTOR_POS.x + 0.36, PROJECTOR_POS.y + 0.12, 7.225, {
    color: scaledColor(0x40ff90, 1),
  });
  addBox(mat.emissive, 0.02, 0.02, 0.01, PROJECTOR_POS.x + 0.31, PROJECTOR_POS.y + 0.12, 7.225, {
    color: scaledColor(0x40a0ff, 1),
  });

  // Projector Lens Flare Sprite
  const flareSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex.radial,
      color: 0xcfe0ff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  flareSprite.position.set(PROJECTOR_POS.x, PROJECTOR_POS.y, PROJECTOR_POS.z - 0.05);
  flareSprite.scale.setScalar(1.2);
  flareSprite.renderOrder = 3;
  root.add(flareSprite);

  // Volumetric Projector Light Beam
  const beamEndZ = SCREEN_GEOMETRY.z + 0.45;
  const beamMinY = SCREEN_GEOMETRY.bottom + 0.1;
  const beamMaxY = SCREEN_GEOMETRY.bottom + SCREEN_GEOMETRY.height - 0.1;
  const beamHalfW = SCREEN_GEOMETRY.width / 2 - 0.35;
  const nearCorners = [
    [-0.07, -0.045],
    [0.07, -0.045],
    [0.07, 0.045],
    [-0.07, 0.045],
  ];
  const farCorners = [
    [-beamHalfW, beamMinY],
    [beamHalfW, beamMinY],
    [beamHalfW, beamMaxY],
    [-beamHalfW, beamMaxY],
  ];
  const beamPos: number[] = [];
  const beamT: number[] = [];
  const beamU: number[] = [];
  const nearPt = (idx: number) => [
    PROJECTOR_POS.x + nearCorners[idx][0],
    PROJECTOR_POS.y + nearCorners[idx][1],
    PROJECTOR_POS.z - 0.02,
  ];
  const farPt = (idx: number) => [farCorners[idx][0], farCorners[idx][1], beamEndZ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const tris: [number[], number, number][] = [
      [nearPt(i), 0, 0],
      [nearPt(j), 0, 1],
      [farPt(j), 1, 1],
      [nearPt(i), 0, 0],
      [farPt(j), 1, 1],
      [farPt(i), 1, 0],
    ];
    for (const [pt, tVal, uVal] of tris) {
      beamPos.push(pt[0], pt[1], pt[2]);
      beamT.push(tVal);
      beamU.push(uVal);
    }
  }
  const beamGeom = new THREE.BufferGeometry();
  beamGeom.setAttribute('position', new THREE.Float32BufferAttribute(beamPos, 3));
  beamGeom.setAttribute('aT', new THREE.Float32BufferAttribute(beamT, 1));
  beamGeom.setAttribute('aU', new THREE.Float32BufferAttribute(beamU, 1));
  beamGeom.computeVertexNormals();

  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(0.3, 0.32, 0.4) },
      uTime: { value: 0 },
      uIntensity: { value: 1.15 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beamMesh = new THREE.Mesh(beamGeom, beamMat);
  beamMesh.renderOrder = 3;
  beamMesh.frustumCulled = false;
  root.add(beamMesh);

  // Volumetric Dust Particles in Projector Beam
  const rng = mulberry32(5);
  const dustCount = opts.mobile ? 160 : 280;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    const t = 0.05 + Math.pow(rng(), 1.25) * 0.9;
    const cy = THREE.MathUtils.lerp(PROJECTOR_POS.y, (beamMinY + beamMaxY) / 2, t);
    const rx = THREE.MathUtils.lerp(0.07, beamHalfW, t) * 0.92;
    const ry = THREE.MathUtils.lerp(0.045, (beamMaxY - beamMinY) / 2, t) * 0.92;
    dustPositions[i * 3] = PROJECTOR_POS.x + (rng() * 2 - 1) * rx;
    dustPositions[i * 3 + 1] = cy + (rng() * 2 - 1) * ry;
    dustPositions[i * 3 + 2] = THREE.MathUtils.lerp(PROJECTOR_POS.z, beamEndZ, t);
    dustSeeds[i] = rng();
  }
  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeom.setAttribute('aSeed', new THREE.BufferAttribute(dustSeeds, 1));
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERTEX_SHADER,
    fragmentShader: DUST_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Color(0.5, 0.5, 0.6) },
      uTime: { value: 0 },
      uScale: { value: 24 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dustPoints = new THREE.Points(dustGeom, dustMat);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = 3;
  root.add(dustPoints);

  // Vintage Red & Gold Popcorn Machine with 120 Instanced Popcorn Kernels
  {
    const px = POPCORN_STAND.x;
    const pz = POPCORN_STAND.z;
    for (const dx of [-0.25, 0.25]) {
      for (const dz of [-0.26, 0.26]) {
        addBox(mat.plastic, 0.06, 0.08, 0.06, px + dx, 0.04, pz + dz);
      }
    }
    addBox(mat.red, 0.64, 0.78, 0.64, px, 0.47, pz, { round: 0.03 });
    addBox(mat.gold, 0.01, 0.46, 0.42, px + 0.322, 0.5, pz);
    addBox(mat.red, 0.012, 0.36, 0.32, px + 0.328, 0.5, pz);
    for (const dx of [-0.3, 0.3]) {
      for (const dz of [-0.3, 0.3]) {
        addBox(mat.red, 0.045, 0.66, 0.045, px + dx, 1.19, pz + dz);
      }
    }
    addBox(mat.red, 0.7, 0.1, 0.7, px, 1.57, pz, { round: 0.02 });
    addBox(mat.red, 0.5, 0.2, 0.5, px, 1.72, pz, { round: 0.02 });
    addPlane(mat.popcornSign, 0.62, 0.155, px + 0.356, 1.57, pz, 0, Math.PI / 2, 0);
    batch.add(new THREE.CylinderGeometry(0.11, 0.09, 0.12, 14), mat.metal, composeMatrix(px, 1.38, pz));
    addBox(mat.emissive, 0.3, 0.012, 0.3, px, 1.505, pz, { color: scaledColor(0xffd27a, 1) });
    addPlane(mat.glow, 1, 1, px + 0.33, 1.2, pz, 0, Math.PI / 2, 0, scaledColor(0xffc45a, 0.45));
    addPlane(mat.glow, 2, 2, px + 0.5, 0.006, pz, -Math.PI / 2, 0, 0, scaledColor(0xffa040, 0.32));
    addWallPlane(mat.glow, 'L', pz, 1.25, 2, 2.4, 0.012, scaledColor(0xffa040, 0.22));

    const kernelGeom = new THREE.BoxGeometry(0.048, 0.048, 0.048);
    const kernelMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x6a4a14 });
    const kernelCount = 120;
    const kernels = new THREE.InstancedMesh(kernelGeom, kernelMat, kernelCount);
    const kMat = new THREE.Matrix4();
    const kCol = new THREE.Color();
    const palette = [0xfff49c, 0xffe25a, 0xf5cf3a, 0xfffba8];
    for (let i = 0; i < kernelCount; i++) {
      const kx = (rng() * 2 - 1) * 0.25;
      const kz = (rng() * 2 - 1) * 0.25;
      const dome = Math.max(0.03, 0.2 - (kx * kx + kz * kz) * 1.6);
      const ky = 0.89 + rng() * dome;
      kMat.copy(composeMatrix(px + kx, ky, pz + kz, rng() * 3, rng() * 3, rng() * 3));
      kernels.setMatrixAt(i, kMat);
      kernels.setColorAt(i, kCol.setHex(palette[Math.floor(rng() * palette.length)]));
    }
    kernels.computeBoundingSphere();
    root.add(kernels);

    const glassCase = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.64, 0.6),
      new THREE.MeshBasicMaterial({
        color: 0xfff0cc,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      })
    );
    glassCase.position.set(px, 1.19, pz);
    glassCase.renderOrder = 2;
    root.add(glassCase);
  }

  batch.build(root);
  ceilDisc.dispose();
  ceilRim.dispose();
  cupOuter.dispose();
  cupInner.dispose();
  lensCyl.dispose();

  // Studio / Cinema Dynamic Lighting Rig
  const hemiLight = new THREE.HemisphereLight(0x323c5c, 0x1e0a0e, 1.25);
  scene.add(hemiLight);

  const screenPointLights = [-3.4, 0, 3.4].map((x) => {
    const pl = new THREE.PointLight(0xffffff, 0, 0, 1.25);
    pl.position.set(x, 3.9, -5.4);
    scene.add(pl);
    return pl;
  });

  const rearWarmLight = new THREE.PointLight(0xff9a55, 16, 0, 2);
  rearWarmLight.position.set(0, 4.3, 6.4);
  scene.add(rearWarmLight);

  const doorWarmLight = new THREE.PointLight(0xffa565, 5, 0, 2);
  doorWarmLight.position.set(-5.2, 3, -3.3);
  scene.add(doorWarmLight);

  const ambLight = new THREE.AmbientLight(0x000000, 1);
  scene.add(ambLight);

  const avgCol = new THREE.Color();
  const beamBaseCol = new THREE.Color(0.13, 0.145, 0.19);
  const dustBaseCol = new THREE.Color(0.26, 0.26, 0.32);
  const whiteCol = new THREE.Color(1, 1, 1);
  let lightsOut = 0;

  return {
    setStreaming(streaming: boolean) {
      screenMesh.visible = !streaming;
      beamMesh.visible = !streaming;
      dustPoints.visible = !streaming;
      flareSprite.visible = !streaming;
    },
    setLightsOut(val: number) {
      lightsOut = val;
    },
    update(elapsed: number, screenColors: THREE.Color[], dpr: number, dim: number) {
      const lo = lightsOut;
      const glowOp = (1 - 0.45 * dim) * (1 - lo);
      rearWarmLight.intensity = 16 * (1 - 0.55 * dim) * (1 - lo);
      doorWarmLight.intensity = 5 * (1 - 0.6 * dim) * (1 - lo);
      hemiLight.intensity = 1.25 * (1 - lo);

      mat.glow.opacity = glowOp;
      mat.strip.opacity = (1 - 0.55 * dim) * (1 - lo);
      mat.wash.opacity = (1 - 0.5 * dim) * (1 - lo);
      mat.cone.opacity = (1 - 0.55 * dim) * (1 - lo);
      mat.emissive.color.copy(whiteCol).multiplyScalar(1 - lo);
      mat.exit.color.setScalar(1 - lo);
      mat.nowShowing.color.setScalar(1 - lo);
      mat.popcornSign.color.setScalar(1 - lo);
      mat.posters.color.setScalar(0.85 * (1 - lo));

      for (let i = 0; i < 3; i++) {
        screenPointLights[i].color.copy(screenColors[i]);
        screenPointLights[i].intensity = 88 * (1 - 0.6 * lo);
      }

      avgCol
        .copy(screenColors[0])
        .add(screenColors[1])
        .add(screenColors[2])
        .multiplyScalar(1 / 3);
      ambLight.color.copy(avgCol).multiplyScalar(3.2 * (1 - 0.7 * lo));
      haloMat.color.copy(avgCol).multiplyScalar(1.5);
      floorBounceMat.color.copy(screenColors[1]).multiplyScalar(0.9);

      beamMat.uniforms.uColor.value.copy(avgCol).multiplyScalar(1.8).add(beamBaseCol);
      beamMat.uniforms.uTime.value = elapsed;

      dustMat.uniforms.uColor.value.copy(avgCol).multiplyScalar(2.2).add(dustBaseCol);
      dustMat.uniforms.uTime.value = elapsed;
      dustMat.uniforms.uScale.value = 26 * dpr;

      flareSprite.material.opacity = 0.9 + 0.1 * Math.sin(elapsed * 31);
    },
  };
}
