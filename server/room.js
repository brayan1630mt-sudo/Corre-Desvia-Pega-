import {
  ARENA,
  ALL_CLIMBABLE_PLATFORMS,
  BUILDING_LADDERS,
  ELEVATED_PLATFORM_THICKNESS,
  JUMP_PHYSICS,
  LADDER_CLIMB_SPEED,
  OBSTACLES,
  PARKOUR,
  PLAYER_MOVEMENT,
  PLAYER_COLORS,
  POWER_UP_LABELS,
  POWER_UP_TYPES,
  ROUND,
  SPAWN_POINTS,
} from "../src/shared/constants.ts";
import {
  circleIntersectsRectangle,
  rampHeightAt,
  resolveArenaPosition,
} from "../src/shared/math.ts";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NAME_LIMIT = 18;
const ROOM_CODE_LENGTH = 5;
const MAX_INPUT_MAGNITUDE = 1;
const PLAYER_SPEED = PLAYER_MOVEMENT.walkSpeed;
const SPRINT_SPEED = PLAYER_MOVEMENT.sprintSpeed;
const DASH_SPEED = PLAYER_MOVEMENT.dashSpeed;
const DASH_DURATION_MS = 180;
const DASH_COOLDOWN_MS = 2200;
const JUMP_VELOCITY = JUMP_PHYSICS.velocity;
const GRAVITY = JUMP_PHYSICS.gravity;
const TAG_VERTICAL_TOLERANCE = 0.9;
const POWER_UP_SPAWN_DELAY_MS = 8000;
const POWER_UP_RESPAWN_DELAY_MS = 12000;
const POWER_UP_LIFETIME_MS = 11000;
const POWER_UP_EFFECT_DURATION_MS = 7000;
const POWER_UP_PICKUP_DISTANCE = 1.4;
const POWER_UP_SPEED_MULTIPLIER = 1.45;
const POWER_UP_JUMP_MULTIPLIER = 1.5;
const INVISIBILITY_DURATION_MS = 7000;
const FREEZE_DURATION_MS = 3000;
const SNOWBALL_SPEED = 22;
const SNOWBALL_LIFETIME_MS = 1500;
const SNOWBALL_RADIUS = 0.24;
const GRAPPLE_MAX_RANGE = 24;
const GRAPPLE_PULL_SPEED = 25;
const GRAPPLE_TIMEOUT_MS = 2600;
const GRAPPLE_REACH_DISTANCE = 0.8;
const GRAPPLE_CARRY_SPEED = 11;
const SHOCKWAVE_RADIUS = 6.5;
const SHOCKWAVE_HORIZONTAL_IMPULSE = 13;
const SHOCKWAVE_VERTICAL_IMPULSE = 8.5;
const INK_RADIUS = 4.5;
const INK_DURATION_MS = 3000;
const INK_SPEED = 18;
const GRAVITY_DURATION_MS = 4000;
const GRAVITY_MULTIPLIER = 0.32;
const SWAP_MAX_RANGE = 28;
const SLIDE_PLAYER_RADIUS = 0.48;
const PLAYER_EYE_HEIGHT = 1.57;
const RAMP_SUPPORT_TOLERANCE = 0.18;
const FIRST_TAGGER_HINT_DELAY_MS = 8000;
const TAGGER_HINT_INTERVAL_MS = 12000;
const INPUT_STALE_MS = 260;
const ROOM_MESSAGE_LIMIT = 6;

export function sanitizePlayerName(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, NAME_LIMIT);
}

export function normalizePlayerInput(value) {
  if (!value || typeof value !== "object") {
    return {
      forward: 0,
      right: 0,
      sprint: false,
      jump: false,
      dash: false,
      usePower: false,
      slide: false,
      yaw: 0,
      pitch: 0,
    };
  }

  const normalizeAxis = (axis) => {
    if (typeof axis !== "number" || !Number.isFinite(axis)) {
      return 0;
    }
    return Math.max(-MAX_INPUT_MAGNITUDE, Math.min(MAX_INPUT_MAGNITUDE, axis));
  };
  const normalizeYaw = (yaw) => {
    if (typeof yaw !== "number" || !Number.isFinite(yaw)) {
      return 0;
    }
    return Math.atan2(Math.sin(yaw), Math.cos(yaw));
  };
  const normalizePitch = (pitch) => {
    if (typeof pitch !== "number" || !Number.isFinite(pitch)) {
      return 0;
    }
    return Math.max(-0.62, Math.min(0.48, pitch));
  };

  return {
    forward: normalizeAxis(value.forward),
    right: normalizeAxis(value.right),
    sprint: value.sprint === true,
    jump: value.jump === true,
    dash: value.dash === true,
    usePower: value.usePower === true,
    slide: value.slide === true,
    yaw: normalizeYaw(value.yaw),
    pitch: normalizePitch(value.pitch),
  };
}

export function generateRoomCode(random = Math.random) {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[
      Math.floor(random() * ROOM_CODE_ALPHABET.length)
    ];
  }
  return code;
}

export function clampPlayerPosition(position, playerY = 0, sliding = false) {
  const radius = sliding ? SLIDE_PLAYER_RADIUS : ARENA.playerRadius;
  return resolveArenaPosition(position, { x: 0, z: 0 }, radius, playerY);
}

function platformAtPlayerHeight(player) {
  return ALL_CLIMBABLE_PLATFORMS.find(
    (platform) =>
      Math.abs(player.y - platform.height) <= 0.025 &&
      circleIntersectsRectangle(
        { x: player.x, z: player.z },
        ARENA.playerRadius,
        platform,
      ),
  );
}

function supportHeightAt(x, z, playerY = 0) {
  const rampHeight = rampHeightAt(x, z);
  return rampHeight === null || playerY < rampHeight - RAMP_SUPPORT_TOLERANCE
    ? 0
    : rampHeight;
}

function rampLandedOn(player, previousY, nextY) {
  if (player.verticalVelocity >= 0) {
    return null;
  }
  const rampHeight = rampHeightAt(player.x, player.z);
  return rampHeight !== null && previousY >= rampHeight && nextY <= rampHeight
    ? rampHeight
    : null;
}

function findWallRunSide(player) {
  for (const wall of OBSTACLES) {
    if (wall.kind !== "wall") continue;
    const minZ = wall.z - wall.depth / 2 - ARENA.playerRadius * 0.35;
    const maxZ = wall.z + wall.depth / 2 + ARENA.playerRadius * 0.35;
    if (player.z < minZ || player.z > maxZ) continue;
    const westFace = wall.x - wall.width / 2 - ARENA.playerRadius;
    const eastFace = wall.x + wall.width / 2 + ARENA.playerRadius;
    if (Math.abs(player.x - westFace) <= 0.5) return 1;
    if (Math.abs(player.x - eastFace) <= 0.5) return -1;
  }
  return 0;
}

function platformLandedOn(player, previousY, nextY) {
  if (player.verticalVelocity >= 0) {
    return null;
  }

  let landing = null;
  for (const platform of ALL_CLIMBABLE_PLATFORMS) {
    if (
      previousY >= platform.height &&
      nextY <= platform.height &&
      circleIntersectsRectangle(
        { x: player.x, z: player.z },
        ARENA.playerRadius,
        platform,
      ) &&
      (!landing || platform.height > landing.height)
    ) {
      landing = platform;
    }
  }
  return landing;
}

function randomSpawn(random, players) {
  const existing = [...players].map((player) => ({ x: player.x, z: player.z }));
  const openPoints = SPAWN_POINTS.filter((spawn) =>
    existing.every((player) => {
      const dx = spawn.x - player.x;
      const dz = spawn.z - player.z;
      return dx * dx + dz * dz >= 36;
    }),
  );
  if (openPoints.length > 0) {
    return openPoints[Math.floor(random() * openPoints.length)];
  }

  return SPAWN_POINTS.reduce((best, spawn) => {
    const nearestDistance = Math.min(
      ...existing.map((player) => {
        const dx = spawn.x - player.x;
        const dz = spawn.z - player.z;
        return dx * dx + dz * dz;
      }),
    );
    const bestDistance = Math.min(
      ...existing.map((player) => {
        const dx = best.x - player.x;
        const dz = best.z - player.z;
        return dx * dx + dz * dz;
      }),
    );
    return nearestDistance > bestDistance ? spawn : best;
  });
}

