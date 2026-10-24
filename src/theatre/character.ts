import * as THREE from 'three';
import { makeCharacterTexture, makeContactShadowTexture } from './textures';

const PIXEL_SCALE = 0.056;

function applyBoxUVs(
  geom: THREE.BoxGeometry,
  u0: number,
  v0: number,
  w: number,
  h: number,
  d: number
) {
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  const pad = 0.02;
  const rect = (x: number, y: number, rw: number, rh: number): [number, number, number, number] => [
    (x + pad) / 64,
    1 - (y + pad) / 64,
    (x + rw - pad) / 64,
    1 - (y + rh - pad) / 64,
  ];
  const faces = [
    rect(u0 + d + w, v0 + d, d, h),
    rect(u0, v0 + d, d, h),
    rect(u0 + d, v0, w, d),
    rect(u0 + d + w, v0, w, d),
    rect(u0 + d, v0 + d, w, h),
    rect(u0 + d + w + d, v0 + d, w, h),
  ];
  for (let f = 0; f < 6; f++) {
    const [x1, y1, x2, y2] = faces[f];
    uv.setXY(f * 4 + 0, x1, y1);
    uv.setXY(f * 4 + 1, x2, y1);
    uv.setXY(f * 4 + 2, x1, y2);
    uv.setXY(f * 4 + 3, x2, y2);
  }
  uv.needsUpdate = true;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class CharacterRig {
  root = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  shadow: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
  amp = 0;

  constructor() {
    const tex = makeCharacterTexture();
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.16,
    });

    const makePart = (
      w: number,
      h: number,
      d: number,
      u0: number,
      v0: number,
      offsetY: number
    ) => {
      const geom = new THREE.BoxGeometry(w * PIXEL_SCALE, h * PIXEL_SCALE, d * PIXEL_SCALE);
      applyBoxUVs(geom, u0, v0, w, h, d);
      geom.translate(0, offsetY, 0);
      return new THREE.Mesh(geom, mat);
    };

    this.root.add(this.hips);
    this.hips.position.y = 12 * PIXEL_SCALE;

    this.legL.position.set(2 * PIXEL_SCALE, 0, 0);
    this.legL.add(makePart(4, 12, 4, 0, 16, -6 * PIXEL_SCALE));

    this.legR.position.set(-2 * PIXEL_SCALE, 0, 0);
    this.legR.add(makePart(4, 12, 4, 0, 16, -6 * PIXEL_SCALE));

    this.hips.add(this.legL, this.legR, this.torso);
    this.torso.add(makePart(8, 12, 4, 16, 16, 6 * PIXEL_SCALE));

    this.head.position.y = 12 * PIXEL_SCALE;
    this.head.add(makePart(8, 8, 8, 0, 0, 4 * PIXEL_SCALE));
    this.torso.add(this.head);

    this.armL.position.set(6 * PIXEL_SCALE, 10 * PIXEL_SCALE, 0);
    this.armL.add(makePart(4, 12, 4, 40, 16, -4 * PIXEL_SCALE));

    this.armR.position.set(-6 * PIXEL_SCALE, 10 * PIXEL_SCALE, 0);
    this.armR.add(makePart(4, 12, 4, 40, 16, -4 * PIXEL_SCALE));

    this.torso.add(this.armL, this.armR);

    this.shadowMat = new THREE.MeshBasicMaterial({
      map: makeContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
  }

  update(dt: number, elapsed: number, walkPhase: number, speedNorm: number, sitBlend: number) {
    const targetAmp = speedNorm > 0.04 ? Math.min(1, speedNorm) : 0;
    this.amp += (targetAmp - this.amp) * (1 - Math.exp(-dt * 10));

    const p = sitBlend;
    const swing = Math.sin(walkPhase) * this.amp;
    const legSwing = swing * 0.85;
    const armSwing = swing * 0.72;
    const idleFactor = (1 - this.amp) * (1 - p);
    const breath = Math.sin(elapsed * 1.8);

    this.legL.rotation.x = lerp(-legSwing, -1.5, p);
    this.legR.rotation.x = lerp(legSwing, -1.5, p);
    this.legL.rotation.z = lerp(0, 0.07, p);
    this.legR.rotation.z = lerp(0, -0.07, p);

    this.armL.rotation.x = lerp(armSwing, -0.62, p);
    this.armR.rotation.x = lerp(-armSwing, -0.62, p);

    const armZ = 0.045 + 0.025 * breath * idleFactor;
    this.armL.rotation.z = lerp(armZ, 0.12, p);
    this.armR.rotation.z = lerp(-armZ, -0.12, p);

    const bob = (Math.abs(Math.cos(walkPhase)) - 0.5) * 0.045 * this.amp;
    this.hips.position.y = lerp(12 * PIXEL_SCALE + bob, 0.575, p);
    this.torso.rotation.x = lerp(0.06 * this.amp, -0.1, p);
    this.head.rotation.x = lerp(0.015 * breath * idleFactor, -0.06, p);
    this.head.rotation.y = lerp(Math.sin(elapsed * 0.45) * 0.12 * idleFactor, 0, p);
    this.shadowMat.opacity = 1 - p * 0.9;
  }
}
