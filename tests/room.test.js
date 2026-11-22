import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlayerPosition,
  GameRoom,
  generateRoomCode,
  normalizePlayerInput,
  sanitizePlayerName,
} from "../server/room.js";
import {
  ARENA,
  BUILDING_LADDERS,
  CLIMBABLE_PLATFORMS,
  LADDER_CLIMB_SPEED,
  MAX_JUMP_HEIGHT,
  OBSTACLES,
  PLAYER_COLORS,
  SPAWN_POINTS,
} from "../src/shared/constants.ts";
import { resolveArenaPosition } from "../src/shared/math.ts";

test("sanitizes display names without changing useful accents", () => {
  assert.equal(sanitizePlayerName("  João   da Silva  "), "João da Silva");
  assert.equal(sanitizePlayerName("<b>bad</b>"), "bad");
  assert.equal(sanitizePlayerName(""), "");
  assert.equal(sanitizePlayerName("a".repeat(40)).length, 18);
  assert.equal(sanitizePlayerName("ana\nmaria"), "anamaria");
});

test("bounds movement input and rejects non-finite axes", () => {
  assert.deepEqual(normalizePlayerInput({
    forward: 8,
    right: -3,
    sprint: true,
    jump: true,
    dash: true,
    usePower: true,
  }), {
    forward: 1,
    right: -1,
    sprint: true,
    jump: true,
    dash: true,
    usePower: true,
    yaw: 0,
    pitch: 0,
  });
  assert.deepEqual(
    normalizePlayerInput({ forward: Number.NaN, right: "left", sprint: 1 }),
    { forward: 0, right: 0, sprint: false, jump: false, dash: false, usePower: false, yaw: 0, pitch: 0 },
  );
});

test("clamps camera pitch and wraps the player's view direction", () => {
  const input = normalizePlayerInput({
    yaw: Math.PI * 3,
    pitch: 4,
  });
  assert.ok(Math.abs(Math.abs(input.yaw) - Math.PI) < 0.0001);
  assert.equal(input.pitch, 0.48);
});

test("generates room codes from an unambiguous alphabet", () => {
  assert.equal(generateRoomCode(() => 0), "AAAAA");
  assert.equal(generateRoomCode(() => 0.99).length, 5);
  assert.match(generateRoomCode(() => 0.99), /^[A-HJ-NP-Z2-9]{5}$/);
});

test("keeps players inside the arena and outside obstacle bounds", () => {
  const edge = clampPlayerPosition({ x: 1000, z: -1000 });
  assert.equal(edge.x, ARENA.halfWidth - ARENA.playerRadius);
  assert.equal(edge.z, -ARENA.halfDepth + ARENA.playerRadius);

  const barrier = OBSTACLES.find((obstacle) => obstacle.kind === "barrier");
  assert.ok(barrier);
  const blocked = clampPlayerPosition({ x: barrier.x, z: barrier.z });
  assert.notDeepEqual(blocked, { x: barrier.x, z: barrier.z });
  assert.deepEqual(
    clampPlayerPosition({ x: barrier.x, z: barrier.z }, barrier.height),
    { x: barrier.x, z: barrier.z },
  );
});

test("low street barriers block ground movement but can be crossed in a jump", () => {
  const barrier = OBSTACLES.find((obstacle) => obstacle.kind === "barrier");
  assert.ok(barrier);
  const start = {
    x: barrier.x - barrier.width / 2 - ARENA.playerRadius - 1,
    z: barrier.z,
  };
  const movement = { x: 1.5, z: 0 };
  const blocked = resolveArenaPosition(start, movement);
  const airborne = resolveArenaPosition(
    start,
    movement,
    ARENA.playerRadius,
    barrier.height,
  );
  assert.ok(airborne.x > blocked.x);
});

