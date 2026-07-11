/**
 * Movimiento en el plano XZ. Lógica pura: sin I/O, sin Colyseus, sin red.
 * Los números (velocidad, límites) entran como parámetros desde config.
 */

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/**
 * Avanza `current` hacia `target` como máximo `maxStep` unidades.
 * Si el objetivo está a menos de `maxStep`, aterriza exacto en el objetivo
 * (sin oscilar alrededor). `maxStep <= 0` no mueve.
 */
export function stepToward(current: Vec2, target: Vec2, maxStep: number): Vec2 {
  if (maxStep <= 0) return current;
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxStep) return target;
  const k = maxStep / dist;
  return { x: current.x + dx * k, z: current.z + dz * k };
}

/** Encierra un punto dentro del cuadrado [-halfExtent, +halfExtent] en X y Z. */
export function clampToBounds(p: Vec2, halfExtent: number): Vec2 {
  return {
    x: Math.min(halfExtent, Math.max(-halfExtent, p.x)),
    z: Math.min(halfExtent, Math.max(-halfExtent, p.z)),
  };
}
