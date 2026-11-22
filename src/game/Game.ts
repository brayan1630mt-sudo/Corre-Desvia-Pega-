import * as THREE from "three";
import { ROUND } from "../shared/constants.ts";
import type {
  PlayerInput,
  PlayerState,
  RoomState,
} from "../shared/types.ts";
import { Arena } from "./Arena.ts";
import { InputController } from "./InputController.ts";
import { PlayerView } from "./PlayerView.ts";

type GameCallbacks = {
  onInput: (input: PlayerInput) => void;
};

const CLOCK = new THREE.Clock();
const PLAYER_UPDATE_RATE = 0.016;
const PREVIEW_CAMERA_POSITION = new THREE.Vector3(0, 0, 19);

export class Game {
  readonly arena: Arena;
  readonly input: InputController;
  private readonly callbacks: GameCallbacks;
  private readonly players = new Map<string, PlayerView>();
  private localPlayerId = "";
  private roomState: RoomState | null = null;
  private frameId = 0;
  private lastPlayerUpdate = 0;
  private active = true;
  private disposed = false;
  private lastLocalPlayerPosition = new THREE.Vector3();
  private hasLocalPlayerPosition = false;

  constructor(options: {
    stage: HTMLElement;
    joystick: HTMLElement;
    joystickKnob: HTMLElement;
    onInput: GameCallbacks["onInput"];
  }) {
    this.callbacks = { onInput: options.onInput };
    this.arena = new Arena(options.stage);
    this.input = new InputController({
      canvas: this.arena.getCanvas(),
      joystick: options.joystick,
      joystickKnob: options.joystickKnob,
      onInputChange: this.callbacks.onInput,
      onCameraChange: (yaw, pitch) => this.arena.setCameraRotation(yaw, pitch),
    });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.animate();
  }

  setLocalPlayer(id: string): void {
    this.localPlayerId = id;
    this.syncFirstPersonView();
    this.updateInputState();
  }

  setRoomState(state: RoomState): void {
    this.roomState = state;
    this.arena.setPowerUp(state.powerUp);
    this.arena.setSnowballs(state.snowballs);
    const activeIds = new Set(state.players.map((player) => player.id));
    for (const [id, playerView] of this.players) {
      if (!activeIds.has(id)) {
        playerView.dispose();
        this.players.delete(id);
      }
    }

    for (const playerState of state.players) {
      const current = this.players.get(playerState.id);
      if (current) {
        current.applyState(playerState);
      } else {
        this.players.set(
          playerState.id,
          new PlayerView(playerState, this.arena.scene),
        );
      }
    }
    this.syncFirstPersonView();
    this.updateInputState();
  }

  clearRoom(): void {
    for (const player of this.players.values()) {
      player.dispose();
    }
    this.players.clear();
    this.roomState = null;
    this.localPlayerId = "";
    this.hasLocalPlayerPosition = false;
    this.arena.setFirstPersonArmsVisible(false);
    this.arena.setPowerUp(null);
    this.arena.setSnowballs([]);
    this.input.setEnabled(false);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.input.setEnabled(false);
    } else {
      this.updateInputState();
    }
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.input.destroy();
    for (const player of this.players.values()) {
      player.dispose();
    }
    this.players.clear();
    this.arena.dispose();
  }

  private updateInputState(): void {
    const shouldListen =
      this.active &&
      this.roomState?.phase === "playing" &&
      this.players.has(this.localPlayerId);
    this.input.setEnabled(Boolean(shouldListen));
  }

  private syncFirstPersonView(): void {
    let localPlayer: PlayerState | undefined;
    for (const [id, playerView] of this.players) {
      const isLocalPlayer = id === this.localPlayerId;
      playerView.setVisible(!isLocalPlayer);
      if (isLocalPlayer) {
        localPlayer = this.roomState?.players.find((player) => player.id === id);
      }
    }
    this.arena.setFirstPersonArmsVisible(
      Boolean(
        localPlayer &&
          this.roomState &&
          this.roomState.phase !== "finished",
      ),
    );
    if (localPlayer) {
      this.arena.setFirstPersonColor(localPlayer.color);
    }
  }

  private animate = (): void => {
    if (this.disposed) {
      return;
    }
    this.frameId = requestAnimationFrame(this.animate);
    const deltaSeconds = Math.min(CLOCK.getDelta(), 0.05);
    const now = performance.now();

    if (
      this.active &&
      this.roomState?.phase === "playing" &&
      now - this.lastPlayerUpdate >= PLAYER_UPDATE_RATE * 1000
    ) {
      this.input.update(now);
      this.lastPlayerUpdate = now;
    }

    for (const player of this.players.values()) {
      player.update(deltaSeconds);
    }

    const localPlayer = this.players.get(this.localPlayerId);
    if (localPlayer) {
      const position = localPlayer.getPosition();
      const localState = this.roomState?.players.find(
        (player) => player.id === this.localPlayerId,
      );
      this.arena.focusOn(
        position,
        deltaSeconds,
        localState?.isMoving ?? false,
        localState?.isSprinting ?? false,
        position.y > 0.04,
        localState?.isDashing ?? false,
      );
      this.lastLocalPlayerPosition.copy(position);
      this.hasLocalPlayerPosition = true;
    } else if (this.roomState?.players[0]) {
      const initialPlayer = this.players.get(this.roomState.players[0].id);
      if (initialPlayer) {
        this.arena.focusOn(initialPlayer.getPosition(), deltaSeconds);
      }
    } else if (this.hasLocalPlayerPosition) {
      this.arena.focusOn(this.lastLocalPlayerPosition, deltaSeconds);
    } else {
      this.arena.focusOn(PREVIEW_CAMERA_POSITION, deltaSeconds);
    }

    this.arena.updateEnvironment(deltaSeconds);
    this.arena.render();
  };

  private handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") {
      this.input.setEnabled(false);
      return;
    }
    this.updateInputState();
  };
}

export const TAGGING_DISTANCE = ROUND.tagDistance;
