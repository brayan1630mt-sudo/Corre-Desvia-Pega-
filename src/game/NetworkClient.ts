import { io, type Socket } from "socket.io-client";
import { NETWORK } from "../shared/constants.ts";
import type {
  FeedEvent,
  GameClientEvents,
  GameError,
  GameSocketEvents,
  JoinPayload,
  PlayerInput,
  RoomState,
  TagEvent,
} from "../shared/types.ts";

type ClientEvents = {
  onState: (state: RoomState) => void;
  onJoined: (id: string, roomCode: string, isHost: boolean) => void;
  onError: (error: GameError) => void;
  onTag: (event: TagEvent) => void;
  onFeed: (event: FeedEvent) => void;
  onConnection: (connected: boolean) => void;
};

export class NetworkClient {
  private readonly socket: Socket<GameSocketEvents, GameClientEvents>;
  private readonly listeners: ClientEvents;
  private connected = false;
  private currentRoomCode = "";

  constructor(listeners: ClientEvents) {
    this.listeners = listeners;
    this.socket = io({
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: NETWORK.reconnectAttempts,
      reconnectionDelay: NETWORK.reconnectDelayMs,
      timeout: 10000,
    }) as Socket<GameSocketEvents, GameClientEvents>;
    this.bindSocketEvents();
  }

  connect(): void {
    if (!this.socket.connected && !this.socket.active) {
      this.socket.connect();
    }
  }

  createRoom(name: string, color: string): void {
    this.connect();
    this.socket.emit("room:create", { name, color } satisfies JoinPayload);
  }

  joinRoom(name: string, roomCode: string, color: string): void {
    this.connect();
    this.socket.emit("room:join", {
      name,
      roomCode: roomCode.toUpperCase().trim(),
      color,
    } satisfies JoinPayload);
  }

  quickPlay(name: string, color: string): void {
    this.connect();
    this.socket.emit("room:quick-play", { name, color });
  }

  leaveRoom(): void {
    if (this.socket.connected) {
      this.socket.emit("room:leave");
    }
    this.currentRoomCode = "";
  }

  startGame(): void {
    this.socket.emit("game:start");
  }

  sendInput(input: PlayerInput): void {
    if (this.socket.connected) {
      this.socket.emit("game:input", input);
    }
  }

  setReady(ready: boolean): void {
    this.socket.emit("room:ready", ready);
  }

  getRoomCode(): string {
    return this.currentRoomCode;
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.currentRoomCode = "";
    this.socket.disconnect();
  }

  private bindSocketEvents(): void {
    this.socket.on("connect", () => {
      this.connected = true;
      this.listeners.onConnection(true);
    });
    this.socket.on("disconnect", () => {
      this.connected = false;
      this.listeners.onConnection(false);
    });
    this.socket.on("connect_error", () => {
      this.connected = false;
      this.listeners.onConnection(false);
    });
    this.socket.on("room:joined", (payload) => {
      this.currentRoomCode = payload.roomCode;
      this.listeners.onJoined(payload.id, payload.roomCode, payload.isHost);
    });
    this.socket.on("room:state", (state) => {
      this.listeners.onState(state);
    });
    this.socket.on("room:error", (error) => {
      this.listeners.onError(error);
    });
    this.socket.on("game:tag", (event) => {
      this.listeners.onTag(event);
    });
    this.socket.on("game:feed", (event) => {
      this.listeners.onFeed(event);
    });
  }
}
