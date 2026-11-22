import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlayerPosition,
  GameRoom,
  generateRoomCode,
  normalizePlayerInput,
  sanitizePlayerName,
} from "../server/room.js";
import { ARENA } from "../src/shared/constants.ts";

test("sanitizes display names without changing useful accents", () => {
  assert.equal(sanitizePlayerName("  João   da Silva  "), "João da Silva");
  assert.equal(sanitizePlayerName("<b>bad</b>"), "bbad/bb");
  assert.equal(sanitizePlayerName(""), "");
  assert.equal(sanitizePlayerName("a".repeat(40)).length, 18);
  assert.equal(sanitizePlayerName("ana\nmaria"), "anamaria");
});

test("bounds movement input and rejects non-finite axes", () => {
  assert.deepEqual(normalizePlayerInput({ forward: 8, right: -3, sprint: true }), {
    forward: 1,
    right: -1,
    sprint: true,
  });
  assert.deepEqual(
    normalizePlayerInput({ forward: Number.NaN, right: "left", sprint: 1 }),
    { forward: 0, right: 0, sprint: false },
  );
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

  const obstacle = clampPlayerPosition({ x: -9, z: -8 });
  assert.ok(Math.abs(obstacle.x + 9) > 2.4 || Math.abs(obstacle.z + 8) > 2.12);
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
  room.tick(now);
  assert.ok(player.z < 0 || player.x !== before);
  const moved = player.z;
  now += 500;
  room.tick(now);
  assert.equal(player.z, moved);
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
  assert.equal(tagger.catches, 1);
  assert.ok(events.some((event) => event.name === "game:tag"));
});

test("room refuses players after a round has started", () => {
  const room = new GameRoom("LOCK1", { random: () => 0, clock: () => 1000 });
  room.addPlayer("one", "Um");
  room.addPlayer("two", "Dois");
  room.startGame("one");
  assert.throws(() => room.addPlayer("three", "Três"), /já começou/);
});
