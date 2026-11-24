import {
  ARENA_RAMPS,
  ARENA,
  ALL_CLIMBABLE_PLATFORMS,
  OBSTACLES,
  ELEVATED_PLATFORM_THICKNESS,
} from "./constants.ts";
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
  return dx * dx + dz * dz <= radius * radius;
}

function pushCircleOutOfRectangle(
  point: Vector2,
  radius: number,
  rectangle: { x: number; z: number; width: number; depth: number },
): Vector2 {
  const minX = rectangle.x - rectangle.width / 2;
  const maxX = rectangle.x + rectangle.width / 2;
  const minZ = rectangle.z - rectangle.depth / 2;
  const maxZ = rectangle.z + rectangle.depth / 2;
  const nearestX = clamp(point.x, minX, maxX);
  const nearestZ = clamp(point.z, minZ, maxZ);
  const dx = point.x - nearestX;
  const dz = point.z - nearestZ;
  const distanceSquared = dx * dx + dz * dz;
  const isInside =
    point.x >= minX &&
    point.x <= maxX &&
    point.z >= minZ &&
    point.z <= maxZ;

  if (!isInside && distanceSquared >= radius * radius) {
    return point;
  }
  if (!isInside && distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared);
    const correction = (radius - distance) / distance;
    return {
      x: point.x + dx * correction,
      z: point.z + dz * correction,
    };
  }

  const exits = [
    { distance: point.x - minX + radius, x: minX - radius, axis: "x" },
    { distance: maxX - point.x + radius, x: maxX + radius, axis: "x" },
    { distance: point.z - minZ + radius, z: minZ - radius, axis: "z" },
    { distance: maxZ - point.z + radius, z: maxZ + radius, axis: "z" },
  ];
  const exit = exits.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest,
  );
  return exit.axis === "x"
    ? { x: exit.x!, z: point.z }
    : { x: point.x, z: exit.z! };
}

export function rampHeightAt(x: number, z: number): number | null {
  for (const ramp of ARENA_RAMPS) {
    const along = ramp.axis === "x" ? x : z;
    const across = ramp.axis === "x" ? z : x;
    const alongCenter = ramp.axis === "x" ? ramp.x : ramp.z;
    const acrossCenter = ramp.axis === "x" ? ramp.z : ramp.x;
    const alongLength = ramp.axis === "x" ? ramp.width : ramp.depth;
    const acrossWidth = ramp.axis === "x" ? ramp.depth : ramp.width;
    if (
      Math.abs(across - acrossCenter) > acrossWidth / 2 ||
      Math.abs(along - alongCenter) > alongLength / 2
    ) {
      continue;
    }
    const normalized = (along - (alongCenter - alongLength / 2)) / alongLength;
    const progress = ramp.direction === 1 ? normalized : 1 - normalized;
    return ramp.startY + (ramp.endY - ramp.startY) * progress;
  }
  return null;
}

export function resolveArenaPosition(
  start: Vector2,
  movement: Vector2,
  radius = ARENA.playerRadius,
  playerY = 0,
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

  for (let pass = 0; pass < 3; pass += 1) {
    for (const obstacle of OBSTACLES) {
      if (playerY >= obstacle.collisionHeight - 0.02) {
        continue;
      }
      const resolved = pushCircleOutOfRectangle(next, radius, obstacle);
      next.x = resolved.x;
      next.z = resolved.z;
    }

    for (const platform of ALL_CLIMBABLE_PLATFORMS) {
      if (
        platform.kind === "roof" ||
        playerY >= platform.height - 0.02 ||
        (platform.kind === "deck" &&
          playerY + ARENA.playerHeight <=
            platform.height - ELEVATED_PLATFORM_THICKNESS + 0.02)
      ) {
        continue;
      }
      const resolved = pushCircleOutOfRectangle(next, radius, platform);
      next.x = resolved.x;
      next.z = resolved.z;
    }
  }

  next.x = clamp(next.x, -ARENA.halfWidth + radius, ARENA.halfWidth - radius);
  next.z = clamp(next.z, -ARENA.halfDepth + radius, ARENA.halfDepth - radius);
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