function nowMilliseconds() {
  return Date.now();
}

function pointIsBlocked(point, radius = 0) {
  const insideObstacle = OBSTACLES.some(
    (obstacle) =>
      point.y >= 0 &&
      point.y <= obstacle.collisionHeight &&
      Math.abs(point.x - obstacle.x) <= obstacle.width / 2 + radius &&
      Math.abs(point.z - obstacle.z) <= obstacle.depth / 2 + radius,
  );
  if (insideObstacle) {
    return true;
  }
  return ALL_CLIMBABLE_PLATFORMS.some(
    (platform) =>
      point.y >= 0 &&
      point.y <= platform.height &&
      (platform.kind !== "deck" || point.y >= platform.height - 0.3) &&
      Math.abs(point.x - platform.x) <= platform.width / 2 + radius &&
      Math.abs(point.z - platform.z) <= platform.depth / 2 + radius,
  );
}

function idForMessage() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPlayerInputFresh(player, now) {
  return now - player.inputUpdatedAt <= INPUT_STALE_MS;
}

function playerSnapshot(player, now = Date.now()) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: Math.round(player.x * 100) / 100,
    y: Math.round(player.y * 100) / 100,
    z: Math.round(player.z * 100) / 100,
    powerUp: player.powerUp,
    powerUpExpiresAt: player.powerUpExpiresAt,
    isInvisible:
      player.powerUp === "invisibility" && player.powerUpExpiresAt > now,
    isFrozen: player.frozenUntil > now,
    grappleAnchor: player.grapple
      ? {
          x: Math.round(player.grapple.anchor.x * 100) / 100,
          y: Math.round(player.grapple.anchor.y * 100) / 100,
          z: Math.round(player.grapple.anchor.z * 100) / 100,
        }
      : null,
    dashCooldownEndsAt: player.dashCooldownEndsAt,
    survivalPoints: player.survivalPoints,
    lives: player.lives,
    spawnProtectedUntil: player.spawnProtectedUntil,
    taggerPenaltyEndsAt: player.isIt ? player.taggerPenaltyEndsAt : 0,
    isEliminated: player.isEliminated,
    isSliding: player.isSliding,
    isWallRunning: player.isWallRunning,
    wallRunSide: player.wallRunSide,
    isVaulting: player.isVaulting,
    isSlipstreaming: player.isSlipstreaming,
    inkedUntil: player.inkedUntil,
    gravityInvertedUntil: player.gravityInvertedUntil,
    rotation: Math.round(player.rotation * 1000) / 1000,
    pitch: Math.round(player.pitch * 1000) / 1000,
    isIt: player.isIt,
    isMoving: player.isMoving,
    isSprinting: player.isSprinting,
    isDashing: player.isDashing,
    isReady: player.isReady,
    connected: player.connected,
  };
}

export class GameRoom {
  constructor(code, options = {}) {
    this.code = code;
    this.random = options.random ?? Math.random;
    this.clock = options.clock ?? nowMilliseconds;
    this.players = new Map();
    this.hostId = "";
    this.phase = "waiting";
    this.round = 0;
    this.roundEndsAt = 0;
    this.countdownEndsAt = 0;
    this.itPlayerId = null;
    this.winnerId = null;
    this.lastTagAt = 0;
    this.nextHintAt = 0;
    this.lastUpdateAt = this.clock();
    this.powerUp = null;
    this.snowballs = [];
    this.effects = [];
    this.nextSnowballId = 0;
    this.nextEffectId = 0;
    this.nextPowerUpAt = 0;
    this.messages = [];
    this.onEvent = options.onEvent ?? (() => {});
    this.onHint = options.onHint ?? (() => {});
  }

  get playerCount() {
    return this.players.size;
  }

  addPlayer(id, name, color) {
    if (this.players.has(id)) {
      return playerSnapshot(this.players.get(id), this.clock());
    }
    if (this.players.size >= ROUND.maximumPlayers) {
      throw new Error("A sala está cheia.");
    }
    if (this.phase !== "waiting") {
      throw new Error("A partida já começou.");
    }

    const cleanName = sanitizePlayerName(name);
    if (!cleanName) {
      throw new Error("Digite um nome para entrar na partida.");
    }
    const spawn = randomSpawn(this.random, this.players.values());
    const colorIndex = this.players.size % PLAYER_COLORS.length;
    if (color !== undefined && !PLAYER_COLORS.some((option) => option === color)) {
      throw new Error("A cor do personagem não está disponível.");
    }
    const player = {
      id,
      name: cleanName,
      color: color ?? PLAYER_COLORS[colorIndex],
      x: spawn.x,
      y: 0,
      z: spawn.z,
      powerUp: null,
      powerUpExpiresAt: 0,
      frozenUntil: 0,
      grapple: null,
      powerRequested: false,
      dashCooldownEndsAt: 0,
      verticalVelocity: 0,
      velocityX: 0,
      velocityZ: 0,
      knockbackX: 0,
      knockbackZ: 0,
      climbingLadderId: null,
      jumpRequested: false,
      dashRequested: false,
      slideRequested: false,
      dashEndsAt: 0,
      dashDirectionX: 0,
      dashDirectionZ: 0,
      rotation: 0,
      pitch: 0,
      input: normalizePlayerInput(null),
      inputUpdatedAt: this.clock(),
      isIt: false,
      lives: ROUND.livesPerPlayer,
      spawnProtectedUntil: 0,
      isMoving: false,
      isSprinting: false,
      isDashing: false,
      isSliding: false,
      slideEndsAt: 0,
      isWallRunning: false,
      wallRunSide: 0,
      wallRunEndsAt: 0,
      isVaulting: false,
      vaultStartedAt: 0,
      vaultEndsAt: 0,
      vaultBaseY: 0,
      vaultHeight: 0,
      slipstreamTargetId: null,
      slipstreamStartedAt: 0,
      isSlipstreaming: false,
      taggerPenaltyEndsAt: 0,
      isEliminated: false,
      inkedUntil: 0,
      gravityInvertedUntil: 0,
      isReady: false,
      survivalPoints: 0,
      survivalProgressMs: 0,
      connected: true,
    };

    this.players.set(id, player);
    if (!this.hostId) {
      this.hostId = id;
    }
    this.addMessage(`${cleanName} entrou na sala.`, "info");
    return playerSnapshot(player, this.clock());
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) {
      return false;
    }

    this.players.delete(id);
    this.snowballs = this.snowballs.filter(
      (snowball) => snowball.ownerId !== id,
    );
    const wasTagger = this.itPlayerId === id;
    if (wasTagger) {
      this.itPlayerId = null;
    }
    if (this.hostId === id) {
      this.hostId = this.players.keys().next().value ?? "";
      const newHost = this.players.get(this.hostId);
      if (newHost) {
        this.addMessage(`${newHost.name} agora é o anfitrião.`, "info");
      }
    }
    this.addMessage(`${player.name} saiu da sala.`, "info");

