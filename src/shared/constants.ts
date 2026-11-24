import type { ArenaRamp, PowerUpType } from "./types.ts";

export const GAME_NAME = "CORRE!";

export const ARENA = {
  halfWidth: 32,
  halfDepth: 32,
  floorY: 0,
  wallHeight: 4.8,
  playerRadius: 0.62,
  playerHeight: 1.8,
  obstacleClearance: 0.85,
} as const;

export const PARKOUR = {
  slideDurationMs: 760,
  slideSpeed: 12.5,
  slideHeight: 0.76,
  wallRunDurationMs: 2000,
  wallRunGravity: 5.5,
  wallRunSpeed: 10.5,
  vaultDurationMs: 360,
  vaultHeight: 1.08,
  slipstreamDistance: 7,
  slipstreamLateralDistance: 1.45,
  slipstreamWarmupMs: 1000,
  slipstreamBonus: 1.15,
} as const;

export const PLAYER_MOVEMENT = {
  walkSpeed: 7.1,
  sprintSpeed: 9.2,
  dashSpeed: 20,
} as const;

export const JUMP_PHYSICS = {
  velocity: 8.2,
  gravity: 22,
} as const;

export const MAX_JUMP_HEIGHT =
  JUMP_PHYSICS.velocity ** 2 / (2 * JUMP_PHYSICS.gravity);

export const ROUND = {
  durationSeconds: 180,
  countdownSeconds: 4,
  tagDistance: 1.75,
  tagCooldownMs: 1800,
  respawnInvulnerabilityMs: 1800,
  maximumPlayers: 12,
  minimumPlayers: 2,
  taggerPenaltySeconds: 25,
  tagTransferGraceMs: 3000,
} as const;

export const NETWORK = {
  sendInputIntervalMs: 48,
  stateInterpolationMs: 95,
  reconnectAttempts: 8,
  reconnectDelayMs: 700,
} as const;

export const PALETTE = {
  ink: "#131827",
  paper: "#f7f5ef",
  muted: "#a7adbd",
  mint: "#6df1c2",
  coral: "#ff756d",
  gold: "#ffc857",
  sky: "#76c9ff",
  violet: "#b59aff",
} as const;

export const POWER_UP_TYPES: readonly PowerUpType[] = [
  "speed",
  "jump",
  "invisibility",
  "freeze",
  "grapple",
  "shockwave",
  "ink",
  "gravity",
  "swap",
];

export const POWER_UP_LABELS: Record<PowerUpType, string> = {
  speed: "Corrida turbo",
  jump: "Pulo alto",
  invisibility: "Invisibilidade",
  freeze: "Bola de neve",
  grapple: "Rapel",
  shockwave: "Onda de choque",
  ink: "Granada de tinta",
  gravity: "Inversor de gravidade",
  swap: "Troca de corpo",
};

export const POWER_UP_COLORS: Record<PowerUpType, string> = {
  speed: PALETTE.gold,
  jump: PALETTE.sky,
  invisibility: PALETTE.violet,
  freeze: "#d9f6ff",
  grapple: PALETTE.coral,
  shockwave: "#ffab60",
  ink: "#353442",
  gravity: "#8e9cff",
  swap: "#fa86bb",
};

export const PLAYER_COLORS = [
  "#6df1c2",
  "#ff8c70",
  "#76c9ff",
  "#ffc857",
  "#c59aff",
  "#fa86bb",
  "#91e17c",
  "#ffbd80",
  "#7fe5e0",
  "#f28aef",
  "#abd0ff",
  "#e9e46c",
] as const;

export const BUILDING_ROOF_THICKNESS = 0.28;
export const ELEVATED_PLATFORM_THICKNESS = 0.28;

