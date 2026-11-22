export type GamePhase =
  | "waiting"
  | "countdown"
  | "playing"
  | "finished";

export interface Vector2 {
  x: number;
  z: number;
}

export interface PlayerInput {
  forward: number;
  right: number;
  sprint: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  rotation: number;
  isIt: boolean;
  isSprinting: boolean;
  isReady: boolean;
  catches: number;
  caughtCount: number;
  connected: boolean;
}

export interface RoomState {
  code: string;
  phase: GamePhase;
  players: PlayerState[];
  hostId: string;
  itPlayerId: string | null;
  timeLeft: number;
  countdown: number;
  round: number;
  winnerId: string | null;
  message: string;
}

export interface JoinPayload {
  name: string;
  roomCode?: string;
}

export interface JoinedPayload {
  id: string;
  roomCode: string;
  isHost: boolean;
}

export interface GameError {
  message: string;
  code:
    | "INVALID_NAME"
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "GAME_IN_PROGRESS"
    | "NOT_HOST"
    | "NOT_IN_ROOM"
    | "INVALID_INPUT";
}

export interface TagEvent {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  color: string;
  at: number;
}

export interface FeedEvent {
  id: string;
  text: string;
  kind: "info" | "tag" | "win";
  createdAt: number;
}

export interface GameSocketEvents {
  "room:state": (state: RoomState) => void;
  "room:joined": (payload: JoinedPayload) => void;
  "room:error": (error: GameError) => void;
  "game:tag": (event: TagEvent) => void;
  "game:feed": (event: FeedEvent) => void;
  "game:started": (state: RoomState) => void;
  "game:ended": (state: RoomState) => void;
  "game:countdown": (value: number) => void;
}

export interface LobbyPreferences {
  displayName: string;
  lastRoomCode: string;
  soundEnabled: boolean;
  reducedMotion: boolean;
  showHints: boolean;
}

export interface GameSettings {
  musicEnabled: boolean;
  effectsEnabled: boolean;
  sensitivity: number;
  cameraDistance: number;
}

export interface PlayerSnapshot {
  x: number;
  z: number;
  rotation: number;
  at: number;
}

export interface ObstacleShape {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  kind: "tree" | "block";
}

export interface NotificationItem {
  id: string;
  message: string;
  type: "success" | "warning" | "error" | "neutral";
  duration: number;
}

export interface LobbyActionCallbacks {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (name: string, roomCode: string) => void;
  onQuickPlay: (name: string) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onCopyCode: () => void;
  onToggleSound: (enabled: boolean) => void;
  onReady: (ready: boolean) => void;
}
