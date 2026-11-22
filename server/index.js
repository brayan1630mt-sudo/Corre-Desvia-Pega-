import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server } from "socket.io";
import {
  generateRoomCode,
  GameRoom,
  sanitizePlayerName,
} from "./room.js";
import { PLAYER_COLORS } from "../src/shared/constants.ts";

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CLIENT_DIRECTORY = path.join(ROOT_DIRECTORY, "dist");
const STATE_BROADCAST_INTERVAL = 50;
const MAXIMUM_JOIN_ATTEMPTS = 18;
const MAXIMUM_EVENT_SIZE = 2048;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  serveClient: false,
  cors: {
    origin: process.env.ALLOWED_ORIGIN || true,
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: MAXIMUM_EVENT_SIZE,
  pingInterval: 25000,
  pingTimeout: 20000,
});
const rooms = new Map();
const playerRooms = new Map();

app.disable("x-powered-by");
app.use(
  express.static(CLIENT_DIRECTORY, {
    maxAge: "1h",
    setHeaders(response, filePath) {
      if (path.basename(filePath) === "index.html") {
        response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }),
);

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "pega-pega-3d",
    rooms: rooms.size,
    players: playerRooms.size,
    uptime: Math.floor(process.uptime()),
  });
});

app.get("/api/status", (_request, response) => {
  const activePlayers = [...rooms.values()].reduce(
    (total, room) => total + room.playerCount,
    0,
  );
  response.json({
    rooms: rooms.size,
    players: activePlayers,
    maximumPlayersPerRoom: 12,
    game: "Corre! Pega-pega 3D",
  });
});

app.use((request, response, next) => {
  if (
    request.method !== "GET" ||
    request.path.startsWith("/api/") ||
    request.path.startsWith("/socket.io/")
  ) {
    next();
    return;
  }
  response.sendFile(path.join(CLIENT_DIRECTORY, "index.html"), (error) => {
    if (error) {
      next(error);
    }
  });
});

function findRoom(roomCode) {
  if (typeof roomCode !== "string") {
    return null;
  }
  return rooms.get(roomCode.trim().toUpperCase()) ?? null;
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:state", room.getState());
}

function sendRoomError(socket, code, message) {
  socket.emit("room:error", { code, message });
}

function hasInvalidPlayerColor(color) {
  return (
    color !== undefined &&
    !PLAYER_COLORS.some((option) => option === color)
  );
}

function getRoomForSocket(socket) {
  const roomCode = playerRooms.get(socket.id);
  if (!roomCode) {
    return null;
  }
  return rooms.get(roomCode) ?? null;
}

function createRoom() {
  for (let attempt = 0; attempt < MAXIMUM_JOIN_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode();
    if (!rooms.has(code)) {
      const room = new GameRoom(code, {
        onEvent: (eventName, payload) => {
          io.to(code).emit(eventName, payload);
        },
      });
      rooms.set(code, room);
      return room;
    }
  }
  throw new Error("Não foi possível criar uma sala agora. Tente novamente.");
}

function leaveCurrentRoom(socket) {
  const roomCode = playerRooms.get(socket.id);
  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);
  playerRooms.delete(socket.id);
  socket.leave(roomCode);
  if (!room) {
    return;
  }

  room.removePlayer(socket.id);
  if (room.playerCount === 0) {
    rooms.delete(roomCode);
  } else {
    broadcastRoom(room);
  }
}

function joinRoom(socket, room, name, color) {
  const cleanName = sanitizePlayerName(name);
  if (!cleanName) {
    sendRoomError(socket, "INVALID_NAME", "Escolha um nome com pelo menos 1 caractere.");
    return false;
  }
  if (room.players.has(socket.id)) {
    broadcastRoom(room);
    return true;
  }

  try {
    room.addPlayer(socket.id, cleanName, color);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível entrar na sala.";
    const code =
      room.playerCount >= 12 ? "ROOM_FULL" : "GAME_IN_PROGRESS";
    sendRoomError(socket, code, message);
    return false;
  }

  playerRooms.set(socket.id, room.code);
  socket.join(room.code);
  socket.emit("room:joined", {
    id: socket.id,
    roomCode: room.code,
    isHost: room.hostId === socket.id,
  });
  broadcastRoom(room);
  return true;
}