const BUILDINGS_BY_ZONE = {
  northwest: [
    { x: -25, z: -25, width: 10, depth: 10, height: 8.5, kind: "building" },
    { x: -26, z: -12, width: 8, depth: 10, height: 7, kind: "building" },
    { x: -12, z: -26, width: 10, depth: 8, height: 7.5, kind: "building" },
  ],
  northeast: [
    { x: 25, z: -25, width: 10, depth: 10, height: 10, kind: "building" },
    { x: 26, z: -12, width: 8, depth: 10, height: 7.5, kind: "building" },
    { x: 12, z: -26, width: 10, depth: 8, height: 8, kind: "building" },
  ],
  southwest: [
    { x: -25, z: 25, width: 10, depth: 10, height: 7.5, kind: "building" },
    { x: -26, z: 12, width: 8, depth: 10, height: 8, kind: "building" },
    { x: -12, z: 26, width: 10, depth: 8, height: 8.5, kind: "building" },
  ],
  southeast: [
    { x: 25, z: 25, width: 10, depth: 10, height: 9, kind: "building" },
    { x: 26, z: 12, width: 8, depth: 10, height: 8.5, kind: "building" },
    { x: 12, z: 26, width: 10, depth: 8, height: 7, kind: "building" },
  ],
} as const;

const BUILDING_LAYOUT = Object.values(BUILDINGS_BY_ZONE).flat();
const CENTER_BARRIER_LAYOUT = [
  { x: 0, z: -7, width: 2.8, depth: 0.9, height: 0.82, kind: "barrier" },
  { x: 0, z: 7, width: 2.8, depth: 0.9, height: 0.82, kind: "barrier" },
  { x: -7, z: 0, width: 0.9, depth: 2.8, height: 0.82, kind: "barrier" },
  { x: 7, z: 0, width: 0.9, depth: 2.8, height: 0.82, kind: "barrier" },
] as const;
const WALL_RUN_LAYOUT = [
  { x: -5.2, z: 0, width: 0.7, depth: 13, height: 4.2, kind: "wall" },
  { x: 5.2, z: 0, width: 0.7, depth: 13, height: 4.2, kind: "wall" },
] as const;
const OBSTACLE_LAYOUT = [
  ...BUILDING_LAYOUT,
  ...CENTER_BARRIER_LAYOUT,
  ...WALL_RUN_LAYOUT,
];

export const OBSTACLES = OBSTACLE_LAYOUT.map((obstacle) => ({
  ...obstacle,
  collisionHeight:
    obstacle.kind === "building"
      ? obstacle.height + BUILDING_ROOF_THICKNESS
      : obstacle.height,
}));

export const LADDER_CLIMB_SPEED = 3.2;
export const LADDER_WIDTH = 0.9;
export const LADDER_RUNG_SPACING = 0.32;
export const LADDER_TOP_EXTENSION = 0.55;

const LADDER_BUILDING_LOCATIONS = [
  { x: -26, z: -12 },
  { x: 26, z: 12 },
] as const;

export const BUILDING_LADDERS = LADDER_BUILDING_LOCATIONS.map(
  (location, index) => {
    const building = OBSTACLES.find(
      (obstacle) =>
        obstacle.kind === "building" &&
        obstacle.x === location.x &&
        obstacle.z === location.z,
    );
    if (!building) {
      throw new Error(
        `Não foi encontrado o prédio da escada em ${location.x}, ${location.z}.`,
      );
    }
    const directionX = Math.sign(building.x);
    const wallX = building.x - directionX * building.width / 2;
    const roofWidth = building.width + BUILDING_ROOF_THICKNESS;
    const roofDepth = building.depth + BUILDING_ROOF_THICKNESS;
    return {
      id: `building-ladder-${index + 1}`,
      x: wallX - directionX * 0.1,
      approachX: wallX - directionX * ARENA.playerRadius,
      wallX,
      z: building.z,
      directionX,
      width: LADDER_WIDTH,
      height: building.collisionHeight,
      roofX: building.x,
      roofZ: building.z,
      roofWidth,
      roofDepth,
      roofHeight: building.collisionHeight,
    };
  },
);

const BUILDING_ROOF_PLATFORMS = OBSTACLES.filter(
  (obstacle) => obstacle.kind === "building",
).map((building) => ({
  x: building.x,
  z: building.z,
  width: building.width + BUILDING_ROOF_THICKNESS,
  depth: building.depth + BUILDING_ROOF_THICKNESS,
  height: building.collisionHeight,
  kind: "roof" as const,
}));