test("the room server clamps a grounded player against a street barrier", () => {
  let now = 1000;
  const room = new GameRoom("BLOCK", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const barrier = OBSTACLES.find((obstacle) => obstacle.kind === "barrier");
  assert.ok(barrier);
  const player = room.players.get("one");
  player.x = barrier.x - barrier.width / 2 - ARENA.playerRadius - 0.1;
  player.z = barrier.z;
  room.setInput("one", { right: 1 });
  now += 50;
  room.tick(now);

  assert.equal(
    player.x,
    barrier.x - barrier.width / 2 - ARENA.playerRadius,
  );
  assert.equal(player.z, barrier.z);
});

test("players can climb a hand ladder onto a roof and descend", () => {
  let now = 1000;
  const room = new GameRoom("LADDER", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const ladder = BUILDING_LADDERS[0];
  const player = room.players.get("one");
  player.x = ladder.approachX;
  player.z = ladder.z;
  const climbTicks = Math.ceil(
    ladder.roofHeight / (LADDER_CLIMB_SPEED * 0.05),
  ) + 2;
  for (let step = 0; step < climbTicks; step += 1) {
    room.setInput("one", { right: ladder.directionX });
    now += 50;
    room.tick(now);
  }

  assert.ok(Math.abs(player.y - ladder.roofHeight) < 0.001);
  assert.ok(
    Math.abs(player.x - ladder.roofX) < ladder.roofWidth / 2,
    "the player can move from the top of the ladder onto the roof",
  );
  const building = OBSTACLES.find(
    (obstacle) =>
      obstacle.x === ladder.roofX && obstacle.z === ladder.roofZ,
  );
  assert.ok(building);
  assert.deepEqual(
    clampPlayerPosition(
      { x: building.x, z: building.z },
      ladder.roofHeight,
    ),
    { x: building.x, z: building.z },
  );

  player.x = ladder.approachX;
  player.z = ladder.z;
  player.y = ladder.roofHeight / 2;
  player.verticalVelocity = 0;
  player.climbingLadderId = ladder.id;
  const descentTicks = Math.ceil(
    player.y / (LADDER_CLIMB_SPEED * 0.05),
  ) + 2;
  for (let step = 0; step < descentTicks; step += 1) {
    room.setInput("one", { right: -ladder.directionX });
    now += 50;
    room.tick(now);
  }
  assert.equal(player.y, 0);
});

test("buildings stay solid until the player clears their height", () => {
  const building = OBSTACLES.find((obstacle) => obstacle.kind === "building");
  assert.ok(building);
  const groundPosition = clampPlayerPosition(
    { x: building.x, z: building.z },
    0,
  );
  const facadePosition = clampPlayerPosition(
    { x: building.x, z: building.z },
    building.height,
  );
  const roofPosition = clampPlayerPosition(
    { x: building.x, z: building.z },
    building.collisionHeight,
  );
  assert.notDeepEqual(groundPosition, { x: building.x, z: building.z });
  assert.notDeepEqual(facadePosition, { x: building.x, z: building.z });
  assert.deepEqual(roofPosition, { x: building.x, z: building.z });
});

test("every building roof has a matching solid landing surface", () => {
  const buildings = OBSTACLES.filter(
    (obstacle) => obstacle.kind === "building",
  );
  const roofs = CLIMBABLE_PLATFORMS.filter(
    (platform) => platform.kind === "roof",
  );
  assert.equal(roofs.length, buildings.length);

  for (const building of buildings) {
    const roof = roofs.find(
      (platform) =>
        platform.x === building.x && platform.z === building.z,
    );
    assert.ok(roof);
    assert.equal(roof.height, building.collisionHeight);
    assert.ok(
      roof.width >= building.width && roof.depth >= building.depth,
    );
  }
});

test("the server lands players on a roof without a ladder", () => {
  let now = 1000;
  const room = new GameRoom("ROOF1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const roof = CLIMBABLE_PLATFORMS.find(
    (platform) =>
      platform.kind === "roof" &&
      !BUILDING_LADDERS.some(
        (ladder) => ladder.roofX === platform.x && ladder.roofZ === platform.z,
      ),
  );
  assert.ok(roof);
  const player = room.players.get("one");
  player.x = roof.x;
  player.z = roof.z;
  player.y = roof.height + 0.1;
  player.verticalVelocity = -2;
  now += 50;
  room.tick(now);

  assert.equal(player.y, roof.height);
  assert.equal(player.verticalVelocity, 0);
});

test("parkour steps fit within one normal jump and spawns avoid solid geometry", () => {
  const jumpablePlatforms = CLIMBABLE_PLATFORMS.filter(
    (platform) => platform.kind !== "roof",
  );
  assert.ok(
    Math.max(...jumpablePlatforms.map((platform) => platform.height)) <
      MAX_JUMP_HEIGHT,
  );
  for (const spawn of SPAWN_POINTS) {
    assert.deepEqual(resolveArenaPosition(spawn, { x: 0, z: 0 }), spawn);
  }
});

test("climbable objects are spread around the arena instead of forming stair runs", () => {
  const scatteredPlatforms = CLIMBABLE_PLATFORMS.filter(
    (platform) => platform.kind !== "roof",
  );
  const quadrants = new Set(
    scatteredPlatforms.map((platform) =>
      `${Math.sign(platform.x)}:${Math.sign(platform.z)}`,
    ),
  );
  assert.equal(quadrants.size, 4);
  for (let first = 0; first < scatteredPlatforms.length; first += 1) {
    for (let second = first + 1; second < scatteredPlatforms.length; second += 1) {
      const a = scatteredPlatforms[first];
      const b = scatteredPlatforms[second];
      assert.ok(a && b);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 6);
    }
  }
});

test("climbable platforms block ground movement but allow movement at their top", () => {
  const platform = CLIMBABLE_PLATFORMS[0];
  const start = {
    x: platform.x - platform.width / 2 - 1,
    z: platform.z,
  };
  const movement = { x: 1, z: 0 };
  const blocked = resolveArenaPosition(
    start,
    movement,
    ARENA.playerRadius,
    0,
  );
  const onTop = resolveArenaPosition(
    start,
    movement,
    ARENA.playerRadius,
    platform.height,
  );
  assert.ok(onTop.x > blocked.x);
});

test("assigns the first player as host and reassigns host on departure", () => {
  const room = new GameRoom("AB123", { random: () => 0.25, clock: () => 1000 });
  room.addPlayer("first", "Primeira");
  room.addPlayer("second", "Segunda");
  assert.equal(room.hostId, "first");
  assert.equal(room.removePlayer("first"), true);
  assert.equal(room.hostId, "second");
  assert.equal(room.getState().players.length, 1);
});

test("chooses a separate spawn point for players joining together", () => {
  const room = new GameRoom("SPAWN", { random: () => 0, clock: () => 1000 });
  const first = room.addPlayer("first", "Primeira");
  const second = room.addPlayer("second", "Segunda");
  const dx = first.x - second.x;
  const dz = first.z - second.z;
  assert.ok(dx * dx + dz * dz >= 36);
});

test("players can choose a supported character color", () => {
  const room = new GameRoom("COLOR", { random: () => 0, clock: () => 1000 });
  const selectedColor = PLAYER_COLORS[3];
  const player = room.addPlayer("one", "Um", selectedColor);
  assert.equal(player.color, selectedColor);
  assert.throws(
    () => room.addPlayer("two", "Dois", "#123456"),
    /cor do personagem/i,
  );
});

test("requires host and minimum players to begin a countdown", () => {
  let now = 1000;
  const room = new GameRoom("GAME1", { random: () => 0, clock: () => now });
  room.addPlayer("host", "Host");
  assert.throws(() => room.startGame("host"), /pelo menos 2/);

  room.addPlayer("guest", "Convidado");
  assert.throws(() => room.startGame("guest"), /anfitrião/);
  assert.equal(room.startGame("host").phase, "countdown");
  now += 4500;
  const started = room.tick(now);
  assert.equal(started.phase, "playing");
  assert.ok(started.players.some((player) => player.isIt));
});

test("awards survival points only while a player is not being chased", () => {
  let now = 1000;
  const room = new GameRoom("SCORE", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const tagger = room.players.get(room.itPlayerId);
  const survivor = [...room.players.values()].find(
    (player) => player.id !== tagger.id,
  );
  assert.ok(tagger && survivor);

  for (let step = 0; step < 20; step += 1) {
    now += 50;
    room.tick(now);
  }
  assert.equal(survivor.survivalPoints, 1);
  assert.equal(tagger.survivalPoints, 0);

  survivor.x = tagger.x;
  survivor.z = tagger.z;
  now += 1800;
  room.checkForTag(now);
  assert.equal(survivor.isIt, true);
  const caughtPlayerPoints = survivor.survivalPoints;

  for (let step = 0; step < 20; step += 1) {
    now += 50;
    room.tick(now);
  }
  assert.equal(survivor.survivalPoints, caughtPlayerPoints);
  assert.ok(tagger.survivalPoints > 0);
});

test("the round winner is selected by survival points", () => {
  const room = new GameRoom("WINPT", { random: () => 0, clock: () => 1000 });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  room.beginRound(5500);
  room.players.get("one").survivalPoints = 2;
  room.players.get("two").survivalPoints = 7;

  room.finishByScore();
  assert.equal(room.winnerId, "two");
});

test("moves input on the server and stops stale inputs", () => {
  let now = 1000;
  const room = new GameRoom("MOVE1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  const before = player.x;
  room.setInput("one", { forward: 1, right: 0 });
  now += 50;
  let state = room.tick(now);
  assert.ok(player.z < 0 || player.x !== before);
  assert.equal(player.isMoving, true);
  assert.equal(player.isSprinting, false);
  assert.equal(state.players.find((entry) => entry.id === "one").isMoving, true);

  room.setInput("one", { forward: 1, right: 0, sprint: true });
  now += 50;
  state = room.tick(now);
  assert.equal(player.isMoving, true);
  assert.equal(player.isSprinting, true);
  const moved = player.z;
  now += 500;
  room.tick(now);
  assert.equal(player.z, moved);
  assert.equal(player.isMoving, false);
  assert.equal(player.isSprinting, false);
});

test("dashes in the view direction and enforces a server-side cooldown", () => {
  let now = 1000;
  const room = new GameRoom("DASH1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  const startZ = player.z;

  room.setInput("one", { dash: true });
  now += 50;
  let state = room.tick(now);
  assert.ok(player.z < startZ - 0.9);
  assert.equal(player.isDashing, true);
  assert.equal(state.players.find((entry) => entry.id === "one").isDashing, true);
  const cooldownEndsAt = player.dashCooldownEndsAt;

  room.setInput("one", { dash: false });
  now += 200;
  room.tick(now);
  assert.equal(player.isDashing, false);

  const afterDashZ = player.z;
  room.setInput("one", { dash: true });
  now += 50;
  state = room.tick(now);
  assert.equal(player.z, afterDashZ);
  assert.equal(player.isDashing, false);
  assert.equal(player.dashCooldownEndsAt, cooldownEndsAt);

  now = cooldownEndsAt;
  room.setInput("one", { dash: false });
  now += 50;
  room.tick(now);
  room.setInput("one", { dash: true });
  now += 50;
  state = room.tick(now);
  assert.equal(player.isDashing, true);
  assert.ok(player.dashCooldownEndsAt > cooldownEndsAt);
  assert.equal(state.players.find((entry) => entry.id === "one").isDashing, true);
});

test("jumps once per press and lands under server physics", () => {
  let now = 1000;
  const room = new GameRoom("JUMP1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");

  room.setInput("one", { jump: true });
  now += 50;
  room.tick(now);
  const firstHeight = player.y;
  const firstVelocity = player.verticalVelocity;
  assert.ok(firstHeight > 0);

  room.setInput("one", { jump: true });
  now += 50;
  room.tick(now);
  assert.ok(player.y > firstHeight);
  assert.ok(player.verticalVelocity < firstVelocity);

  room.setInput("one", { jump: false });
  for (let step = 0; step < 20; step += 1) {
    now += 50;
    room.tick(now);
  }
  assert.equal(player.y, 0);
  assert.equal(player.verticalVelocity, 0);
});

test("lands on a raised platform and can jump again from its top", () => {
  let now = 1000;
  const room = new GameRoom("PLATF", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const player = room.players.get("one");
  const platform = CLIMBABLE_PLATFORMS[0];
  player.x = platform.x;
  player.z = platform.z;
  player.y = platform.height + 0.1;
  player.verticalVelocity = -2;
  now += 50;
  room.tick(now);
  assert.equal(player.y, platform.height);
  assert.equal(player.verticalVelocity, 0);

  room.setInput("one", { jump: true });
  now += 50;
  room.tick(now);
  assert.ok(player.y > platform.height);
});

test("spawns crystals during a round and grants collected boosts", () => {
  let now = 1000;
  const room = new GameRoom("CRYST", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  assert.equal(room.getState(now).powerUp, null);

  now += 8000;
  room.tick(now);
  assert.ok(room.powerUp);
  const crystal = { ...room.powerUp };
  const player = room.players.get("one");
  player.x = crystal.x;
  player.z = crystal.z;

  now += 50;
  const state = room.tick(now);
  assert.equal(room.powerUp, null);
  assert.equal(player.powerUp, crystal.type);
  assert.equal(player.powerUpExpiresAt, now + 7000);
  assert.equal(state.players.find((entry) => entry.id === "one").powerUp, "speed");

  player.x = 5;
  player.z = 0;
  room.setInput("one", { forward: 1 });
  now += 50;
  room.tick(now);
  assert.ok(player.z < -0.5);
});

test("jump crystals increase the jump impulse temporarily", () => {
  let now = 1000;
  const room = new GameRoom("JMPUP", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  player.powerUp = "jump";
  player.powerUpExpiresAt = now + 7000;

  room.setInput("one", { jump: true });
  now += 50;
  room.tick(now);
  assert.ok(player.verticalVelocity > 9);
});

test("invisibility pickups hide the player for a limited time", () => {
  let now = 1000;
  const room = new GameRoom("INVIS", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  room.powerUp = {
    type: "invisibility",
    x: player.x,
    z: player.z,
    expiresAt: now + 10000,
  };

  now += 50;
  let state = room.tick(now);
  assert.equal(player.powerUp, "invisibility");
  assert.equal(player.powerUpExpiresAt, now + 7000);
  assert.equal(state.players.find((entry) => entry.id === "one").isInvisible, true);

  now = player.powerUpExpiresAt;
  state = room.tick(now);
  assert.equal(player.powerUp, null);
  assert.equal(state.players.find((entry) => entry.id === "one").isInvisible, false);
});

test("a snowball is consumed once and freezes a hit player", () => {
  let now = 1000;
  const room = new GameRoom("SNOW1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const thrower = room.players.get("one");
  const target = room.players.get("two");
  thrower.x = 0;
  thrower.z = 0;
  target.x = 0;
  target.z = -4;
  room.powerUp = {
    type: "freeze",
    x: thrower.x,
    z: thrower.z,
    expiresAt: now + 10000,
  };

  now += 50;
  room.tick(now);
  assert.equal(thrower.powerUp, "freeze");
  room.setInput("one", { usePower: true, yaw: 0, pitch: 0 });
  now += 50;
  room.tick(now);
  assert.equal(thrower.powerUp, null);
  assert.equal(room.nextSnowballId, 1);
  assert.equal(room.snowballs.length, 1);

  room.setInput("one", { usePower: false, yaw: 0, pitch: 0 });
  for (let step = 0; step < 5 && target.frozenUntil <= now; step += 1) {
    now += 50;
    room.tick(now);
  }
  assert.ok(target.frozenUntil > now);
  assert.equal(room.snowballs.length, 0);

  const frozenPosition = { x: target.x, z: target.z };
  room.setInput("two", { forward: 1 });
  now += 50;
  const state = room.tick(now);
  assert.deepEqual({ x: target.x, z: target.z }, frozenPosition);
  assert.equal(state.players.find((entry) => entry.id === "two").isFrozen, true);
});

test("rapel consumes its pickup and pulls toward the aimed anchor", () => {
  let now = 1000;
  const room = new GameRoom("GRAPP", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  player.x = 0;
  player.z = 0;
  player.powerUp = "grapple";
  const start = { x: player.x, y: player.y, z: player.z };
  room.setInput("one", { usePower: true, yaw: 0, pitch: -0.2 });
  now += 50;
  let state = room.tick(now);
  assert.equal(player.powerUp, null);
  assert.ok(player.grapple);
  assert.ok(
    state.players.find((entry) => entry.id === "one").grappleAnchor,
  );
  const initialDistance = Math.hypot(
    player.grapple.destination.x - start.x,
    player.grapple.destination.y - start.y,
    player.grapple.destination.z - start.z,
  );

  room.setInput("one", { usePower: false, yaw: 0, pitch: -0.2 });
  now += 50;
  state = room.tick(now);
  const remainingDistance = Math.hypot(
    player.grapple.destination.x - player.x,
    player.grapple.destination.y - player.y,
    player.grapple.destination.z - player.z,
  );
  assert.ok(remainingDistance < initialDistance);
  assert.ok(
    state.players.find((entry) => entry.id === "one").grappleAnchor,
  );
});

test("keeps avatar orientation aligned with the camera while standing still", () => {
  let now = 1000;
  const room = new GameRoom("LOOK1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  room.setInput("one", { yaw: Math.PI / 2, pitch: 0.3 });

  const player = room.players.get("one");
  assert.ok(Math.abs(player.rotation - Math.PI / 2) < 0.001);
  assert.equal(player.pitch, 0.3);
  const snapshot = room.getState().players.find((entry) => entry.id === "one");
  assert.ok(snapshot);
  assert.ok(Math.abs(snapshot.rotation - Math.PI / 2) < 0.001);
  assert.equal(snapshot.pitch, 0.3);
});

test("tags nearby players and announces the new tagger", () => {
  let now = 1000;
  const events = [];
  const room = new GameRoom("TAG01", {
    random: () => 0,
    clock: () => now,
    onEvent: (name, payload) => events.push({ name, payload }),
  });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const tagger = room.players.get(room.itPlayerId);
  const target = [...room.players.values()].find((player) => !player.isIt);
  target.x = tagger.x;
  target.z = tagger.z;
  now += 2000;
  room.tick(now);
  assert.equal(room.itPlayerId, target.id);
  assert.equal(target.isIt, true);
  assert.equal(tagger.isIt, false);
  assert.ok(events.some((event) => event.name === "game:tag"));
});

test("does not tag a player who is high enough above the ground", () => {
  let now = 1000;
  const room = new GameRoom("TAGJP", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const chaser = room.players.get(room.itPlayerId);
  const target = [...room.players.values()].find((player) => !player.isIt);
  target.x = chaser.x;
  target.z = chaser.z;
  target.y = 1.2;

  now += 2000;
  room.checkForTag(now);
  assert.equal(room.itPlayerId, chaser.id);
  assert.equal(target.isIt, false);
});

test("room refuses players after a round has started", () => {
  const room = new GameRoom("LOCK1", { random: () => 0, clock: () => 1000 });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  assert.throws(() => room.addPlayer("three", "Três"), /já começou/);
});
