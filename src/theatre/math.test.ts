import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEATS,
  floorHeightAt,
  findNearestSeat,
  resolveCollisions,
  computeCameraBoomDistance,
  scoreTitleMatch,
  shortestAngleDelta,
} from './math';

test('theatre defines 10 seats across 2 rows of 5', () => {
  assert.equal(SEATS.length, 10);
  assert.equal(SEATS[0].label, 'Row A · Seat 1');
  assert.equal(SEATS[4].label, 'Row A · Seat 5');
  assert.equal(SEATS[5].label, 'Row B · Seat 1');
  assert.equal(SEATS[9].label, 'Row B · Seat 5');
});

test('floorHeightAt calculates tiered risers and intermediate stair steps', () => {
  assert.equal(floorHeightAt(0, -2), 0);
  assert.equal(floorHeightAt(0, 1.0), 0.45);
  assert.equal(floorHeightAt(0, 3.5), 0.9);
  assert.equal(floorHeightAt(0, 6.0), 1.35);
  // Intermediate stair step in aisle
  assert.equal(floorHeightAt(4.0, 0.2), 0.225);
});

test('findNearestSeat detects seat when standing directly in front of it', () => {
  const targetSeat = SEATS[2]; // Row A Seat 3 at x=0, y=0.45, z=1.95
  const near = findNearestSeat({ x: 0.05, y: 0.45, z: targetSeat.z - 0.55 });
  assert.ok(near);
  assert.equal(near.id, targetSeat.id);

  const far = findNearestSeat({ x: -5, y: 0, z: -5 });
  assert.equal(far, null);
});

test('resolveCollisions pushes avatar outside seat rows and clamps to hall bounds', () => {
  const pos = { x: 0, z: 1.95 }; // Inside Row A collision box
  resolveCollisions(pos, 0.3);
  assert.ok(pos.z <= 1.95 - 0.42 - 0.29 || pos.z >= 1.95 + 0.5 + 0.29);

  const outOfBounds = { x: 99, z: -99 };
  resolveCollisions(outOfBounds, 0.3);
  assert.equal(outOfBounds.x, 6.2);
  assert.equal(outOfBounds.z, -6.7);
});

test('computeCameraBoomDistance clips camera against rear wall', () => {
  const d = computeCameraBoomDistance({ x: 0, y: 2, z: 6.5 }, { x: 0, y: 0, z: 1 }, 4.0);
  assert.ok(d < 1.5 && d >= 0.4);
});

test('scoreTitleMatch ranks exact, prefix, and substring matches accurately', () => {
  assert.equal(scoreTitleMatch('Interstellar', 'interstellar'), 100);
  assert.equal(scoreTitleMatch('Interstellar: IMAX Edition', 'interstellar'), 80);
  assert.equal(scoreTitleMatch('The Making of Interstellar', 'interstellar'), 60);
  assert.equal(scoreTitleMatch('Dune Part Two', 'Avatar'), 0);
});

test('shortestAngleDelta wraps angles within [-PI, PI]', () => {
  const d = shortestAngleDelta(Math.PI * 0.9, -Math.PI * 0.9);
  assert.ok(Math.abs(d - Math.PI * 0.2) < 1e-6);
});
