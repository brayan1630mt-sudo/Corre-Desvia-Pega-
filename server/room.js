import {
  ARENA,
  BUILDING_LADDERS,
  CLIMBABLE_PLATFORMS,
  JUMP_PHYSICS,
  LADDER_CLIMB_SPEED,
  OBSTACLES,
  PLAYER_COLORS,
  POWER_UP_LABELS,
  POWER_UP_TYPES,
  ROUND,
  SPAWN_POINTS,
} from "../src/shared/constants.ts";
import { circleIntersectsRectangle } from "../src/shared/math.ts";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NAME_LIMIT = 18;
const ROOM_CODE_LENGTH = 5;
const MAX_INPUT_MAGNITUDE = 1;
const PLAYER_SPEED = 7.1;
const SPRINT_SPEED = 9.2;
const DASH_SPEED = 20;
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
const GRAPPLE_PULL_SPEED = 17;
const GRAPPLE_TIMEOUT_MS = 2600;
const GRAPPLE_REACH_DISTANCE = 0.8;
const PLAYER_EYE_HEIGHT = 1.57;
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

export function clampPlayerPosition(position, playerY = 0) {
  const radius = ARENA.playerRadius;
  const next = {
    x: Math.max(
      -ARENA.halfWidth + radius,
      Math.min(ARENA.halfWidth - radius, position.x),
    ),
    z: Math.max(
      -ARENA.halfDepth + radius,
      Math.min(ARENA.halfDepth - radius, position.z),
    ),
  };

  for (const obstacle of OBSTACLES) {
    if (playerY >= obstacle.collisionHeight - 0.02) {
      continue;
    }

    const minX = obstacle.x - obstacle.width / 2 - radius;
    const maxX = obstacle.x + obstacle.width / 2 + radius;
    const minZ = obstacle.z - obstacle.depth / 2 - radius;
    const maxZ = obstacle.z + obstacle.depth / 2 + radius;
    if (next.x <= minX || next.x >= maxX || next.z <= minZ || next.z >= maxZ) {
      continue;
    }

    const overlapX = Math.min(next.x - minX, maxX - next.x);
    const overlapZ = Math.min(next.z - minZ, maxZ - next.z);
    if (overlapX < overlapZ) {
      next.x =
        next.x - minX < maxX - next.x ? minX : maxX;
    } else {
      next.z =
        next.z - minZ < maxZ - next.z ? minZ : maxZ;
    }
  }

  for (const platform of CLIMBABLE_PLATFORMS) {
    if (playerY >= platform.height - 0.02) {
      continue;
    }

    const minX = platform.x - platform.width / 2 - radius;
    const maxX = platform.x + platform.width / 2 + radius;
    const minZ = platform.z - platform.depth / 2 - radius;
    const maxZ = platform.z + platform.depth / 2 + radius;
    if (next.x <= minX || next.x >= maxX || next.z <= minZ || next.z >= maxZ) {
      continue;
    }

    const overlapX = Math.min(next.x - minX, maxX - next.x);
    const overlapZ = Math.min(next.z - minZ, maxZ - next.z);
    if (overlapX < overlapZ) {
      next.x =
        next.x - minX < maxX - next.x ? minX : maxX;
    } else {
      next.z =
        next.z - minZ < maxZ - next.z ? minZ : maxZ;
    }
  }

  return next;
}

function platformAtPlayerHeight(player) {
  return CLIMBABLE_PLATFORMS.find(
    (platform) =>
      Math.abs(player.y - platform.height) <= 0.025 &&
      circleIntersectsRectangle(
        { x: player.x, z: player.z },
        ARENA.playerRadius,
        platform,
      ),
  );
}

