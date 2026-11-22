import { ARENA, OBSTACLES } from "./constants.ts";
import type { Vector2 } from "./types.ts";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distanceSquared(
  first: Vector2,
  second: Vector2,
): number {
  const dx = first.x - second.x;
  const dz = first.z - second.z;
  return dx * dx + dz * dz;
}

export function distance(first: Vector2, second: Vector2): number {
  return Math.sqrt(distanceSquared(first, second));
}

export function normalizeVector(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.z);
  if (length === 0) {
    return { x: 0, z: 0 };
  }
  return { x: vector.x / length, z: vector.z / length };
}

export function wrapAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export function shortestAngle(
  from: number,
  to: number,
  amount: number,
): number {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
}

export function approach(
  current: number,
  target: number,
  amount: number,
): number {
  if (current < target) {
    return Math.min(current + amount, target);
  }
  return Math.max(current - amount, target);
}

export function circleIntersectsRectangle(
  point: Vector2,
  radius: number,
  rectangle: {
    x: number;
    z: number;
    width: number;
    depth: number;
  },
): boolean {
  const nearestX = clamp(
    point.x,
    rectangle.x - rectangle.width / 2,
    rectangle.x + rectangle.width / 2,
  );
  const nearestZ = clamp(
    point.z,
    rectangle.z - rectangle.depth / 2,
    rectangle.z + rectangle.depth / 2,
  );
  const dx = point.x - nearestX;
  const dz = point.z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

export function resolveArenaPosition(
  start: Vector2,
  movement: Vector2,
  radius = ARENA.playerRadius,
): Vector2 {
  const next = {
    x: clamp(
      start.x + movement.x,
      -ARENA.halfWidth + radius,
      ARENA.halfWidth - radius,
    ),
    z: clamp(
      start.z + movement.z,
      -ARENA.halfDepth + radius,
      ARENA.halfDepth - radius,
    ),
  };

  for (const obstacle of OBSTACLES) {
    const expanded = {
      x: obstacle.x,
      z: obstacle.z,
      width: obstacle.width + radius * 2,
      depth: obstacle.depth + radius * 2,
    };
    if (!circleIntersectsRectangle(next, 0, expanded)) {
      continue;
    }

    const overlapX = expanded.width / 2 - Math.abs(next.x - obstacle.x);
    const overlapZ = expanded.depth / 2 - Math.abs(next.z - obstacle.z);
    if (overlapX < overlapZ) {
      next.x = obstacle.x + Math.sign(next.x - obstacle.x) * expanded.width / 2;
    } else {
      next.z = obstacle.z + Math.sign(next.z - obstacle.z) * expanded.depth / 2;
    }
  }

  return next;
}

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function formatCompactCount(value: number): string {
  if (value < 1000) {
    return String(Math.max(0, Math.floor(value)));
  }
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
}

export function pick<T>(items: readonly T[], index: number): T {
  if (items.length === 0) {
    throw new Error("Não é possível escolher um item de uma lista vazia.");
  }
  const safeIndex = ((index % items.length) + items.length) % items.length;
  return items[safeIndex]!;
}

export function roundTo(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function samePosition(
  first: Vector2,
  second: Vector2,
  threshold = 0.001,
): boolean {
  return distanceSquared(first, second) <= threshold * threshold;
}

export function lerp(
  from: number,
  to: number,
  amount: number,
): number {
  return from + (to - from) * clamp(amount, 0, 1);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
