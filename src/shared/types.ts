export type GamePhase =
  | "waiting"
  | "countdown"
  | "playing"
  | "finished";

export interface Vector2 {
  x: number;
  z: number;
}

export type PowerUpType =
  | "speed"
  | "jump"
  | "invisibility"
  | "freeze"
  | "grapple";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface PowerUpState {
  type: PowerUpType;
  x: number;
  z: number;
}

export interface SnowballState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  z: number;
}

export interface PlayerInput {
  forward: number;
  right: number;
  sprint: boolean;
  jump: boolean;
  dash: boolean;
  usePower: boolean;
  yaw: number;
  pitch: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  powerUp: PowerUpType | null;
  powerUpExpiresAt: number;
  isInvisible: boolean;
  isFrozen: boolean;
  grappleAnchor: Vector3 | null;
  dashCooldownEndsAt: number;
  survivalPoints: number;
  rotation: number;
  pitch: number;
  isIt: boolean;
  isMoving: boolean;
  isSprinting: boolean;
  isDashing: boolean;
  isReady: boolean;
  connected: boolean;
}

export interface RoomState {
  code: string;
  phase: GamePhase;
  players: PlayerState[];
  powerUp: PowerUpState | null;
  snowballs: SnowballState[];
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
  color?: string;
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

export interface HintEvent {
  text: string;
}

export interface GameSocketEvents {
  "room:state": (state: RoomState) => void;
  "room:joined": (payload: JoinedPayload) => void;
  "room:error": (error: GameError) => void;
  "game:tag": (event: TagEvent) => void;
  "game:feed": (event: FeedEvent) => void;
  "game:hint": (event: HintEvent) => void;
  "game:started": (state: RoomState) => void;
  "game:ended": (state: RoomState) => void;
  "game:countdown": (value: number) => void;
}

export interface GameClientEvents {
  "room:create": (payload: JoinPayload) => void;
  "room:join": (payload: JoinPayload) => void;
  "room:quick-play": (payload: Pick<JoinPayload, "name" | "color">) => void;
  "room:leave": () => void;
  "room:ready": (ready: boolean) => void;
  "game:start": () => void;
  "game:input": (input: PlayerInput) => void;
}

export interface LobbyPreferences {
  displayName: string;
  lastRoomCode: string;
  playerColor: string;
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
  y: number;
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
  collisionHeight: number;
  kind: "building" | "barrier";
}

export interface NotificationItem {
  id: string;
  message: string;
  type: "success" | "warning" | "error" | "neutral";
  duration: number;
}

export interface LobbyActionCallbacks {
  onCreateRoom: (name: string, color: string) => void;
  onJoinRoom: (name: string, roomCode: string, color: string) => void;
  onQuickPlay: (name: string, color: string) => void;
  onPlayerColorChange: (color: string) => void;
  onUsePower: () => void;
  onPowerUp: (
    type: PowerUpType,
    action: "collected" | "used",
  ) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onCopyCode: () => void;
  onToggleSound: (enabled: boolean) => void;
  onReady: (ready: boolean) => void;
}
