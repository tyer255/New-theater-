export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Box2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface SeatDef {
  id: number;
  label: string;
  rowName: string;
  seatNumber: number;
  x: number;
  y: number;
  z: number;
  sitPos: Vec3;
  standPos: Vec3;
}

export const HALL_BOUNDS = {
  minX: -6.5,
  maxX: 6.5,
  minZ: -9,
  maxZ: 8,
  height: 7.8,
} as const;

export const STAGE_BOUNDS = {
  frontZ: -7,
  height: 0.45,
} as const;

export const TIER_STEPS = [
  { z: 0.5, y: 0.45 },
  { z: 2.9, y: 0.9 },
  { z: 5.3, y: 1.35 },
] as const;

export const AISLE_STAIRS = {
  inner: 3.35,
  outer: 4.65,
  depth: 0.6,
} as const;

export const SEAT_X_COORDS = [-2.3, -1.15, 0, 1.15, 2.3] as const;

export const SEAT_ROWS = [
  { name: 'A', z: 1.95, y: 0.45 },
  { name: 'B', z: 4.35, y: 0.9 },
] as const;

export const SCREEN_GEOMETRY = {
  width: 10.8,
  height: 5.9,
  bottom: 0.9,
  z: -8.55,
  radius: 15,
} as const;

export const POPCORN_STAND = {
  x: -6.08,
  z: -0.05,
} as const;

export const PROJECTOR_POS: Vec3 = {
  x: 0,
  y: 5.42,
  z: 7.12,
};

export const SPAWN_POSE = {
  pos: { x: -4, y: 0.9, z: 3.7 },
  yaw: Math.PI,
} as const;

export const SEATS: SeatDef[] = [];
SEAT_ROWS.forEach((row, rIdx) => {
  SEAT_X_COORDS.forEach((x, sIdx) => {
    SEATS.push({
      id: rIdx * SEAT_X_COORDS.length + sIdx,
      label: `Row ${row.name} · Seat ${sIdx + 1}`,
      rowName: row.name,
      seatNumber: sIdx + 1,
      x,
      y: row.y,
      z: row.z,
      sitPos: { x, y: row.y, z: row.z + 0.13 },
      standPos: { x, y: row.y, z: row.z - 0.86 },
    });
  });
});

export const COLLISION_BOXES: Box2D[] = [
  ...SEAT_ROWS.map((row) => ({
    minX: -2.98,
    maxX: 2.98,
    minZ: row.z - 0.42,
    maxZ: row.z + 0.5,
  })),
  {
    minX: POPCORN_STAND.x - 0.38,
    maxX: POPCORN_STAND.x + 0.38,
    minZ: POPCORN_STAND.z - 0.36,
    maxZ: POPCORN_STAND.z + 0.36,
  },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function smoothstep01(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + shortestAngleDelta(current, target) * (1 - Math.exp(-lambda * dt));
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngleDelta(from, to) * t;
}

export function floorHeightAt(x: number, z: number): number {
  let h = 0;
  for (const step of TIER_STEPS) {
    if (z >= step.z) h = step.y;
  }
  const absX = Math.abs(x);
  if (absX >= AISLE_STAIRS.inner && absX <= AISLE_STAIRS.outer) {
    for (let i = 0; i < TIER_STEPS.length; i++) {
      const step = TIER_STEPS[i];
      const prevY = i === 0 ? 0 : TIER_STEPS[i - 1].y;
      if (z >= step.z - AISLE_STAIRS.depth && z < step.z) {
        h = (prevY + step.y) / 2;
      }
    }
  }
  return h;
}

export function findNearestSeat(pos: Vec3, maxDist = 1.05): SeatDef | null {
  let nearest: SeatDef | null = null;
  let bestDist = maxDist;
  for (const seat of SEATS) {
    const d = Math.hypot(pos.x - seat.x, pos.z - (seat.z - 0.62));
    if (d < bestDist && Math.abs(pos.y - seat.y) < 0.3) {
      bestDist = d;
      nearest = seat;
    }
  }
  return nearest;
}

export function resolveCollisions(pos: { x: number; z: number }, radius = 0.3): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const box of COLLISION_BOXES) {
      const cx = clamp(pos.x, box.minX, box.maxX);
      const cz = clamp(pos.z, box.minZ, box.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = (radius - dist) / dist;
          pos.x += dx * push;
          pos.z += dz * push;
        } else {
          const dLeft = pos.x - box.minX;
          const dRight = box.maxX - pos.x;
          const dFront = pos.z - box.minZ;
          const dBack = box.maxZ - pos.z;
          const m = Math.min(dLeft, dRight, dFront, dBack);
          if (m === dLeft) pos.x = box.minX - radius;
          else if (m === dRight) pos.x = box.maxX + radius;
          else if (m === dFront) pos.z = box.minZ - radius;
          else pos.z = box.maxZ + radius;
        }
      }
    }
    pos.x = clamp(pos.x, HALL_BOUNDS.minX + radius, HALL_BOUNDS.maxX - radius);
    pos.z = clamp(pos.z, STAGE_BOUNDS.frontZ + radius, HALL_BOUNDS.maxZ - radius);
  }
}

export function computeCameraBoomDistance(
  origin: Vec3,
  dir: Vec3,
  desiredDist: number
): number {
  let dist = desiredDist;
  const margin = 0.3;
  const minX = HALL_BOUNDS.minX + margin;
  const maxX = HALL_BOUNDS.maxX - margin;
  const minZ = STAGE_BOUNDS.frontZ - 0.4;
  const maxZ = HALL_BOUNDS.maxZ - margin;
  const maxY = HALL_BOUNDS.height - 0.3;

  if (dir.x > 1e-5) dist = Math.min(dist, (maxX - origin.x) / dir.x);
  else if (dir.x < -1e-5) dist = Math.min(dist, (minX - origin.x) / dir.x);

  if (dir.z > 1e-5) dist = Math.min(dist, (maxZ - origin.z) / dir.z);
  else if (dir.z < -1e-5) dist = Math.min(dist, (minZ - origin.z) / dir.z);

  if (dir.y > 1e-5) dist = Math.min(dist, (maxY - origin.y) / dir.y);

  return Math.max(0.4, dist);
}

export function getChordScreenDimensions() {
  const w = SCREEN_GEOMETRY.width + 0.36;
  const h = SCREEN_GEOMETRY.height + 0.3;
  const halfAngle = w / 2 / SCREEN_GEOMETRY.radius;
  return {
    w: 2 * SCREEN_GEOMETRY.radius * Math.sin(halfAngle),
    h,
    y: SCREEN_GEOMETRY.bottom + SCREEN_GEOMETRY.height / 2,
    z: SCREEN_GEOMETRY.z + SCREEN_GEOMETRY.radius * (1 - Math.cos(halfAngle)),
  };
}

export function normalizeSearchTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function scoreTitleMatch(candidate: string, query: string): number {
  if (!query) return 50;
  const c = normalizeSearchTitle(candidate);
  const q = normalizeSearchTitle(query);
  if (!c || !q) return 0;
  if (c === q) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 80;
  if (c.includes(q) || q.includes(c)) return 60;
  const words = q.split(' ').filter((w) => w.length > 2);
  return words.length && words.every((w) => c.includes(w)) ? 45 : 0;
}
