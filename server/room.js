import {
  ARENA,
  OBSTACLES,
  PLAYER_COLORS,
  ROUND,
  SPAWN_POINTS,
} from "../src/shared/constants.ts";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NAME_LIMIT = 18;
const ROOM_CODE_LENGTH = 5;
const MAX_INPUT_MAGNITUDE = 1;
const PLAYER_SPEED = 7.1;
const SPRINT_SPEED = 9.2;
const INPUT_STALE_MS = 260;
const ROOM_MESSAGE_LIMIT = 6;

export function sanitizePlayerName(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, NAME_LIMIT);
}

export function normalizePlayerInput(value) {
  if (!value || typeof value !== "object") {
    return { forward: 0, right: 0, sprint: false };
  }

  const normalizeAxis = (axis) => {
    if (typeof axis !== "number" || !Number.isFinite(axis)) {
      return 0;
    }
    return Math.max(-MAX_INPUT_MAGNITUDE, Math.min(MAX_INPUT_MAGNITUDE, axis));
  };

  return {
    forward: normalizeAxis(value.forward),
    right: normalizeAxis(value.right),
    sprint: value.sprint === true,
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

export function clampPlayerPosition(position) {
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

  return next;
}

function randomSpawn(random) {
  return SPAWN_POINTS[Math.floor(random() * SPAWN_POINTS.length)];
}

function nowMilliseconds() {
  return Date.now();
}

function idForMessage() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPlayerInputFresh(player, now) {
  return now - player.inputUpdatedAt <= INPUT_STALE_MS;
}

function playerSnapshot(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: Math.round(player.x * 100) / 100,
    z: Math.round(player.z * 100) / 100,
    rotation: Math.round(player.rotation * 1000) / 1000,
    isIt: player.isIt,
    isSprinting: player.isSprinting,
    isReady: player.isReady,
    catches: player.catches,
    caughtCount: player.caughtCount,
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
    this.messages = [];
    this.onEvent = options.onEvent ?? (() => {});
  }

  get playerCount() {
    return this.players.size;
  }

  addPlayer(id, name) {
    if (this.players.has(id)) {
      return playerSnapshot(this.players.get(id));
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
    const spawn = randomSpawn(this.random);
    const colorIndex = this.players.size % PLAYER_COLORS.length;
    const player = {
      id,
      name: cleanName,
      color: PLAYER_COLORS[colorIndex],
      x: spawn.x,
      z: spawn.z,
      rotation: 0,
      input: normalizePlayerInput(null),
      inputUpdatedAt: this.clock(),
      isIt: false,
      isSprinting: false,
      isReady: false,
      catches: 0,
      caughtCount: 0,
      connected: true,
    };

    this.players.set(id, player);
    if (!this.hostId) {
      this.hostId = id;
    }
    this.addMessage(`${cleanName} entrou na sala.`, "info");
    return playerSnapshot(player);
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) {
      return false;
    }

    this.players.delete(id);
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
    for (const player of this.players.values()) {
      player.catches = 0;
      player.caughtCount = 0;
      player.isIt = false;
      player.isReady = false;
      player.input = normalizePlayerInput(null);
    }
    this.addMessage(`Rodada ${this.round} vai começar!`, "info");
    return this.getState();
  }

  setInput(id, input) {
    const player = this.players.get(id);
    if (!player || this.phase !== "playing") {
      return false;
    }
    player.input = normalizePlayerInput(input);
    player.inputUpdatedAt = this.clock();
    player.isSprinting = player.input.sprint;
    const magnitude = Math.hypot(player.input.forward, player.input.right);
    if (magnitude > 0.02) {
      player.rotation = Math.atan2(player.input.right, player.input.forward);
    }
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
      this.checkForTag(now);
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
    this.addMessage(`${selected.name} começa pegando!`, "tag");
    this.onEvent("game:started", this.getState(now));
    return true;
  }

  movePlayers(now, deltaSeconds) {
    for (const player of this.players.values()) {
      const input = isPlayerInputFresh(player, now)
        ? player.input
        : normalizePlayerInput(null);
      const length = Math.hypot(input.forward, input.right);
      if (length <= 0.001) {
        player.isSprinting = false;
        continue;
      }

      const isSprinting = input.sprint;
      const speed = isSprinting ? SPRINT_SPEED : PLAYER_SPEED;
      const step = (speed * deltaSeconds) / Math.max(1, length);
      const next = clampPlayerPosition({
        x: player.x + input.right * step,
        z: player.z - input.forward * step,
      });
      player.x = next.x;
      player.z = next.z;
      player.isSprinting = isSprinting;
    }
  }

  checkForTag(now) {
    if (now - this.lastTagAt < ROUND.tagCooldownMs) {
      return;
    }
    const chaser = this.players.get(this.itPlayerId ?? "");
    if (!chaser) {
      return;
    }
    const tagDistanceSquared = ROUND.tagDistance ** 2;
    for (const target of this.players.values()) {
      if (target.id === chaser.id) {
        continue;
      }
      const dx = chaser.x - target.x;
      const dz = chaser.z - target.z;
      if (dx * dx + dz * dz > tagDistanceSquared) {
        continue;
      }

      chaser.isIt = false;
      target.isIt = true;
      chaser.catches += 1;
      target.caughtCount += 1;
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
      if (!winner || player.catches > winner.catches) {
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
      player.isSprinting = false;
      player.input = normalizePlayerInput(null);
    }
    const winner = this.players.get(winnerId ?? "");
    const announcement = winner
      ? `${winner.name} venceu a rodada!`
      : "Fim de jogo!";
    this.addMessage(announcement, "win");
    this.onEvent("game:ended", this.getState());
  }

  addMessage(text, kind) {
    this.messages.unshift({
      id: idForMessage(),
      text,
      kind,
      createdAt: this.clock(),
    });
    this.messages = this.messages.slice(0, ROOM_MESSAGE_LIMIT);
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
      players: [...this.players.values()].map(playerSnapshot),
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