const CLIMBABLE_OBJECTS_BY_ZONE = {
  northwest: [
    { x: -19, z: -15, width: 2.2, depth: 2, height: 0.38, kind: "concrete" },
    { x: -12, z: -19, width: 2, depth: 2, height: 0.76, kind: "crate" },
    { x: -19, z: -5, width: 1.9, depth: 1.9, height: 1.12, kind: "dumpster" },
  ],
  northeast: [
    { x: 19, z: -15, width: 1.8, depth: 1.8, height: 1.38, kind: "container" },
    { x: 12, z: -19, width: 2.2, depth: 2, height: 0.38, kind: "concrete" },
    { x: 19, z: -5, width: 2, depth: 2, height: 0.76, kind: "crate" },
  ],
  southwest: [
    { x: -19, z: 15, width: 2, depth: 2, height: 0.76, kind: "crate" },
    { x: -12, z: 19, width: 1.8, depth: 1.8, height: 1.38, kind: "container" },
    { x: -19, z: 5, width: 2.2, depth: 2, height: 0.38, kind: "concrete" },
  ],
  southeast: [
    { x: 19, z: 15, width: 1.9, depth: 1.9, height: 1.12, kind: "dumpster" },
    { x: 12, z: 19, width: 1.9, depth: 1.9, height: 1.12, kind: "dumpster" },
    { x: 19, z: 5, width: 2.2, depth: 2, height: 0.38, kind: "concrete" },
  ],
} as const;
const CLIMBABLE_OBJECTS = [
  ...Object.values(CLIMBABLE_OBJECTS_BY_ZONE).flat(),
  ...BUILDING_ROOF_PLATFORMS,
] as const;

export const VERTICAL_PLATFORMS = [
  { x: 0, z: -11, width: 40, depth: 3.6, height: 3 },
  { x: 0, z: 11, width: 40, depth: 3.6, height: 3 },
  { x: 0, z: -11, width: 40, depth: 3.6, height: 6 },
  { x: 0, z: 11, width: 40, depth: 3.6, height: 6 },
] as const;

export const CLIMBABLE_PLATFORMS = CLIMBABLE_OBJECTS;
export const ALL_CLIMBABLE_PLATFORMS = [
  ...CLIMBABLE_OBJECTS,
  ...VERTICAL_PLATFORMS.map((platform) => ({
    ...platform,
    kind: "deck" as const,
  })),
];

export const ARENA_RAMPS: readonly ArenaRamp[] = [
  {
    id: "lower-north",
    x: -14,
    z: 0,
    width: 3.2,
    depth: 20,
    axis: "z",
    direction: -1,
    startY: 0,
    endY: 3,
  },
  {
    id: "lower-south",
    x: 14,
    z: 0,
    width: 3.2,
    depth: 20,
    axis: "z",
    direction: 1,
    startY: 0,
    endY: 3,
  },
  {
    id: "upper-north",
    x: -20,
    z: 0,
    width: 3,
    depth: 20,
    axis: "z",
    direction: -1,
    startY: 3,
    endY: 6,
  },
  {
    id: "upper-south",
    x: 20,
    z: 0,
    width: 3,
    depth: 20,
    axis: "z",
    direction: 1,
    startY: 3,
    endY: 6,
  },
] as const;

export const SPAWN_POINTS = [
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: -10, z: 10 },
  { x: 10, z: 10 },
  { x: 0, z: -15 },
  { x: 0, z: 15 },
  { x: -15, z: 0 },
  { x: 15, z: 0 },
  { x: -17, z: -8 },
  { x: 17, z: 8 },
  { x: -8, z: 17 },
  { x: 8, z: -17 },
] as const;

export const SOUND_SETTINGS = {
  masterVolume: 0.32,
  backgroundMusicVolume: 0.024,
  backgroundMusicBeatSeconds: 0.68,
  enabledByDefault: true,
} as const;
