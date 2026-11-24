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
  ARENA_RAMPS,
  BUILDING_LADDERS,
  CLIMBABLE_PLATFORMS,
  ELEVATED_PLATFORM_THICKNESS,
  LADDER_CLIMB_SPEED,
  MAX_JUMP_HEIGHT,
  OBSTACLES,
  PARKOUR,
  PLAYER_COLORS,
  ROUND,
  SPAWN_POINTS,
  VERTICAL_PLATFORMS,
} from "../src/shared/constants.ts";
import { rampHeightAt, resolveArenaPosition } from "../src/shared/math.ts";

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
    slide: false,
    yaw: 0,
    pitch: 0,
  });
  assert.deepEqual(
    normalizePlayerInput({ forward: Number.NaN, right: "left", sprint: 1 }),
    { forward: 0, right: 0, sprint: false, jump: false, dash: false, usePower: false, slide: false, yaw: 0, pitch: 0 },
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

test("rounded obstacle corners do not push players farther than their hitbox", () => {
  const barrier = OBSTACLES.find((obstacle) => obstacle.kind === "barrier");
  assert.ok(barrier);
  const corner = {
    x: barrier.x + barrier.width / 2,
    z: barrier.z + barrier.depth / 2,
  };
  const start = { x: corner.x + 0.3, z: corner.z + 0.3 };
  const resolved = resolveArenaPosition(start, { x: 0, z: 0 });

  assert.ok(resolved.x > start.x);
  assert.ok(resolved.z > start.z);
  assert.ok(
    Math.abs(
      Math.hypot(resolved.x - corner.x, resolved.z - corner.z) -
        ARENA.playerRadius,
    ) < 0.0001,
  );
  assert.deepEqual(clampPlayerPosition(start), resolved);
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

test("the three arena levels are connected by server-shared ramps", () => {
  assert.equal(ARENA_RAMPS.length, 4);
  assert.equal(VERTICAL_PLATFORMS.filter((platform) => platform.height === 3).length, 2);
  assert.equal(VERTICAL_PLATFORMS.filter((platform) => platform.height === 6).length, 2);
  for (const ramp of ARENA_RAMPS) {
    const lowCoordinate =
      ramp.axis === "x"
        ? ramp.x + (ramp.direction === 1 ? -ramp.width / 2 : ramp.width / 2)
        : ramp.z + (ramp.direction === 1 ? -ramp.depth / 2 : ramp.depth / 2);
    const highCoordinate =
      ramp.axis === "x"
        ? ramp.x + (ramp.direction === 1 ? ramp.width / 2 : -ramp.width / 2)
        : ramp.z + (ramp.direction === 1 ? ramp.depth / 2 : -ramp.depth / 2);
    const low = ramp.axis === "x"
      ? rampHeightAt(lowCoordinate, ramp.z)
      : rampHeightAt(ramp.x, lowCoordinate);
    const high = ramp.axis === "x"
      ? rampHeightAt(highCoordinate, ramp.z)
      : rampHeightAt(ramp.x, highCoordinate);
    assert.ok(Math.abs(low - ramp.startY) < 0.001);
    assert.ok(Math.abs(high - ramp.endY) < 0.001);
  }
});

test("walking underneath a ramp does not raise the player", () => {
  let now = 1000;
  const room = new GameRoom("UNDER", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const player = room.players.get("one");
  const ramp = ARENA_RAMPS.find((candidate) => candidate.id === "lower-north");
  assert.ok(ramp);
  player.x = ramp.x;
  player.z = 0;
  player.y = 0;
  player.verticalVelocity = 0;
  for (let step = 0; step < 8; step += 1) {
    room.setInput("one", { right: 1 });
    now += 50;
    room.tick(now);
  }

  assert.equal(player.y, 0);
});

test("moving onto a ramp from its low end follows the ramp surface", () => {
  let now = 1000;
  const room = new GameRoom("RAMP", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const player = room.players.get("one");
  const ramp = ARENA_RAMPS.find((candidate) => candidate.id === "lower-north");
  assert.ok(ramp);
  player.x = ramp.x;
  player.z = 10;
  player.y = 0;
  player.verticalVelocity = 0;
  for (let step = 0; step < 8; step += 1) {
    room.setInput("one", { forward: 1 });
    now += 50;
    room.tick(now);
  }

  assert.ok(player.y > 0.3);
  assert.ok(Math.abs(player.y - rampHeightAt(player.x, player.z)) < 0.02);
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
  now += ROUND.respawnInvulnerabilityMs;
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

test("sprinting slide preserves momentum and marks a reduced hitbox", () => {
  let now = 1000;
  const room = new GameRoom("SLIDE", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  player.x = 0;
  player.z = 0;
  room.setInput("one", { forward: 1, sprint: true });
  now += 50;
  room.tick(now);
  const beforeSlide = player.z;

  room.setInput("one", { forward: 1, sprint: true, slide: true });
  now += 50;
  const state = room.tick(now);
  assert.equal(player.isSliding, true);
  assert.ok(player.z < beforeSlide - 0.4);
  assert.equal(state.players.find((entry) => entry.id === "one").isSliding, true);
  assert.equal(PARKOUR.slideHeight < ARENA.playerHeight, true);
});

test("sprint-jumping beside a wall starts wall-run and jump-kicks outward", () => {
  let now = 1000;
  const room = new GameRoom("WALLR", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  player.x = -6.17;
  player.z = 0;
  room.setInput("one", { forward: 1, sprint: true, jump: true });
  now += 50;
  let state = room.tick(now);
  assert.equal(player.isWallRunning, true);
  assert.equal(state.players.find((entry) => entry.id === "one").isWallRunning, true);

  room.setInput("one", { forward: 1, sprint: true, jump: false });
  now += 50;
  room.tick(now);
  const xBeforeKick = player.x;
  room.setInput("one", { forward: 1, sprint: true, jump: true });
  now += 50;
  state = room.tick(now);
  assert.equal(player.isWallRunning, false);
  assert.ok(player.x < xBeforeKick);
});

test("sprint-vault carries a player over a low barrier", () => {
  let now = 1000;
  const room = new GameRoom("VAULT", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  player.x = 0;
  player.z = -5.7;
  for (let step = 0; step < 12; step += 1) {
    room.setInput("one", { forward: 1, sprint: true });
    now += 50;
    room.tick(now);
  }
  assert.ok(player.z < -8.5);
  assert.ok(player.y >= 0);
});

test("a runner behind another gains slipstream after one continuous second", () => {
  let now = 1000;
  const room = new GameRoom("SLIP", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const follower = room.players.get("one");
  const leader = room.players.get("two");
  follower.x = leader.x = 14;
  follower.z = 2;
  leader.z = -2;
  for (let step = 0; step < 23; step += 1) {
    room.setInput("one", { forward: 1, sprint: true, yaw: 0 });
    room.setInput("two", { forward: 1, sprint: true, yaw: 0 });
    now += 50;
    room.tick(now);
  }
  assert.equal(follower.isSlipstreaming, true);
  assert.equal(
    room.getState(now).players.find((entry) => entry.id === "one").isSlipstreaming,
    true,
  );
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

test("deck collision stops a jump at the actual underside", () => {
  let now = 1000;
  const room = new GameRoom("UNDER", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const player = room.players.get("one");
  const deck = VERTICAL_PLATFORMS.find((platform) => platform.height === 3);
  assert.ok(deck);
  player.x = deck.x;
  player.z = deck.z;
  player.y = 0;
  player.verticalVelocity = 0;
  room.setInput("one", { jump: true });
  now += 50;
  room.tick(now);
  room.setInput("one", { jump: false });

  for (let step = 0; step < 20 && player.verticalVelocity > 0; step += 1) {
    now += 50;
    room.tick(now);
  }

  const underside = deck.height - ELEVATED_PLATFORM_THICKNESS;
  assert.ok(Math.abs(player.y + ARENA.playerHeight - underside) < 0.001);
  assert.equal(player.verticalVelocity, 0);
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
  assert.equal(player.powerUpExpiresAt, 0);
  assert.equal(state.players.find((entry) => entry.id === "one").powerUp, "speed");

  room.setInput("one", { usePower: true });
  now += 50;
  room.tick(now);
  assert.equal(player.powerUpExpiresAt, now + 7000);

  player.x = 5;
  player.z = 0;
  room.setInput("one", { forward: 1, usePower: false });
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
  assert.equal(player.powerUpExpiresAt, 0);
  assert.equal(state.players.find((entry) => entry.id === "one").isInvisible, false);

  room.setInput("one", { usePower: true });
  now += 50;
  state = room.tick(now);
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
  now += ROUND.respawnInvulnerabilityMs;
  room.tick(now);
  assert.equal(room.itPlayerId, target.id);
  assert.equal(target.isIt, true);
  assert.equal(tagger.isIt, false);
  assert.ok(events.some((event) => event.name === "game:tag"));
});

test("tagging another player resets the tag penalty to thirty seconds", () => {
  let now = 1000;
  const room = new GameRoom("HOT1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.addPlayer("three", "Tres");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const tagger = room.players.get("one");
  const target = room.players.get("two");
  assert.equal(
    tagger.taggerPenaltyEndsAt,
    now + ROUND.taggerPenaltySeconds * 1000,
  );
  tagger.x = target.x = 0;
  tagger.z = target.z = 0;
  now += ROUND.respawnInvulnerabilityMs;
  room.checkForTag(now);
  assert.equal(room.itPlayerId, target.id);
  assert.equal(target.taggerPenaltyEndsAt, now + 30_000);
  assert.equal(tagger.taggerPenaltyEndsAt, 0);
});

test("a tagger timeout consumes one life, respawns protected, and chooses another tagger", () => {
  let now = 1000;
  const room = new GameRoom("HOT2", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.addPlayer("three", "Tres");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const expiredTagger = room.players.get("one");
  const deadline = expiredTagger.taggerPenaltyEndsAt;

  room.checkTaggerPenalty(deadline);
  assert.equal(expiredTagger.lives, 1);
  assert.equal(expiredTagger.isEliminated, false);
  assert.equal(
    expiredTagger.spawnProtectedUntil,
    deadline + ROUND.respawnInvulnerabilityMs,
  );
  assert.ok(
    expiredTagger.x !== room.players.get("two").x ||
      expiredTagger.z !== room.players.get("two").z,
  );
  assert.equal(room.itPlayerId, "two");
  assert.equal(room.players.get("two").isIt, true);
  assert.equal(
    room.players.get("two").taggerPenaltyEndsAt,
    deadline + ROUND.taggerPenaltySeconds * 1000,
  );
  assert.equal(room.setInput("one", { forward: 1 }), true);
  assert.equal(
    room.getState(deadline).players.find((player) => player.id === "one").lives,
    1,
  );
});

test("a timeout with one fugitive ends the round and leaves the winner active", () => {
  let now = 1000;
  const room = new GameRoom("HOT3", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const tagger = room.players.get("one");
  tagger.lives = 1;
  room.checkTaggerPenalty(tagger.taggerPenaltyEndsAt);
  assert.equal(room.phase, "finished");
  assert.equal(room.winnerId, "two");
  assert.equal(tagger.isEliminated, true);
});

test("spawn protection prevents tagging and every round starts with two lives", () => {
  let now = 1000;
  const room = new GameRoom("SPAWN", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  assert.ok([...room.players.values()].every((player) => player.lives === 2));
  now += 4500;
  room.tick(now);
  const tagger = room.players.get("one");
  const target = room.players.get("two");
  tagger.x = target.x = 0;
  tagger.z = target.z = 0;

  now += ROUND.tagCooldownMs;
  room.checkForTag(now);
  assert.equal(room.itPlayerId, tagger.id);

  target.spawnProtectedUntil = 0;
  room.checkForTag(now);
  assert.equal(room.itPlayerId, tagger.id);

  tagger.spawnProtectedUntil = 0;
  target.spawnProtectedUntil = now + 1000;
  room.checkForTag(now);
  assert.equal(room.itPlayerId, tagger.id);

  now = target.spawnProtectedUntil;
  room.checkForTag(now);
  assert.equal(room.itPlayerId, target.id);
  const targetSnapshot = room.getState(now).players.find(
    (player) => player.id === target.id,
  );
  assert.equal(targetSnapshot.lives, ROUND.livesPerPlayer);
  assert.equal(targetSnapshot.spawnProtectedUntil, target.spawnProtectedUntil);
});

test("shockwave knocks back opponents without transferring the tag", () => {
  let now = 1000;
  const room = new GameRoom("SHOCK", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const source = room.players.get("one");
  const target = room.players.get("two");
  source.x = 0;
  source.z = 0;
  source.powerUp = "shockwave";
  target.x = 0;
  target.z = -2;
  room.setInput("one", { usePower: true });
  now += 50;
  let state = room.tick(now);
  assert.equal(source.powerUp, null);
  assert.equal(target.isIt, false);
  assert.ok(target.z < -2);
  assert.ok(target.verticalVelocity > 0);
  assert.ok(state.effects.some((effect) => effect.type === "shockwave"));
});

test("ink grenade splashes nearby players for three seconds", () => {
  let now = 1000;
  const room = new GameRoom("INK01", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const thrower = room.players.get("one");
  const target = room.players.get("two");
  thrower.x = 0;
  thrower.z = 0;
  thrower.powerUp = "ink";
  target.x = 0;
  target.z = -5;
  room.setInput("one", { usePower: true, yaw: 0, pitch: 0 });
  now += 50;
  room.tick(now);
  room.setInput("one", { usePower: false, yaw: 0, pitch: 0 });

  for (let step = 0; step < 12 && target.inkedUntil <= now; step += 1) {
    now += 50;
    room.tick(now);
  }
  assert.ok(target.inkedUntil > now);
  assert.ok(target.inkedUntil - now <= 3000);
  assert.equal(room.snowballs.length, 0);
});

test("gravity inversion lowers authoritative gravity for four seconds", () => {
  let now = 1000;
  const room = new GameRoom("GRAV1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const player = room.players.get("one");
  player.x = 0;
  player.z = -3;
  player.y = 3;
  player.powerUp = "gravity";
  room.setInput("one", { usePower: true });
  now += 50;
  room.tick(now);
  const gravityEndsAt = player.gravityInvertedUntil;
  assert.equal(gravityEndsAt, now + 4000);
  room.setInput("one", { usePower: false });
  now += 50;
  const velocityBeforeReducedGravity = player.verticalVelocity;
  room.tick(now);
  assert.ok(player.verticalVelocity > velocityBeforeReducedGravity - 0.5);
});

test("swap ray exchanges player positions and momentum", () => {
  let now = 1000;
  const room = new GameRoom("SWAP1", { random: () => 0, clock: () => now });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  now += 4500;
  room.tick(now);
  const shooter = room.players.get("one");
  const target = room.players.get("two");
  shooter.x = 0;
  shooter.z = 0;
  shooter.powerUp = "swap";
  target.x = 0;
  target.z = -5;
  room.setInput("two", { right: 1 });
  room.setInput("one", { usePower: true, yaw: 0, pitch: 0 });
  now += 50;
  const state = room.tick(now);
  assert.equal(shooter.powerUp, null);
  assert.ok(Math.abs(shooter.z + 5) < 0.001);
  assert.ok(Math.abs(target.z) < 0.001);
  assert.ok(shooter.velocityX > 6);
  assert.equal(target.velocityX, 0);
  assert.ok(state.effects.some((effect) => effect.type === "swap"));
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

test("sends timed relative hints only to the current tagger", () => {
  let now = 1000;
  const hints = [];
  const broadcastEvents = [];
  const room = new GameRoom("HINT1", {
    random: () => 0,
    clock: () => now,
    onEvent: (name, payload) => broadcastEvents.push({ name, payload }),
    onHint: (playerId, hint) => hints.push({ playerId, hint }),
  });
  room.addPlayer("one", "Pegador");
  room.addPlayer("two", "Corredor");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const chaser = room.players.get("one");
  const target = room.players.get("two");
  chaser.x = 0;
  chaser.z = 0;
  chaser.rotation = 0;
  target.x = 0;
  target.z = -8;
  room.nextHintAt = now + 50;
  now += 50;
  room.tick(now);

  assert.equal(hints.length, 1);
  assert.equal(hints[0].playerId, "one");
  assert.match(hints[0].hint.text, /à sua frente, entre 5 e 12 m/);
  assert.equal(
    broadcastEvents.some((event) => event.name === "game:hint"),
    false,
  );

  now += 50;
  room.tick(now);
  assert.equal(hints.length, 1);
});

test("private hints do not reveal players while they are invisible", () => {
  let now = 1000;
  const hints = [];
  const room = new GameRoom("HIDE1", {
    random: () => 0,
    clock: () => now,
    onHint: (playerId, hint) => hints.push({ playerId, hint }),
  });
  room.addPlayer("one", "Pegador");
  room.addPlayer("two", "Invisível");
  room.startGame("one");
  now += 4500;
  room.tick(now);

  const hiddenPlayer = room.players.get("two");
  hiddenPlayer.powerUp = "invisibility";
  hiddenPlayer.powerUpExpiresAt = now + 5000;
  room.nextHintAt = now;
  room.updateChaserHint(now);

  assert.equal(hints.length, 1);
  assert.equal(hints[0].playerId, "one");
  assert.match(hints[0].hint.text, /Ninguém está visível/);
  assert.doesNotMatch(hints[0].hint.text, /distância|frente|direita|esquerda/);
});

test("room refuses players after a round has started", () => {
  const room = new GameRoom("LOCK1", { random: () => 0, clock: () => 1000 });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  assert.throws(() => room.addPlayer("three", "Três"), /já começou/);
});