function chooseOpenRoom() {
  for (const room of rooms.values()) {
    if (room.phase === "waiting" && room.playerCount < 12) {
      return room;
    }
  }
  return createRoom();
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload = {}) => {
    const request = payload && typeof payload === "object" ? payload : {};
    if (!sanitizePlayerName(request.name)) {
      sendRoomError(socket, "INVALID_NAME", "Escolha um nome com pelo menos 1 caractere.");
      return;
    }
    if (hasInvalidPlayerColor(request.color)) {
      sendRoomError(socket, "INVALID_INPUT", "Escolha uma cor disponível para o personagem.");
      return;
    }
    leaveCurrentRoom(socket);
    const room = createRoom();
    joinRoom(socket, room, request.name, request.color);
  });

  socket.on("room:join", (payload = {}) => {
    const request = payload && typeof payload === "object" ? payload : {};
    if (hasInvalidPlayerColor(request.color)) {
      sendRoomError(socket, "INVALID_INPUT", "Escolha uma cor disponível para o personagem.");
      return;
    }
    const room = findRoom(request.roomCode);
    if (!room) {
      sendRoomError(socket, "ROOM_NOT_FOUND", "Não encontramos essa sala. Confira o código.");
      return;
    }
    if (room.players.size >= 12) {
      sendRoomError(socket, "ROOM_FULL", "Essa sala já está cheia.");
      return;
    }
    if (room.phase !== "waiting") {
      sendRoomError(socket, "GAME_IN_PROGRESS", "Essa rodada já começou.");
      return;
    }
    leaveCurrentRoom(socket);
    joinRoom(socket, room, request.name, request.color);
  });

  socket.on("room:quick-play", (payload = {}) => {
    const request = payload && typeof payload === "object" ? payload : {};
    const name = sanitizePlayerName(request.name);
    if (!name) {
      sendRoomError(socket, "INVALID_NAME", "Escolha um nome antes de jogar.");
      return;
    }
    if (hasInvalidPlayerColor(request.color)) {
      sendRoomError(socket, "INVALID_INPUT", "Escolha uma cor disponível para o personagem.");
      return;
    }
    leaveCurrentRoom(socket);
    joinRoom(socket, chooseOpenRoom(), name, request.color);
  });

  socket.on("room:leave", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("room:ready", (ready) => {
    const room = getRoomForSocket(socket);
    if (!room) {
      sendRoomError(socket, "NOT_IN_ROOM", "Entre em uma sala antes.");
      return;
    }
    room.setReady(socket.id, ready);
    broadcastRoom(room);
  });

  socket.on("game:start", () => {
    const room = getRoomForSocket(socket);
    if (!room) {
      sendRoomError(socket, "NOT_IN_ROOM", "Entre em uma sala antes.");
      return;
    }
    try {
      room.startGame(socket.id);
      broadcastRoom(room);
    } catch (error) {
      sendRoomError(
        socket,
        socket.id === room.hostId ? "INVALID_INPUT" : "NOT_HOST",
        error instanceof Error ? error.message : "Não foi possível iniciar.",
      );
    }
  });

  socket.on("game:input", (input) => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }
    room.setInput(socket.id, input);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

const gameLoop = setInterval(() => {
  for (const [code, room] of rooms) {
    room.tick();
    if (room.playerCount === 0) {
      rooms.delete(code);
      continue;
    }
    broadcastRoom(room);
  }
}, STATE_BROADCAST_INTERVAL);

gameLoop.unref();

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Corre! rodando na porta ${PORT}`);
});

function shutDown(signal) {
  console.log(`Encerrando servidor (${signal})...`);
  clearInterval(gameLoop);
  io.close();
  httpServer.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGTERM", () => shutDown("SIGTERM"));
process.on("SIGINT", () => shutDown("SIGINT"));
