import { NETWORK } from "../shared/constants.ts";
import type { PlayerInput } from "../shared/types.ts";
import { clamp } from "../shared/math.ts";

type JoystickPoint = {
  x: number;
  y: number;
  pointerId: number;
};

const KEY_DIRECTIONS: Record<string, "forward" | "backward" | "left" | "right"> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly joystick: HTMLElement;
  private readonly joystickKnob: HTMLElement;
  private readonly keys = new Set<string>();
  private pointer: JoystickPoint | null = null;
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private joystickX = 0;
  private joystickY = 0;
  private yaw = 0;
  private pitch = 0;
  private sensitivity = 0.006;
  private enabled = false;
  private sprinting = false;
  private jumpRequested = false;
  private dashRequested = false;
  private powerRequested = false;
  private lastSentAt = 0;
  private input: PlayerInput = {
    forward: 0,
    right: 0,
    sprint: false,
    jump: false,
    dash: false,
    usePower: false,
    yaw: 0,
    pitch: 0,
  };
  private readonly onInputChange: (input: PlayerInput) => void;
  private readonly onCameraChange: (yaw: number, pitch: number) => void;

  constructor(options: {
    canvas: HTMLCanvasElement;
    joystick: HTMLElement;
    joystickKnob: HTMLElement;
    onInputChange: (input: PlayerInput) => void;
    onCameraChange: (yaw: number, pitch: number) => void;
  }) {
    this.canvas = options.canvas;
    this.joystick = options.joystick;
    this.joystickKnob = options.joystickKnob;
    this.onInputChange = options.onInputChange;
    this.onCameraChange = options.onCameraChange;
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.clearKeys);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.joystick.addEventListener("pointerdown", this.handleJoystickDown);
    this.joystick.addEventListener("pointermove", this.handleJoystickMove);
    this.joystick.addEventListener("pointerup", this.handleJoystickUp);
    this.joystick.addEventListener("pointercancel", this.handleJoystickUp);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearKeys();
      this.resetJoystick();
      this.dragPointerId = null;
    }
    this.canvas.classList.toggle("game-canvas--active", enabled);
  }

  setSensitivity(value: number): void {
    this.sensitivity = clamp(value, 0.002, 0.012);
  }

  setSprint(enabled: boolean): void {
    this.sprinting = enabled;
  }

  requestJump(): void {
    if (this.enabled) {
      this.jumpRequested = true;
    }
  }

  requestDash(): void {
    if (this.enabled) {
      this.dashRequested = true;
    }
  }

  requestPower(): void {
    if (this.enabled) {
      this.powerRequested = true;
    }
  }

  getYaw(): number {
    return this.yaw;
  }

  getCurrentInput(): PlayerInput {
    return this.input;
  }

  update(now: number): PlayerInput {
    if (!this.enabled) {
      return this.input;
    }

    const keyboard = this.readKeyboardInput();
    const forward = clamp(keyboard.forward + this.joystickY, -1, 1);
    const right = clamp(keyboard.right + this.joystickX, -1, 1);
    const length = Math.hypot(forward, right);
    const localForward = length > 1 ? forward / length : forward;
    const localRight = length > 1 ? right / length : right;
    const normalizedForward =
      localForward * Math.cos(this.yaw) + localRight * Math.sin(this.yaw);
    const normalizedRight =
      -localForward * Math.sin(this.yaw) + localRight * Math.cos(this.yaw);
    const next = {
      forward: normalizedForward,
      right: normalizedRight,
      sprint: this.sprinting && length > 0.05,
      jump: this.jumpRequested,
      dash: this.dashRequested,
      usePower: this.powerRequested,
      yaw: this.yaw,
      pitch: this.pitch,
    };

    if (this.hasInputChanged(next) || now - this.lastSentAt >= NETWORK.sendInputIntervalMs) {
      this.input = next;
      this.lastSentAt = now;
      this.onInputChange(next);
    }
    this.jumpRequested = false;
    this.dashRequested = false;
    this.powerRequested = false;
    return this.input;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.joystick.removeEventListener("pointerdown", this.handleJoystickDown);
    this.joystick.removeEventListener("pointermove", this.handleJoystickMove);
    this.joystick.removeEventListener("pointerup", this.handleJoystickUp);
    this.joystick.removeEventListener("pointercancel", this.handleJoystickUp);
    this.setEnabled(false);
  }

  private readKeyboardInput(): { forward: number; right: number } {
    let forward = 0;
    let right = 0;
    for (const code of this.keys) {
      const direction = KEY_DIRECTIONS[code];
      if (direction === "forward") forward += 1;
      if (direction === "backward") forward -= 1;
      if (direction === "right") right += 1;
      if (direction === "left") right -= 1;
    }
    return { forward, right };
  }

  private hasInputChanged(next: PlayerInput): boolean {
    return (
      Math.abs(next.forward - this.input.forward) > 0.01 ||
      Math.abs(next.right - this.input.right) > 0.01 ||
      next.sprint !== this.input.sprint ||
      next.jump !== this.input.jump ||
      next.dash !== this.input.dash ||
      next.usePower !== this.input.usePower ||
      Math.abs(next.yaw - this.input.yaw) > 0.01 ||
      Math.abs(next.pitch - this.input.pitch) > 0.01
    );
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || this.isTypingTarget(event.target)) {
      return;
    }
    if (
      event.code in KEY_DIRECTIONS ||
      event.code === "Space" ||
      event.code === "KeyQ" ||
      event.code === "KeyE" ||
      event.code === "ShiftLeft" ||
      event.code === "ShiftRight"
    ) {
      event.preventDefault();
    }
    if (event.code === "Space" && !event.repeat) {
      this.requestJump();
    }
    if (event.code === "KeyQ" && !event.repeat) {
      this.requestDash();
    }
    if (event.code === "KeyE" && !event.repeat) {
      this.requestPower();
    }
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.sprinting = true;
    }
    if (event.code in KEY_DIRECTIONS) {
      this.keys.add(event.code);
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.sprinting = false;
    }
  };

  private clearKeys = (): void => {
    this.keys.clear();
    this.sprinting = false;
    this.jumpRequested = false;
    this.dashRequested = false;
    this.powerRequested = false;
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled) {
      return;
    }
    this.dragPointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled || event.pointerId !== this.dragPointerId) {
      return;
    }
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.yaw -= deltaX * this.sensitivity;
    this.pitch = clamp(
      this.pitch - deltaY * this.sensitivity,
      -0.62,
      0.48,
    );
    this.onCameraChange(this.yaw, this.pitch);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.dragPointerId) {
      this.dragPointerId = null;
    }
  };

  private handleJoystickDown = (event: PointerEvent): void => {
    if (!this.enabled) {
      return;
    }
    event.preventDefault();
    this.pointer = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    this.joystick.setPointerCapture(event.pointerId);
    this.updateJoystick(event.clientX, event.clientY);
  };

  private handleJoystickMove = (event: PointerEvent): void => {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) {
      return;
    }
    this.updateJoystick(event.clientX, event.clientY);
  };

  private handleJoystickUp = (event: PointerEvent): void => {
    if (!this.pointer || event.pointerId !== this.pointer.pointerId) {
      return;
    }
    this.pointer = null;
    this.resetJoystick();
  };

  private updateJoystick(clientX: number, clientY: number): void {
    const rect = this.joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDistance = rect.width * 0.31;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const length = Math.hypot(dx, dy);
    const scale = length > maxDistance ? maxDistance / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    this.joystickX = x / maxDistance;
    this.joystickY = -y / maxDistance;
    this.joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
  }

  private resetJoystick(): void {
    this.joystickX = 0;
    this.joystickY = 0;
    this.joystickKnob.style.transform = "translate(0, 0)";
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    );
  }
}