function platformLandedOn(player, previousY, nextY) {
  if (player.verticalVelocity >= 0) {
    return null;
  }

  let landing = null;
  for (const platform of CLIMBABLE_PLATFORMS) {
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
  return CLIMBABLE_PLATFORMS.some(
    (platform) =>
      point.y >= 0 &&
      point.y <= platform.height &&
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
    this.lastUpdateAt = this.clock();
    this.powerUp = null;
    this.snowballs = [];
    this.nextSnowballId = 0;
    this.nextPowerUpAt = 0;
    this.messages = [];
    this.onEvent = options.onEvent ?? (() => {});
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
      climbingLadderId: null,
      jumpRequested: false,
      dashRequested: false,
      dashEndsAt: 0,
      dashDirectionX: 0,
      dashDirectionZ: 0,
      rotation: 0,
      pitch: 0,
      input: normalizePlayerInput(null),
      inputUpdatedAt: this.clock(),
      isIt: false,
      isMoving: false,
      isSprinting: false,
      isDashing: false,
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
    if (this.itPlayerId === id) {
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
    } else if (this.phase === "playing" && this.players.size === 1) {
      this.finishRound(this.players.keys().next().value ?? null);
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
    this.nextPowerUpAt = 0;
    for (const player of this.players.values()) {
      player.survivalPoints = 0;
      player.survivalProgressMs = 0;
      player.isIt = false;
      player.isReady = false;
      player.input = normalizePlayerInput(null);
      player.y = 0;
      player.verticalVelocity = 0;
      player.jumpRequested = false;
      player.dashRequested = false;
      player.dashEndsAt = 0;
      player.dashCooldownEndsAt = 0;
      player.isMoving = false;
      player.isSprinting = false;
      player.isDashing = false;
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
    if (!player || this.phase !== "playing") {
      return false;
    }
    const nextInput = normalizePlayerInput(input);
    if (nextInput.jump && !player.input.jump) {
      player.jumpRequested = true;
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
      this.awardSurvivalPoints(deltaSeconds);
      if (now >= this.roundEndsAt) {
        this.finishByScore();
      }
    }
    return this.getState(now);
  }

  beginRound(now = this.clock()) {
    if (this.players.size < ROUND.minimumPlayers) {
      this.phase = "waiting";
      return false;
    }
    const candidates = [...this.players.values()];
    const selected = candidates[Math.floor(this.random() * candidates.length)];
    if (!selected) {
      this.phase = "waiting";
      return false;
    }
    selected.isIt = true;
    this.itPlayerId = selected.id;
    this.phase = "playing";
    this.roundEndsAt = now + ROUND.durationSeconds * 1000;
    this.lastTagAt = now;
    this.lastUpdateAt = now;
    this.nextPowerUpAt = now + POWER_UP_SPAWN_DELAY_MS;
    this.addMessage(`${selected.name} começa pegando!`, "tag");
    this.onEvent("game:started", this.getState(now));
    return true;
  }

  movePlayers(now, deltaSeconds) {
    for (const player of this.players.values()) {
      const input = isPlayerInputFresh(player, now)
        ? player.input
        : normalizePlayerInput(null);
      if (player.powerUpExpiresAt > 0 && now >= player.powerUpExpiresAt) {
        player.powerUp = null;
        player.powerUpExpiresAt = 0;
      }
      if (player.frozenUntil > now) {
        player.jumpRequested = false;
        player.dashRequested = false;
        player.grapple = null;
        player.isMoving = false;
        player.isSprinting = false;
        player.isDashing = false;
        player.dashEndsAt = 0;
        continue;
      }
      player.frozenUntil = 0;
      if (player.grapple && this.moveGrapple(player, now, deltaSeconds)) {
        continue;
      }
      const onPlatform = platformAtPlayerHeight(player);
      if (
        player.jumpRequested &&
        player.verticalVelocity <= 0 &&
        (player.y <= 0.001 || onPlatform)
      ) {
        const jumpMultiplier =
          player.powerUp === "jump" ? POWER_UP_JUMP_MULTIPLIER : 1;
        player.verticalVelocity = JUMP_VELOCITY * jumpMultiplier;
      }
      player.jumpRequested = false;
      if (player.dashRequested) {
        player.dashRequested = false;
        if (now >= player.dashCooldownEndsAt) {
          const inputLength = Math.hypot(input.forward, input.right);
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

      const length = Math.hypot(input.forward, input.right);
      const hasHorizontalMovement = player.isDashing || length > 0.001;
      const isSprinting = input.sprint && !player.isDashing;
      const speedMultiplier =
        player.powerUp === "speed" ? POWER_UP_SPEED_MULTIPLIER : 1;
      const speed = player.isDashing
        ? DASH_SPEED
        : (isSprinting ? SPRINT_SPEED : PLAYER_SPEED) * speedMultiplier;
      const directionX = player.isDashing
        ? player.dashDirectionX
        : input.right / Math.max(1, length);
      const directionZ = player.isDashing
        ? player.dashDirectionZ
        : -input.forward / Math.max(1, length);
      const movement = hasHorizontalMovement
        ? {
            x: directionX * speed * deltaSeconds,
            z: directionZ * speed * deltaSeconds,
          }
        : { x: 0, z: 0 };
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
        if (player.y <= 0.001 || player.y >= ladder.roofHeight - 0.001) {
          player.climbingLadderId = null;
        }
        continue;
      }

      player.climbingLadderId = null;
      if (!hasHorizontalMovement) {
        player.isMoving = false;
        player.isSprinting = false;
      } else {
        const next = clampPlayerPosition(
          {
            x: player.x + movement.x,
            z: player.z + movement.z,
          },
          player.y,
        );
        player.isMoving =
          Math.hypot(next.x - player.x, next.z - player.z) > 0.0001;
        player.x = next.x;
        player.z = next.z;
        player.isSprinting = isSprinting && player.isMoving;
      }

      const support = player.verticalVelocity === 0 && player.y > 0.001
        ? platformAtPlayerHeight(player)
        : undefined;
      if (support) {
        player.y = support.height;
      } else if (player.y > 0 || player.verticalVelocity > 0) {
        const previousY = player.y;
        player.verticalVelocity -= GRAVITY * deltaSeconds;
        const nextY = Math.max(
          0,
          player.y + player.verticalVelocity * deltaSeconds,
        );
        const landing = platformLandedOn(player, previousY, nextY);
        if (landing) {
          player.y = landing.height;
          player.verticalVelocity = 0;
        } else {
          player.y = nextY;
          if (player.y === 0) {
            player.verticalVelocity = 0;
          }
        }
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
      now >= grapple.expiresAt ||
      distance <= GRAPPLE_REACH_DISTANCE
    ) {
      player.grapple = null;
      player.verticalVelocity = 0;
      player.isMoving = false;
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
    player.isMoving = movedDistance > 0.0001;
    player.isSprinting = false;
    player.isDashing = false;
    player.dashEndsAt = 0;
    player.climbingLadderId = null;
    return true;
  }

  awardSurvivalPoints(deltaSeconds) {
    for (const player of this.players.values()) {
      if (player.isIt) {
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
      if (player.frozenUntil > now || player.grapple || !player.powerUp) {
        continue;
      }

      if (player.powerUp === "freeze") {
        const horizontalScale = Math.cos(player.pitch);
        this.snowballs.push({
          id: `${this.code}-snow-${++this.nextSnowballId}`,
          ownerId: player.id,
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
      }
    }
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
      const travelDistance = SNOWBALL_SPEED * deltaSeconds;
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
          collided = true;
          break;
        }

        const target = [...this.players.values()].find((player) => {
          if (player.id === snowball.ownerId) {
            return false;
          }
          const dx = player.x - point.x;
          const dy = player.y + 0.95 - point.y;
          const dz = player.z - point.z;
          return dx * dx + dy * dy + dz * dz <= 1.05 ** 2;
        });
        if (target) {
          target.frozenUntil = now + FREEZE_DURATION_MS;
          target.grapple = null;
          this.addMessage(
            `${target.name} ficou congelado por 3 segundos!`,
            "info",
          );
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

  updatePowerUp(now) {
    if (!this.powerUp && now >= this.nextPowerUpAt) {
      const availableSpawns = SPAWN_POINTS.filter((spawn) =>
        [...this.players.values()].every((player) => {
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
      if (player.powerUp) {
        continue;
      }
      const dx = player.x - this.powerUp.x;
      const dz = player.z - this.powerUp.z;
      if (dx * dx + dz * dz > pickupDistanceSquared) {
        continue;
      }
      player.powerUp = this.powerUp.type;
      player.powerUpExpiresAt =
        this.powerUp.type === "speed" || this.powerUp.type === "jump"
          ? now + POWER_UP_EFFECT_DURATION_MS
          : this.powerUp.type === "invisibility"
            ? now + INVISIBILITY_DURATION_MS
            : 0;
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
    if (!chaser || chaser.frozenUntil > now) {
      return;
    }
    const tagDistanceSquared = ROUND.tagDistance ** 2;
    for (const target of this.players.values()) {
      if (target.id === chaser.id) {
        continue;
      }
      const dx = chaser.x - target.x;
      const dz = chaser.z - target.z;
      if (
        dx * dx + dz * dz > tagDistanceSquared ||
        Math.abs(chaser.y - target.y) > TAG_VERTICAL_TOLERANCE
      ) {
        continue;
      }

      chaser.isIt = false;
      target.isIt = true;
      this.itPlayerId = target.id;
      this.lastTagAt = now;
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

  finishByScore() {
    let winner = null;
    for (const player of this.players.values()) {
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
      player.isMoving = false;
      player.isSprinting = false;
      player.isDashing = false;
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
        x: Math.round(snowball.x * 100) / 100,
        y: Math.round(snowball.y * 100) / 100,
        z: Math.round(snowball.z * 100) / 100,
      })),
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
