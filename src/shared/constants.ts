export const GAME_NAME = "CORRE!";

export const ARENA = {
  halfWidth: 24,
  halfDepth: 24,
  floorY: 0,
  wallHeight: 4.8,
  playerRadius: 0.62,
  playerHeight: 1.8,
  obstacleClearance: 0.85,
} as const;

export const ROUND = {
  durationSeconds: 180,
  countdownSeconds: 4,
  tagDistance: 1.75,
  tagCooldownMs: 1800,
  respawnInvulnerabilityMs: 1800,
  maximumPlayers: 12,
  minimumPlayers: 2,
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

export const OBSTACLES = [
  { x: -9, z: -8, width: 4, depth: 3, height: 2.2, kind: "block" },
  { x: 8, z: -10, width: 3.2, depth: 5, height: 2.8, kind: "block" },
  { x: -1, z: -2, width: 5, depth: 2.4, height: 2.4, kind: "block" },
  { x: 11, z: 1, width: 2.6, depth: 5, height: 3.2, kind: "tree" },
  { x: -12, z: 5, width: 2.4, depth: 2.4, height: 3.1, kind: "tree" },
  { x: 1, z: 11, width: 5, depth: 2.4, height: 2.1, kind: "block" },
  { x: -5, z: 4, width: 3, depth: 3, height: 3.3, kind: "tree" },
  { x: 14, z: 11, width: 2.7, depth: 2.7, height: 3.6, kind: "tree" },
  { x: -15, z: -13, width: 2.5, depth: 2.5, height: 2.5, kind: "tree" },
  { x: 15, z: -15, width: 2.3, depth: 2.3, height: 3.2, kind: "tree" },
  { x: -15, z: 15, width: 2.8, depth: 2.8, height: 2.6, kind: "block" },
  { x: 0, z: -14, width: 2.5, depth: 2.5, height: 3.6, kind: "tree" },
] as const;

export const SPAWN_POINTS = [
  { x: -18, z: -17 },
  { x: 18, z: -17 },
  { x: -18, z: 17 },
  { x: 18, z: 17 },
  { x: 0, z: -19 },
  { x: 0, z: 19 },
  { x: -19, z: 0 },
  { x: 19, z: 0 },
  { x: -11, z: 18 },
  { x: 11, z: -18 },
  { x: -11, z: -18 },
  { x: 11, z: 18 },
] as const;

export const SOUND_SETTINGS = {
  masterVolume: 0.32,
  enabledByDefault: true,
} as const;
