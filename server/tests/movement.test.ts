import assert from "node:assert/strict";
import { test } from "node:test";
import { clampToBounds, stepToward } from "../src/domain/movement.js";

// Tests unitarios de /domain: corren sin servidor, sin red, sin config.

void test("stepToward avanza en línea recta sin superar maxStep", () => {
  const next = stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 1);
  assert.equal(next.x, 1);
  assert.equal(next.z, 0);
});

void test("stepToward aterriza exacto en el objetivo cuando está cerca", () => {
  const next = stepToward({ x: 9.5, z: 0 }, { x: 10, z: 0 }, 1);
  assert.deepEqual(next, { x: 10, z: 0 });
});

void test("stepToward en diagonal respeta la magnitud del paso", () => {
  const next = stepToward({ x: 0, z: 0 }, { x: 30, z: 40 }, 5);
  assert.ok(Math.abs(Math.hypot(next.x, next.z) - 5) < 1e-9);
  // misma dirección que el objetivo (3-4-5)
  assert.ok(Math.abs(next.x - 3) < 1e-9);
  assert.ok(Math.abs(next.z - 4) < 1e-9);
});

void test("stepToward no se mueve si ya está en el objetivo", () => {
  const next = stepToward({ x: 2, z: 2 }, { x: 2, z: 2 }, 5);
  assert.deepEqual(next, { x: 2, z: 2 });
});

void test("stepToward con maxStep <= 0 no se mueve", () => {
  const from = { x: 1, z: 1 };
  assert.deepEqual(stepToward(from, { x: 9, z: 9 }, 0), from);
  assert.deepEqual(stepToward(from, { x: 9, z: 9 }, -1), from);
});

void test("clampToBounds encierra en el cuadrado", () => {
  assert.deepEqual(clampToBounds({ x: 50, z: -50 }, 20), { x: 20, z: -20 });
  assert.deepEqual(clampToBounds({ x: 3, z: -7 }, 20), { x: 3, z: -7 });
});