    if (this.players.size === 0) {
      this.phase = "waiting";
      this.hostId = "";
      this.winnerId = null;
      this.round = 0;
    } else if (this.phase === "playing") {
      const activePlayers = [...this.players.values()].filter(
        (candidate) => !candidate.isEliminated,
      );
      if (activePlayers.length <= 1) {
        this.finishRound(activePlayers[0]?.id ?? null);
      } else if (wasTagger) {
        const selected =
          activePlayers[Math.floor(this.random() * activePlayers.length)];
        if (selected) {
          selected.isIt = true;
          selected.taggerPenaltyEndsAt =
            this.clock() + ROUND.taggerPenaltySeconds * 1000;
          this.itPlayerId = selected.id;
          this.lastTagAt = this.clock();
          this.addMessage(`${selected.name} começa pegando!`, "tag");
        }
      }
    } else if (
      this.phase === "countdown" &&
      this.players.size < ROUND.minimumPlayers
    ) {
      this.phase = "waiting";
      this.addMessage("A partida precisa de pelo menos 2 pessoas.", "info");
    }
    return true;
  }

  setReady(id, ready) {
    const player = this.players.get(id);
    if (!player || this.phase !== "waiting") {
      return false;
    }
    player.isReady = ready === true;
    return true;
  }

  startGame(requesterId) {
    if (requesterId !== this.hostId) {
      throw new Error("Somente o anfitrião pode iniciar a partida.");
    }
    if (this.players.size < ROUND.minimumPlayers) {
      throw new Error("A sala precisa de pelo menos 2 jogadores.");
    }
    if (this.phase === "playing" || this.phase === "countdown") {
      throw new Error("A partida já está em andamento.");
    }

    this.round += 1;
    this.phase = "countdown";
    this.countdownEndsAt =
      this.clock() + ROUND.countdownSeconds * 1000;
    this.winnerId = null;
    this.powerUp = null;
    this.snowballs = [];
    this.effects = [];
    this.nextPowerUpAt = 0;
    for (const player of this.players.values()) {
      player.survivalPoints = 0;
      player.survivalProgressMs = 0;
      player.isIt = false;
      player.isEliminated = false;
      player.lives = ROUND.livesPerPlayer;
      player.spawnProtectedUntil = 0;
      player.taggerPenaltyEndsAt = 0;
      player.isReady = false;
      player.input = normalizePlayerInput(null);
      player.y = 0;
      player.verticalVelocity = 0;
      player.velocityX = 0;
      player.velocityZ = 0;
      player.knockbackX = 0;
      player.knockbackZ = 0;
      player.jumpRequested = false;
      player.dashRequested = false;
      player.slideRequested = false;
      player.dashEndsAt = 0;
      player.dashCooldownEndsAt = 0;
      player.isMoving = false;
      player.isSprinting = false;
      player.isDashing = false;
      player.isSliding = false;
      player.slideEndsAt = 0;
      player.isWallRunning = false;
      player.wallRunSide = 0;
      player.wallRunEndsAt = 0;
      player.isVaulting = false;
      player.vaultStartedAt = 0;
      player.vaultEndsAt = 0;
      player.slipstreamTargetId = null;
      player.slipstreamStartedAt = 0;
      player.isSlipstreaming = false;
      player.inkedUntil = 0;
      player.gravityInvertedUntil = 0;
      player.powerUp = null;
      player.powerUpExpiresAt = 0;
      player.frozenUntil = 0;
      player.grapple = null;
      player.powerRequested = false;
    }
    this.addMessage(`Rodada ${this.round} vai começar!`, "info");
    return this.getState();
  }

  setInput(id, input) {
    const player = this.players.get(id);
    if (!player || player.isEliminated || this.phase !== "playing") {
      return false;
    }
    const nextInput = normalizePlayerInput(input);
    if (nextInput.jump && !player.input.jump) {
      player.jumpRequested = true;
    }
    if (nextInput.slide && !player.input.slide) {
      player.slideRequested = true;
    }
    if (nextInput.dash && !player.input.dash) {
      player.dashRequested = true;
    }
    if (nextInput.usePower && !player.input.usePower) {
      player.powerRequested = true;
    }
    player.input = nextInput;
    player.inputUpdatedAt = this.clock();
    player.isSprinting = player.input.sprint;
    player.rotation = player.input.yaw;
    player.pitch = player.input.pitch;
    return true;
  }

  tick(now = this.clock()) {
    const deltaSeconds = Math.max(
      0,
      Math.min((now - this.lastUpdateAt) / 1000, 0.1),
    );
    this.lastUpdateAt = now;

    if (this.phase === "countdown" && now >= this.countdownEndsAt) {
      this.beginRound(now);
    } else if (this.phase === "playing") {
      this.movePlayers(now, deltaSeconds);
      this.processPowerRequests(now);
      this.updateSnowballs(now, deltaSeconds);
      this.updatePowerUp(now);
      this.checkForTag(now);
      this.checkTaggerPenalty(now);
      this.awardSurvivalPoints(deltaSeconds);
      this.effects = this.effects.filter((effect) => effect.expiresAt > now);
      if (now >= this.roundEndsAt) {
        this.finishByScore();
      } else {
        this.updateChaserHint(now);
      }
    }
    return this.getState(now);
  }

  beginRound(now = this.clock()) {
    const candidates = [...this.players.values()].filter(
      (player) => !player.isEliminated,
    );
    if (candidates.length < ROUND.minimumPlayers) {
      this.phase = "waiting";
      return false;
    }
    const selected = candidates[Math.floor(this.random() * candidates.length)];
    if (!selected) {
      this.phase = "waiting";
      return false;
    }
    selected.isIt = true;
    selected.taggerPenaltyEndsAt =
      now + ROUND.taggerPenaltySeconds * 1000;
    this.itPlayerId = selected.id;
    for (const player of this.players.values()) {
      player.spawnProtectedUntil =
        now + ROUND.respawnInvulnerabilityMs;
    }
    this.phase = "playing";
    this.roundEndsAt = now + ROUND.durationSeconds * 1000;
    this.lastTagAt = now;
    this.nextHintAt = now + FIRST_TAGGER_HINT_DELAY_MS;
    this.lastUpdateAt = now;
    this.nextPowerUpAt = now + POWER_UP_SPAWN_DELAY_MS;
    this.addMessage(`${selected.name} começa pegando!`, "tag");
    this.onEvent("game:started", this.getState(now));
    return true;
  }

  movePlayers(now, deltaSeconds) {
    for (const player of this.players.values()) {
      if (player.isEliminated) {
        player.isMoving = false;
        player.isSprinting = false;
        player.isDashing = false;
        player.isSliding = false;
        continue;
      }
      const input = isPlayerInputFresh(player, now)
        ? player.input
        : normalizePlayerInput(null);
      if (player.powerUpExpiresAt > 0 && now >= player.powerUpExpiresAt) {
        player.powerUp = null;
        player.powerUpExpiresAt = 0;
      }
      if (player.gravityInvertedUntil <= now) {
        player.gravityInvertedUntil = 0;
      }
      if (player.isSliding && now >= player.slideEndsAt) {
        player.isSliding = false;
      }
      if (player.isWallRunning && now >= player.wallRunEndsAt) {
        player.isWallRunning = false;
        player.wallRunSide = 0;
      }
      if (player.isVaulting) {
        const progress = Math.min(
          1,
          (now - player.vaultStartedAt) /
            Math.max(1, player.vaultEndsAt - player.vaultStartedAt),
        );
        player.y =
          player.vaultBaseY +
          Math.sin(progress * Math.PI) * player.vaultHeight;
        if (progress >= 1) {
          player.isVaulting = false;
          player.verticalVelocity = 0;
        }
      }
      if (player.frozenUntil > now) {
        player.jumpRequested = false;
        player.dashRequested = false;
        player.slideRequested = false;
        player.grapple = null;
        player.isMoving = false;
        player.isSprinting = false;
        player.isDashing = false;
        player.isSliding = false;
        player.isWallRunning = false;
        player.wallRunSide = 0;
        player.dashEndsAt = 0;
        continue;
      }
      player.frozenUntil = 0;
      if (player.grapple && this.moveGrapple(player, now, deltaSeconds)) {
        continue;
      }
      const onPlatform = platformAtPlayerHeight(player);
      const currentSupport = Math.max(
        supportHeightAt(player.x, player.z, player.y),
        onPlatform?.height ?? 0,
      );
      const grounded =
        player.verticalVelocity <= 0 &&
        player.y <= currentSupport + 0.025;
      const jumpRequested = player.jumpRequested;
      player.jumpRequested = false;
      const inputLength = Math.hypot(input.forward, input.right);
      const wallSide = findWallRunSide(player);
      if (player.isWallRunning && jumpRequested) {
        const awayFromWall = -player.wallRunSide;
        player.knockbackX += awayFromWall * 6.5;
        player.verticalVelocity = JUMP_VELOCITY * 1.12;
        player.isWallRunning = false;
        player.wallRunSide = 0;
      } else if (
        jumpRequested &&
        input.sprint &&
        wallSide !== 0 &&
        inputLength > 0.05 &&
        (grounded || player.y < 1.1)
      ) {
        player.isWallRunning = true;
        player.wallRunSide = wallSide;
        player.wallRunEndsAt = now + PARKOUR.wallRunDurationMs;
        player.verticalVelocity = JUMP_VELOCITY * 0.92;
      } else if (jumpRequested && grounded) {
        const jumpMultiplier =
          player.powerUp === "jump" && player.powerUpExpiresAt > now
            ? POWER_UP_JUMP_MULTIPLIER
            : 1;
        player.verticalVelocity = JUMP_VELOCITY * jumpMultiplier;
      }
      const slideRequested = player.slideRequested;
      player.slideRequested = false;
      if (
        slideRequested ||
        (input.slide && !player.isSliding)
      ) {
        if (input.sprint && inputLength > 0.05 && grounded) {
          player.isSliding = true;
          player.slideEndsAt = now + PARKOUR.slideDurationMs;
        }
      }
      if (player.dashRequested) {
        player.dashRequested = false;
        if (now >= player.dashCooldownEndsAt) {
          player.dashDirectionX =
            inputLength > 0.001
              ? input.right / inputLength
              : Math.sin(player.rotation);
          player.dashDirectionZ =
            inputLength > 0.001
              ? -input.forward / inputLength
              : -Math.cos(player.rotation);
          player.dashEndsAt = now + DASH_DURATION_MS;
          player.dashCooldownEndsAt = now + DASH_COOLDOWN_MS;
        }
      }
      player.isDashing = now < player.dashEndsAt;

      const hasInputMovement = inputLength > 0.001;
      const hasHorizontalMovement =
        player.isDashing ||
        player.isSliding ||
        hasInputMovement ||
        Math.hypot(player.knockbackX, player.knockbackZ) > 0.1;
      const isSprinting = input.sprint && !player.isDashing && !player.isSliding;
      const speedMultiplier =
        player.powerUp === "speed" && player.powerUpExpiresAt > now
          ? POWER_UP_SPEED_MULTIPLIER
          : 1;
      const slipstreamMultiplier = player.isSlipstreaming
        ? PARKOUR.slipstreamBonus
        : 1;
      const speed =
        (isSprinting ? SPRINT_SPEED : PLAYER_SPEED) *
        speedMultiplier *
        slipstreamMultiplier;
      let horizontalVelocityX = 0;
      let horizontalVelocityZ = 0;
      if (player.isDashing) {
        horizontalVelocityX = player.dashDirectionX * DASH_SPEED;
        horizontalVelocityZ = player.dashDirectionZ * DASH_SPEED;
      } else if (player.isSliding) {
        if (hasInputMovement) {
          const targetX = (input.right / Math.max(1, inputLength)) * PARKOUR.slideSpeed;
          const targetZ = (-input.forward / Math.max(1, inputLength)) * PARKOUR.slideSpeed;
          horizontalVelocityX = player.velocityX * 0.76 + targetX * 0.24;
          horizontalVelocityZ = player.velocityZ * 0.76 + targetZ * 0.24;
        } else {
          horizontalVelocityX = player.velocityX * 0.96;
          horizontalVelocityZ = player.velocityZ * 0.96;
        }
      } else if (hasInputMovement) {
        horizontalVelocityX = (input.right / Math.max(1, inputLength)) * speed;
        horizontalVelocityZ = (-input.forward / Math.max(1, inputLength)) * speed;
      }
      if (player.isSliding) {
        const rampNow = supportHeightAt(player.x, player.z, player.y);
        const rampAhead = supportHeightAt(
          player.x + horizontalVelocityX * 0.08,
          player.z + horizontalVelocityZ * 0.08,
          player.y,
        );
        if (rampNow !== null && rampAhead !== null && rampAhead < rampNow) {
          horizontalVelocityX *= 1.22;
          horizontalVelocityZ *= 1.22;
        }
      }
      if (player.isWallRunning && wallSide === 0) {
        player.isWallRunning = false;
        player.wallRunSide = 0;
      }
      if (player.isWallRunning && inputLength > 0.05) {
        const alongWallSpeed = Math.max(
          Math.abs(horizontalVelocityX),
          Math.abs(horizontalVelocityZ),
        );
        if (alongWallSpeed < PARKOUR.wallRunSpeed) {
          const scale = PARKOUR.wallRunSpeed / Math.max(0.001, alongWallSpeed);
          horizontalVelocityX *= scale;
          horizontalVelocityZ *= scale;
        }
      }
      const movement = {
        x: (horizontalVelocityX + player.knockbackX) * deltaSeconds,
        z: (horizontalVelocityZ + player.knockbackZ) * deltaSeconds,
      };
      player.velocityX = horizontalVelocityX;
      player.velocityZ = horizontalVelocityZ;
      player.knockbackX *= Math.max(0, 1 - deltaSeconds * 4.5);
      player.knockbackZ *= Math.max(0, 1 - deltaSeconds * 4.5);
      const ladder = BUILDING_LADDERS.find(
        (candidate) =>
          player.y < candidate.roofHeight - 0.02 &&
          Math.abs(player.x - candidate.approachX) <=
            ARENA.playerRadius + 0.25 &&
          Math.abs(player.z - candidate.z) <= candidate.width / 2 + 0.3,
      );
      const ladderAxis = ladder
        ? movement.x * ladder.directionX
        : 0;
      const canGrabLadder =
        ladder !== undefined && ladderAxis > 0.001;
      const canStayOnLadder =
        ladder !== undefined &&
        player.climbingLadderId === ladder.id &&
        Math.abs(movement.z) <= 0.05;

      if (ladder && (canGrabLadder || canStayOnLadder)) {
        player.climbingLadderId = ladder.id;
        player.x = ladder.approachX;
        player.z = ladder.z;
        if (ladderAxis > 0.001) {
          player.y = Math.min(
            ladder.roofHeight,
            player.y + LADDER_CLIMB_SPEED * deltaSeconds,
          );
        } else if (ladderAxis < -0.001) {
          player.y = Math.max(
            0,
            player.y - LADDER_CLIMB_SPEED * deltaSeconds,
          );
        }
        player.verticalVelocity = 0;
        player.isMoving = Math.abs(ladderAxis) > 0.001;
        player.isSprinting = false;
        player.isDashing = false;
        player.isSliding = false;
        player.isWallRunning = false;
        if (player.y <= 0.001 || player.y >= ladder.roofHeight - 0.001) {
          player.climbingLadderId = null;
        }
        continue;
      }

      player.climbingLadderId = null;
      const proposed = {
        x: player.x + movement.x,
        z: player.z + movement.z,
      };
      const vaultObstacle =
        !player.isVaulting && isSprinting && grounded
          ? this.findVaultObstacle(player, proposed)
          : undefined;
      if (vaultObstacle) {
        player.isVaulting = true;
        player.vaultStartedAt = now;
        player.vaultEndsAt = now + PARKOUR.vaultDurationMs;
        player.vaultBaseY = player.y;
        player.vaultHeight = vaultObstacle.height + 0.22;
      }
      if (!hasHorizontalMovement) {
        player.isMoving = false;
        player.isSprinting = false;
      } else {
        const next = clampPlayerPosition(
          proposed,
          player.y,
          player.isSliding,
        );
        player.isMoving =
          Math.hypot(next.x - player.x, next.z - player.z) > 0.0001;
        player.x = next.x;
        player.z = next.z;
        player.isSprinting = isSprinting && player.isMoving;
      }

      if (player.isVaulting) {
        const progress = Math.min(
          1,
          (now - player.vaultStartedAt) /
            Math.max(1, player.vaultEndsAt - player.vaultStartedAt),
        );
        player.y =
          player.vaultBaseY +
          Math.sin(progress * Math.PI) * player.vaultHeight;
        player.verticalVelocity = 0;
      } else if (player.verticalVelocity <= 0) {
        const rampSupport = supportHeightAt(player.x, player.z, player.y);
        const platformSupport = ALL_CLIMBABLE_PLATFORMS.find(
          (platform) =>
            circleIntersectsRectangle(
              { x: player.x, z: player.z },
              ARENA.playerRadius,
              platform,
            ) &&
            Math.abs(player.y - platform.height) <= 0.08,
        );
        const groundHeight = Math.max(
          rampSupport,
          platformSupport?.height ?? 0,
        );
        if (player.y <= groundHeight + 0.025) {
          player.y = groundHeight;
          player.verticalVelocity = 0;
        }
      }
      if (!player.isVaulting && (player.y > 0 || player.verticalVelocity > 0)) {
        const previousY = player.y;
        const gravityMultiplier =
          player.gravityInvertedUntil > now ? GRAVITY_MULTIPLIER : 1;
        const gravity = player.isWallRunning
          ? PARKOUR.wallRunGravity
          : GRAVITY * gravityMultiplier;
        player.verticalVelocity -= gravity * deltaSeconds;
        const nextY = Math.max(
          0,
          player.y + player.verticalVelocity * deltaSeconds,
        );
        const rampCeiling = rampHeightAt(player.x, player.z);
        if (
          rampCeiling !== null &&
          player.verticalVelocity > 0 &&
          previousY + ARENA.playerHeight < rampCeiling &&
          nextY + ARENA.playerHeight >= rampCeiling
        ) {
          player.y = rampCeiling - ARENA.playerHeight;
          player.verticalVelocity = 0;
          continue;
        }
        const ceiling = ALL_CLIMBABLE_PLATFORMS.find(
          (platform) =>
            platform.kind === "deck" &&
            player.verticalVelocity > 0 &&
            previousY <
              platform.height -
                ELEVATED_PLATFORM_THICKNESS -
                ARENA.playerHeight &&
            nextY + ARENA.playerHeight >=
              platform.height - ELEVATED_PLATFORM_THICKNESS &&
            circleIntersectsRectangle(
              { x: player.x, z: player.z },
              ARENA.playerRadius,
              platform,
            ),
        );
        if (ceiling) {
          player.y =
            ceiling.height -
            ELEVATED_PLATFORM_THICKNESS -
            ARENA.playerHeight;
          player.verticalVelocity = 0;
          continue;
        }
        const rampLanding = rampLandedOn(player, previousY, nextY);
        const platformLanding = platformLandedOn(player, previousY, nextY);
        if (rampLanding !== null) {
          player.y = rampLanding;
          player.verticalVelocity = 0;
        } else if (platformLanding) {
          player.y = platformLanding.height;
          player.verticalVelocity = 0;
        } else {
          player.y = nextY;
          if (player.y === 0) {
            player.verticalVelocity = 0;
          }
        }
      }

    }
    this.updateSlipstream(now);
  }

  findVaultObstacle(player, proposed) {
    return OBSTACLES.find((obstacle) => {
      if (
        obstacle.kind !== "barrier" ||
        obstacle.height > PARKOUR.vaultHeight
      ) {
        return false;
      }
      const bounds = {
        x: obstacle.x,
        z: obstacle.z,
        width: obstacle.width + ARENA.playerRadius * 2,
        depth: obstacle.depth + ARENA.playerRadius * 2,
      };
      return (
        circleIntersectsRectangle(proposed, 0, bounds) &&
        !circleIntersectsRectangle({ x: player.x, z: player.z }, 0, bounds)
      );
    });
  }

  updateSlipstream(now) {
    const players = [...this.players.values()].filter(
      (player) => !player.isEliminated,
    );
    for (const follower of players) {
      if (!follower.input.sprint || !follower.isMoving) {
        follower.slipstreamTargetId = null;
        follower.slipstreamStartedAt = 0;
        follower.isSlipstreaming = false;
        continue;
      }
      const target = players.find((candidate) => {
        if (
          candidate.id === follower.id ||
          !candidate.isMoving ||
          !candidate.input.sprint
        ) {
          return false;
        }
        const dx = candidate.x - follower.x;
        const dz = candidate.z - follower.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1.2 || distance > PARKOUR.slipstreamDistance) {
          return false;
        }
        const forwardX = -Math.sin(candidate.rotation);
        const forwardZ = -Math.cos(candidate.rotation);
        const forwardDistance = dx * forwardX + dz * forwardZ;
        const lateralDistance = Math.abs(dx * forwardZ - dz * forwardX);
        return (
          forwardDistance > 0 &&
          lateralDistance < PARKOUR.slipstreamLateralDistance
        );
      });
      if (!target) {
        follower.slipstreamTargetId = null;
        follower.slipstreamStartedAt = 0;
        follower.isSlipstreaming = false;
        continue;
      }
      if (follower.slipstreamTargetId !== target.id) {
        follower.slipstreamTargetId = target.id;
        follower.slipstreamStartedAt = now;
        follower.isSlipstreaming = false;
      } else {
        follower.isSlipstreaming =
          now - follower.slipstreamStartedAt >= PARKOUR.slipstreamWarmupMs;
      }
    }
  }

  moveGrapple(player, now, deltaSeconds) {
    const grapple = player.grapple;
    if (!grapple) {
      return false;
    }
    const dx = grapple.destination.x - player.x;
    const dy = grapple.destination.y - player.y;
    const dz = grapple.destination.z - player.z;
    const distance = Math.hypot(dx, dy, dz);
    if (
      player.jumpRequested &&
      distance <= GRAPPLE_REACH_DISTANCE * 4
    ) {
      const directionScale = distance > 0.001 ? GRAPPLE_CARRY_SPEED / distance : 0;
      player.grapple = null;
      player.jumpRequested = false;
      player.verticalVelocity = JUMP_VELOCITY * 1.08;
      player.knockbackX = dx * directionScale;
      player.knockbackZ = dz * directionScale;
      player.isMoving = true;
      return false;
    }
    if (now >= grapple.expiresAt || distance <= GRAPPLE_REACH_DISTANCE) {
      player.grapple = null;
      player.verticalVelocity = 0;
      const directionScale =
        distance > 0.001 ? GRAPPLE_CARRY_SPEED / distance : 0;
      player.knockbackX = dx * directionScale;
      player.knockbackZ = dz * directionScale;
      player.isMoving = Math.hypot(player.knockbackX, player.knockbackZ) > 0.1;
      player.isSprinting = false;
      player.isDashing = false;
      return true;
    }

    const step = Math.min(distance, GRAPPLE_PULL_SPEED * deltaSeconds);
    const fraction = step / distance;
    const nextY = Math.max(0, player.y + dy * fraction);
    const next = clampPlayerPosition(
      {
        x: player.x + dx * fraction,
        z: player.z + dz * fraction,
      },
      nextY,
    );
    const movedDistance = Math.hypot(
      next.x - player.x,
      nextY - player.y,
      next.z - player.z,
    );
    player.x = next.x;
    player.y = nextY;
    player.z = next.z;
    player.verticalVelocity = 0;
    player.velocityX = (dx / distance) * GRAPPLE_PULL_SPEED;
    player.velocityZ = (dz / distance) * GRAPPLE_PULL_SPEED;
    player.isMoving = movedDistance > 0.0001;
    player.isSprinting = false;
    player.isDashing = false;
    player.dashEndsAt = 0;
    player.climbingLadderId = null;
    return true;
  }

  awardSurvivalPoints(deltaSeconds) {
    for (const player of this.players.values()) {
      if (player.isIt || player.isEliminated) {
        continue;
      }
      player.survivalProgressMs += deltaSeconds * 1000;
      const earnedPoints = Math.floor(player.survivalProgressMs / 1000);
      if (earnedPoints > 0) {
        player.survivalPoints += earnedPoints;
        player.survivalProgressMs -= earnedPoints * 1000;
      }
    }
  }

  processPowerRequests(now) {
    for (const player of this.players.values()) {
      if (!player.powerRequested) {
        continue;
      }
      player.powerRequested = false;
      if (
        player.isEliminated ||
        player.frozenUntil > now ||
        player.grapple ||
        !player.powerUp ||
        player.powerUpExpiresAt > now
      ) {
        continue;
      }

      if (
        player.powerUp === "speed" ||
        player.powerUp === "jump" ||
        player.powerUp === "invisibility" ||
        player.powerUp === "gravity"
      ) {
        const duration =
          player.powerUp === "invisibility"
            ? INVISIBILITY_DURATION_MS
            : player.powerUp === "gravity"
              ? GRAVITY_DURATION_MS
              : POWER_UP_EFFECT_DURATION_MS;
        player.powerUpExpiresAt = now + duration;
        if (player.powerUp === "gravity") {
          player.gravityInvertedUntil = player.powerUpExpiresAt;
        }
        this.addMessage(
          `${player.name} ativou ${POWER_UP_LABELS[player.powerUp]}!`,
          "info",
        );
      } else if (player.powerUp === "freeze") {
        const horizontalScale = Math.cos(player.pitch);
        this.snowballs.push({
          id: `${this.code}-snow-${++this.nextSnowballId}`,
          ownerId: player.id,
          kind: "snowball",
          x: player.x,
          y: player.y + PLAYER_EYE_HEIGHT,
          z: player.z,
          velocityX: -Math.sin(player.rotation) * horizontalScale * SNOWBALL_SPEED,
          velocityY: Math.sin(player.pitch) * SNOWBALL_SPEED,
          velocityZ: -Math.cos(player.rotation) * horizontalScale * SNOWBALL_SPEED,
          expiresAt: now + SNOWBALL_LIFETIME_MS,
        });
        player.powerUp = null;
        player.powerUpExpiresAt = 0;
        this.addMessage(`${player.name} lançou uma bola de neve!`, "info");
      } else if (player.powerUp === "grapple") {
        const grapple = this.createGrapple(player, now);
        if (!grapple) {
          continue;
        }
        player.grapple = grapple;
        player.powerUp = null;
        player.powerUpExpiresAt = 0;
        this.addMessage(`${player.name} usou o rapel!`, "info");
      } else if (player.powerUp === "shockwave") {
        for (const target of this.players.values()) {
          if (target.id === player.id || target.isEliminated) continue;
          const dx = target.x - player.x;
          const dz = target.z - player.z;
          const distance = Math.hypot(dx, dz);
          if (
            distance > SHOCKWAVE_RADIUS ||
            Math.abs(target.y - player.y) > SHOCKWAVE_RADIUS * 0.7
          ) {
            continue;
          }
          const directionX =
            distance > 0.001 ? dx / distance : Math.sin(player.rotation);
          const directionZ =
            distance > 0.001 ? dz / distance : -Math.cos(player.rotation);
          const falloff = 1 - distance / SHOCKWAVE_RADIUS * 0.45;
          target.knockbackX +=
            directionX * SHOCKWAVE_HORIZONTAL_IMPULSE * falloff;
          target.knockbackZ +=
            directionZ * SHOCKWAVE_HORIZONTAL_IMPULSE * falloff;
          const shove = clampPlayerPosition(
            {
              x: target.x + directionX * 0.55 * falloff,
              z: target.z + directionZ * 0.55 * falloff,
            },
            target.y,
          );
          target.x = shove.x;
          target.z = shove.z;
          target.verticalVelocity = Math.max(
            target.verticalVelocity,
            SHOCKWAVE_VERTICAL_IMPULSE * falloff,
          );
          target.grapple = null;
        }
        this.addEffect("shockwave", player.x, player.y, player.z, now, 650);
        this.consumePower(player);
        this.addMessage(`${player.name} soltou uma onda de choque!`, "info");
      } else if (player.powerUp === "ink") {
        const horizontalScale = Math.cos(player.pitch);
        this.snowballs.push({
          id: `${this.code}-ink-${++this.nextSnowballId}`,
          ownerId: player.id,
          kind: "ink",
          x: player.x,
          y: player.y + PLAYER_EYE_HEIGHT,
          z: player.z,
          velocityX: -Math.sin(player.rotation) * horizontalScale * INK_SPEED,
          velocityY: Math.sin(player.pitch) * INK_SPEED + 2.8,
          velocityZ: -Math.cos(player.rotation) * horizontalScale * INK_SPEED,
          expiresAt: now + SNOWBALL_LIFETIME_MS * 2,
        });
        this.consumePower(player);
        this.addMessage(`${player.name} lançou uma granada de tinta!`, "info");
      } else if (player.powerUp === "swap") {
        const target = this.swapWithTarget(player, now);
        this.consumePower(player);
        this.addMessage(
          target
            ? `${player.name} trocou de lugar com ${target.name}!`
            : `${player.name} disparou o raio de troca, mas não acertou ninguém.`,
          "info",
        );
      }
    }
  }

  consumePower(player) {
    player.powerUp = null;
    player.powerUpExpiresAt = 0;
  }

  addEffect(type, x, y, z, now, durationMs, end = null) {
    this.effects.push({
      id: `${this.code}-effect-${++this.nextEffectId}`,
      type,
      x,
      y,
      z,
      end,
      startedAt: now,
      expiresAt: now + durationMs,
    });
  }

  swapWithTarget(player, now) {
    const horizontalScale = Math.cos(player.pitch);
    const direction = {
      x: -Math.sin(player.rotation) * horizontalScale,
      y: Math.sin(player.pitch),
      z: -Math.cos(player.rotation) * horizontalScale,
    };
    const origin = {
      x: player.x,
      y: player.y + PLAYER_EYE_HEIGHT,
      z: player.z,
    };
    let target = null;
    let hitPoint = null;

    for (let distance = 0.35; distance <= SWAP_MAX_RANGE; distance += 0.35) {
      const point = {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance,
        z: origin.z + direction.z * distance,
      };
      if (
        point.x <= -ARENA.halfWidth ||
        point.x >= ARENA.halfWidth ||
        point.z <= -ARENA.halfDepth ||
        point.z >= ARENA.halfDepth ||
        point.y <= 0 ||
        pointIsBlocked(point, 0.12)
      ) {
        break;
      }
      target = [...this.players.values()].find((candidate) => {
        if (candidate.id === player.id || candidate.isEliminated) return false;
        const dx = candidate.x - point.x;
        const dy = candidate.y + 0.95 - point.y;
        const dz = candidate.z - point.z;
        return dx * dx + dy * dy + dz * dz <= 1.05 ** 2;
      }) ?? null;
      if (target) {
        hitPoint = point;
        break;
      }
    }

    if (!target || !hitPoint) return null;
    const oldPosition = { x: player.x, y: player.y, z: player.z };
    const targetPosition = { x: target.x, y: target.y, z: target.z };
    const oldVelocity = {
      x: player.velocityX,
      y: player.verticalVelocity,
      z: player.velocityZ,
    };
    const playerDestination = clampPlayerPosition(
      { x: targetPosition.x, z: targetPosition.z },
      targetPosition.y,
    );
    player.x = playerDestination.x;
    player.z = playerDestination.z;
    player.y = targetPosition.y;
    player.velocityX = target.velocityX;
    player.velocityZ = target.velocityZ;
    player.verticalVelocity = target.verticalVelocity;
    const targetDestination = clampPlayerPosition(
      { x: oldPosition.x, z: oldPosition.z },
      oldPosition.y,
    );
    target.x = targetDestination.x;
    target.z = targetDestination.z;
    target.y = oldPosition.y;
    target.velocityX = oldVelocity.x;
    target.velocityZ = oldVelocity.z;
    target.verticalVelocity = oldVelocity.y;
    player.grapple = null;
    target.grapple = null;
    this.addEffect(
      "swap",
      origin.x,
      origin.y,
      origin.z,
      now,
      500,
      hitPoint,
    );
    return target;
  }

  createGrapple(player, now) {
    const horizontalScale = Math.cos(player.pitch);
    const direction = {
      x: -Math.sin(player.rotation) * horizontalScale,
      y: Math.sin(player.pitch),
      z: -Math.cos(player.rotation) * horizontalScale,
    };
    const origin = {
      x: player.x,
      y: player.y + PLAYER_EYE_HEIGHT,
      z: player.z,
    };
    let anchor = origin;
    const sampleDistance = 0.3;

    for (
      let distance = sampleDistance;
      distance <= GRAPPLE_MAX_RANGE;
      distance += sampleDistance
    ) {
      const point = {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance,
        z: origin.z + direction.z * distance,
      };
      if (
        point.x <= -ARENA.halfWidth + 0.2 ||
        point.x >= ARENA.halfWidth - 0.2 ||
        point.z <= -ARENA.halfDepth + 0.2 ||
        point.z >= ARENA.halfDepth - 0.2 ||
        point.y <= 0 ||
        pointIsBlocked(point, 0.12)
      ) {
        break;
      }
      anchor = point;
    }

    const horizontalLength = Math.hypot(direction.x, direction.z);
    const offset = horizontalLength > 0.001 ? ARENA.playerRadius : 0;
    const destination = {
      x: Math.max(
        -ARENA.halfWidth + ARENA.playerRadius,
        Math.min(
          ARENA.halfWidth - ARENA.playerRadius,
          anchor.x - direction.x * offset,
        ),
      ),
      y: Math.max(0, anchor.y - PLAYER_EYE_HEIGHT),
      z: Math.max(
        -ARENA.halfDepth + ARENA.playerRadius,
        Math.min(
          ARENA.halfDepth - ARENA.playerRadius,
          anchor.z - direction.z * offset,
        ),
      ),
    };
    if (
      Math.hypot(
        destination.x - player.x,
        destination.y - player.y,
        destination.z - player.z,
      ) <= GRAPPLE_REACH_DISTANCE
    ) {
      return null;
    }
    return {
      anchor,
      destination,
      expiresAt: now + GRAPPLE_TIMEOUT_MS,
    };
  }

  updateSnowballs(now, deltaSeconds) {
    const activeSnowballs = [];
    for (const snowball of this.snowballs) {
      if (now >= snowball.expiresAt) {
        continue;
      }
      const start = {
        x: snowball.x,
        y: snowball.y,
        z: snowball.z,
      };
      if (snowball.kind === "ink") {
        snowball.velocityY -= GRAVITY * 0.42 * deltaSeconds;
      }
      const projectileSpeed = Math.hypot(
        snowball.velocityX,
        snowball.velocityY,
        snowball.velocityZ,
      );
      const travelDistance = projectileSpeed * deltaSeconds;
      const steps = Math.max(1, Math.ceil(travelDistance / 0.3));
      let collided = false;

      for (let step = 1; step <= steps; step += 1) {
        const fraction = step / steps;
        const point = {
          x: start.x + snowball.velocityX * deltaSeconds * fraction,
          y: start.y + snowball.velocityY * deltaSeconds * fraction,
          z: start.z + snowball.velocityZ * deltaSeconds * fraction,
        };
        if (
          point.x < -ARENA.halfWidth ||
          point.x > ARENA.halfWidth ||
          point.z < -ARENA.halfDepth ||
          point.z > ARENA.halfDepth ||
          point.y < 0 ||
          pointIsBlocked(point, SNOWBALL_RADIUS)
        ) {
          if (snowball.kind === "ink") {
            this.explodeInk(point, now);
          }
          collided = true;
          break;
        }

        const target = [...this.players.values()].find((player) => {
          if (player.id === snowball.ownerId || player.isEliminated) {
            return false;
          }
          const dx = player.x - point.x;
          const dy = player.y + 0.95 - point.y;
          const dz = player.z - point.z;
          return dx * dx + dy * dy + dz * dz <= 1.05 ** 2;
        });
        if (target) {
          if (snowball.kind === "ink") {
            this.explodeInk(point, now);
          } else {
            target.frozenUntil = now + FREEZE_DURATION_MS;
            target.grapple = null;
            target.knockbackX = 0;
            target.knockbackZ = 0;
            this.addMessage(
              `${target.name} ficou congelado por 3 segundos!`,
              "info",
            );
          }
          collided = true;
          break;
        }

        snowball.x = point.x;
        snowball.y = point.y;
        snowball.z = point.z;
      }
      if (!collided) {
        activeSnowballs.push(snowball);
      }
    }
    this.snowballs = activeSnowballs;
  }

  explodeInk(point, now) {
    for (const player of this.players.values()) {
      if (player.isEliminated) continue;
      const dx = player.x - point.x;
      const dy = player.y + 0.9 - point.y;
      const dz = player.z - point.z;
      if (dx * dx + dy * dy + dz * dz <= INK_RADIUS ** 2) {
        player.inkedUntil = Math.max(player.inkedUntil, now + INK_DURATION_MS);
      }
    }
    this.addEffect("ink", point.x, Math.max(0, point.y), point.z, now, 550);
    this.addMessage("A granada de tinta explodiu!", "info");
  }

  updatePowerUp(now) {
    if (!this.powerUp && now >= this.nextPowerUpAt) {
      const availableSpawns = SPAWN_POINTS.filter((spawn) =>
        [...this.players.values()].every((player) => {
          if (player.isEliminated) return true;
          const dx = spawn.x - player.x;
          const dz = spawn.z - player.z;
          return dx * dx + dz * dz >= 25;
        }),
      );
      if (availableSpawns.length === 0) {
        this.nextPowerUpAt = now + 3000;
        return;
      }

      const spawn =
        availableSpawns[Math.floor(this.random() * availableSpawns.length)];
      const type =
        POWER_UP_TYPES[
          Math.floor(this.random() * POWER_UP_TYPES.length)
        ] ?? POWER_UP_TYPES[0];
      if (!spawn) {
        this.nextPowerUpAt = now + 3000;
        return;
      }
      this.powerUp = {
        type,
        x: spawn.x,
        z: spawn.z,
        expiresAt: now + POWER_UP_LIFETIME_MS,
      };
      this.addMessage(
        `Um poder de ${POWER_UP_LABELS[type].toLowerCase()} apareceu na arena!`,
        "info",
      );
    }

    if (!this.powerUp) {
      return;
    }
    if (now >= this.powerUp.expiresAt) {
      this.powerUp = null;
      this.nextPowerUpAt = now + 3000;
      return;
    }

    const pickupDistanceSquared = POWER_UP_PICKUP_DISTANCE ** 2;
    for (const player of this.players.values()) {
      if (player.isEliminated || player.powerUp) {
        continue;
      }
      const dx = player.x - this.powerUp.x;
      const dz = player.z - this.powerUp.z;
      if (dx * dx + dz * dz > pickupDistanceSquared) {
        continue;
      }
      player.powerUp = this.powerUp.type;
      player.powerUpExpiresAt = 0;
      this.addMessage(
        `${player.name} pegou ${POWER_UP_LABELS[this.powerUp.type]}!`,
        "info",
      );
      this.powerUp = null;
      this.nextPowerUpAt = now + POWER_UP_RESPAWN_DELAY_MS;
      return;
    }
  }

  checkForTag(now) {
    if (now - this.lastTagAt < ROUND.tagCooldownMs) {
      return;
    }
    const chaser = this.players.get(this.itPlayerId ?? "");
    if (
      !chaser ||
      chaser.isEliminated ||
      chaser.frozenUntil > now ||
      chaser.spawnProtectedUntil > now
    ) {
      return;
    }
    const tagDistanceSquared = ROUND.tagDistance ** 2;
    for (const target of this.players.values()) {
      if (
        target.id === chaser.id ||
        target.isEliminated ||
        target.spawnProtectedUntil > now
      ) {
        continue;
      }
      const dx = chaser.x - target.x;
      const dz = chaser.z - target.z;
      const chaserHeight = chaser.isSliding ? PARKOUR.slideHeight : ARENA.playerHeight;
      const targetHeight = target.isSliding ? PARKOUR.slideHeight : ARENA.playerHeight;
      if (
        dx * dx + dz * dz > tagDistanceSquared ||
        Math.abs(
          chaser.y + chaserHeight / 2 - target.y - targetHeight / 2,
        ) > TAG_VERTICAL_TOLERANCE
      ) {
        continue;
      }

      chaser.isIt = false;
      chaser.taggerPenaltyEndsAt = 0;
      target.isIt = true;
      target.taggerPenaltyEndsAt = now + ROUND.taggerPenaltySeconds * 1000;
      this.itPlayerId = target.id;
      this.lastTagAt = now;
      this.nextHintAt = now + TAGGER_HINT_INTERVAL_MS;
      const event = {
        fromId: chaser.id,
        toId: target.id,
        fromName: chaser.name,
        toName: target.name,
        color: target.color,
        at: now,
      };
      this.addMessage(`${chaser.name} pegou ${target.name}!`, "tag");
      this.onEvent("game:tag", event);
      break;
    }
  }

  checkTaggerPenalty(now) {
    const tagger = this.players.get(this.itPlayerId ?? "");
    if (
      !tagger ||
      tagger.isEliminated ||
      now < tagger.taggerPenaltyEndsAt
    ) {
      return;
    }

    tagger.lives = Math.max(0, tagger.lives - 1);
    tagger.isIt = false;
    tagger.taggerPenaltyEndsAt = 0;
    if (tagger.lives > 0) {
      const spawn = randomSpawn(
        this.random,
        [...this.players.values()].filter(
          (player) => player.id !== tagger.id && !player.isEliminated,
        ),
      );
      tagger.x = spawn.x;
      tagger.y = 0;
      tagger.z = spawn.z;
      tagger.spawnProtectedUntil =
        now + ROUND.respawnInvulnerabilityMs;
      tagger.verticalVelocity = 0;
      tagger.velocityX = 0;
      tagger.velocityZ = 0;
      tagger.knockbackX = 0;
      tagger.knockbackZ = 0;
      tagger.input = normalizePlayerInput(null);
      tagger.inputUpdatedAt = now;
      tagger.jumpRequested = false;
      tagger.dashRequested = false;
      tagger.slideRequested = false;
      tagger.dashEndsAt = 0;
      tagger.dashCooldownEndsAt = 0;
      tagger.isMoving = false;
      tagger.isSprinting = false;
      tagger.isDashing = false;
      tagger.isSliding = false;
      tagger.slideEndsAt = 0;
      tagger.isWallRunning = false;
      tagger.wallRunSide = 0;
      tagger.isVaulting = false;
      tagger.slipstreamTargetId = null;
      tagger.slipstreamStartedAt = 0;
      tagger.isSlipstreaming = false;
      tagger.grapple = null;
      tagger.powerUp = null;
      tagger.powerUpExpiresAt = 0;
      tagger.frozenUntil = 0;
      tagger.inkedUntil = 0;
      tagger.gravityInvertedUntil = 0;
      this.addMessage(
        `${tagger.name} perdeu uma vida e voltou protegido!`,
        "info",
      );
    } else {
      tagger.isEliminated = true;
      tagger.isMoving = false;
      tagger.isSprinting = false;
      tagger.isDashing = false;
      tagger.isSliding = false;
      tagger.isWallRunning = false;
      tagger.isVaulting = false;
      tagger.input = normalizePlayerInput(null);
      tagger.grapple = null;
      tagger.powerUp = null;
      tagger.powerUpExpiresAt = 0;
      this.addMessage(`${tagger.name} explodiu e virou espectador!`, "info");
    }
    this.itPlayerId = null;

    const remaining = [...this.players.values()].filter(
      (player) => !player.isEliminated,
    );
    if (remaining.length <= 1) {
      this.finishRound(remaining[0]?.id ?? null);
      return;
    }
    const candidates = remaining.filter((player) => player.id !== tagger.id);
    const eligible = candidates.length > 0 ? candidates : remaining;
    const selected = eligible[Math.floor(this.random() * eligible.length)];
    if (!selected) {
      this.finishRound(null);
      return;
    }
    selected.isIt = true;
    selected.taggerPenaltyEndsAt =
      now + ROUND.taggerPenaltySeconds * 1000;
    this.itPlayerId = selected.id;
    this.lastTagAt = now;
    this.nextHintAt = now + FIRST_TAGGER_HINT_DELAY_MS;
    this.addMessage(`${selected.name} foi escolhido para pegar!`, "tag");
  }

  updateChaserHint(now) {
    if (now < this.nextHintAt) {
      return;
    }

    this.nextHintAt = now + TAGGER_HINT_INTERVAL_MS;
    const chaser = this.players.get(this.itPlayerId ?? "");
    if (!chaser) {
      return;
    }
    const visibleTargets = [...this.players.values()].filter(
      (player) =>
        player.id !== chaser.id &&
        !player.isEliminated &&
        !(
          player.powerUp === "invisibility" &&
          player.powerUpExpiresAt > now
        ),
    );
    if (visibleTargets.length === 0) {
      this.onHint(chaser.id, {
        text: "Ninguém está visível por enquanto. Continue procurando!",
      });
      return;
    }

    const target = visibleTargets.reduce((nearest, player) =>
      Math.hypot(player.x - chaser.x, player.z - chaser.z) <
      Math.hypot(nearest.x - chaser.x, nearest.z - chaser.z)
        ? player
        : nearest,
    );
    const dx = target.x - chaser.x;
    const dz = target.z - chaser.z;
    const forward =
      dx * -Math.sin(chaser.rotation) +
      dz * -Math.cos(chaser.rotation);
    const right =
      dx * Math.cos(chaser.rotation) -
      dz * Math.sin(chaser.rotation);
    const absForward = Math.abs(forward);
    const absRight = Math.abs(right);
    let direction;
    if (absForward > absRight * 1.7) {
      direction = forward >= 0 ? "à sua frente" : "atrás de você";
    } else if (absRight > absForward * 1.7) {
      direction = right >= 0 ? "à sua direita" : "à sua esquerda";
    } else {
      const verticalDirection = forward >= 0 ? "à frente" : "atrás";
      const lateralDirection = right >= 0 ? "à direita" : "à esquerda";
      direction = `${verticalDirection} e ${lateralDirection}`;
    }

    const distance = Math.hypot(dx, dz);
    const distanceHint =
      distance < 5
        ? "a menos de 5 m"
        : distance < 12
          ? "entre 5 e 12 m"
          : "a mais de 12 m";
    const heightHint =
      target.y > chaser.y + 2
        ? " em um ponto mais alto"
        : target.y < chaser.y - 2
          ? " em um ponto mais baixo"
          : "";
    this.onHint(chaser.id, {
      text: `O jogador mais próximo está ${direction}, ${distanceHint}${heightHint}.`,
    });
  }

  finishByScore() {
    let winner = null;
    for (const player of this.players.values()) {
      if (player.isEliminated) continue;
      if (!winner || player.survivalPoints > winner.survivalPoints) {
        winner = player;
      }
    }
    this.finishRound(winner?.id ?? null);
  }

  finishRound(winnerId) {
    if (this.phase !== "playing" && this.phase !== "countdown") {
      return;
    }
    this.phase = "finished";
    this.winnerId = winnerId;
    for (const player of this.players.values()) {
      player.isIt = false;
      player.taggerPenaltyEndsAt = 0;
      player.isMoving = false;
      player.isSprinting = false;
      player.isDashing = false;
      player.isSliding = false;
      player.isWallRunning = false;
      player.wallRunSide = 0;
      player.isVaulting = false;
      player.slipstreamTargetId = null;
      player.isSlipstreaming = false;
      player.input = normalizePlayerInput(null);
      player.y = 0;
      player.verticalVelocity = 0;
      player.jumpRequested = false;
      player.dashRequested = false;
      player.dashEndsAt = 0;
      player.powerUp = null;
      player.powerUpExpiresAt = 0;
      player.frozenUntil = 0;
      player.grapple = null;
      player.powerRequested = false;
    }
    this.powerUp = null;
    this.snowballs = [];
    this.effects = [];
    this.itPlayerId = null;
    this.nextPowerUpAt = 0;
    const winner = this.players.get(winnerId ?? "");
    const announcement = winner
      ? `${winner.name} venceu a rodada!`
      : "Fim de jogo!";
    this.addMessage(announcement, "win");
    this.onEvent("game:ended", this.getState());
  }

  addMessage(text, kind) {
    const message = {
      id: idForMessage(),
      text,
      kind,
      createdAt: this.clock(),
    };
    this.messages.unshift(message);
    this.messages = this.messages.slice(0, ROOM_MESSAGE_LIMIT);
    this.onEvent("game:feed", message);
  }

  getState(now = this.clock()) {
    const timeLeft =
      this.phase === "playing"
        ? Math.max(0, (this.roundEndsAt - now) / 1000)
        : this.phase === "countdown"
          ? Math.max(0, (this.countdownEndsAt - now) / 1000)
          : 0;
    return {
      code: this.code,
      phase: this.phase,
      players: [...this.players.values()].map((player) =>
        playerSnapshot(player, now),
      ),
      powerUp: this.powerUp
        ? {
            type: this.powerUp.type,
            x: this.powerUp.x,
            z: this.powerUp.z,
          }
        : null,
      snowballs: this.snowballs.map((snowball) => ({
        id: snowball.id,
        ownerId: snowball.ownerId,
        kind: snowball.kind,
        x: Math.round(snowball.x * 100) / 100,
        y: Math.round(snowball.y * 100) / 100,
        z: Math.round(snowball.z * 100) / 100,
      })),
      effects: this.effects.map((effect) => ({ ...effect })),
      hostId: this.hostId,
      itPlayerId: this.itPlayerId,
      timeLeft,
      countdown: Math.ceil(timeLeft),
      round: this.round,
      winnerId: this.winnerId,
      message: this.messages[0]?.text ?? "",
    };
  }

  getMessages() {
    return this.messages.slice();
  }
}
