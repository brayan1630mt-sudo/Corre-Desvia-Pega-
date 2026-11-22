import "./style.css";
import { Game } from "./game/Game.ts";
import { NetworkClient } from "./game/NetworkClient.ts";
import { SoundEffects } from "./game/SoundEffects.ts";
import { Hud } from "./ui/Hud.ts";
import { PLAYER_COLORS } from "./shared/constants.ts";
import type {
  FeedEvent,
  GameError,
  LobbyPreferences,
  RoomState,
  TagEvent,
} from "./shared/types.ts";

const PREFERENCES_KEY = "corre-game-preferences";
const DEFAULT_PREFERENCES: LobbyPreferences = {
  displayName: "",
  lastRoomCode: "",
  playerColor: PLAYER_COLORS[0],
  soundEnabled: true,
  reducedMotion: false,
  showHints: true,
};

function readPreferences(): LobbyPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_PREFERENCES };
    }
    const value = parsed as Partial<LobbyPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      displayName:
        typeof value.displayName === "string" ? value.displayName : "",
      lastRoomCode:
        typeof value.lastRoomCode === "string" ? value.lastRoomCode : "",
      playerColor:
        PLAYER_COLORS.find((color) => color === value.playerColor) ??
        DEFAULT_PREFERENCES.playerColor,
      soundEnabled:
        typeof value.soundEnabled === "boolean" ? value.soundEnabled : true,
    };
  } catch (error) {
    console.warn("Não foi possível carregar as preferências do jogo.", error);
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(preferences: LobbyPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Não foi possível salvar as preferências do jogo.", error);
  }
}

function friendlyError(error: GameError): string {
  const messages: Record<GameError["code"], string> = {
    INVALID_NAME: "Escolha um apelido para continuar.",
    ROOM_NOT_FOUND: "Não encontramos essa sala. Confira o código.",
    ROOM_FULL: "Essa sala já está cheia.",
    GAME_IN_PROGRESS: "Essa rodada já começou. Tente outra sala.",
    NOT_HOST: "Só o anfitrião pode iniciar a partida.",
    NOT_IN_ROOM: "Entre em uma sala antes.",
    INVALID_INPUT: error.message,
  };
  return messages[error.code] ?? error.message;
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("O elemento principal do jogo não foi encontrado.");
}

const preferences = readPreferences();
let localPlayerId = "";
let previousPhase: RoomState["phase"] | null = null;
let joinedRoomCode = "";

const sound = new SoundEffects();
sound.setEnabled(preferences.soundEnabled);

let hud: Hud;
const network = new NetworkClient({
  onState: (state) => {
    game.setRoomState(state);
    hud.setRoomState(state, localPlayerId);
    if (previousPhase !== state.phase) {
      if (state.phase === "playing") {
        sound.play("start");
      } else if (state.phase === "finished") {
        const winner = state.players.find((player) => player.id === state.winnerId);
        sound.play(winner?.id === localPlayerId ? "win" : "tick");
      }
      previousPhase = state.phase;
    }
  },
  onJoined: (id, roomCode, isHost) => {
    localPlayerId = id;
    joinedRoomCode = roomCode;
    preferences.lastRoomCode = roomCode;
    savePreferences(preferences);
    game.setLocalPlayer(id);
    hud.setRoomCode(roomCode);
    sound.play("join");
    hud.showNotification(
      isHost ? "Sala criada! Convide a turma com o código." : "Você entrou na sala!",
      "success",
    );
  },
  onError: (error) => {
    hud.showNotification(friendlyError(error), "error", 4600);
  },
  onTag: (event: TagEvent) => {
    sound.playTag(event, localPlayerId);
    hud.addTagEvent(event);
    if (event.toId === localPlayerId) {
      const flash = app.querySelector<HTMLElement>("[data-tag-flash]");
      flash?.classList.add("tag-flash--show");
      window.setTimeout(() => flash?.classList.remove("tag-flash--show"), 650);
    }
  },
  onFeed: (event: FeedEvent) => {
    hud.addFeedEvent(event);
  },
  onConnection: (connected) => {
    hud.setConnectionStatus(connected);
    if (!connected && joinedRoomCode) {
      hud.showNotification(
        "A conexão caiu. Entre novamente para continuar jogando.",
        "warning",
        5000,
      );
      joinedRoomCode = "";
      localPlayerId = "";
      previousPhase = null;
      game.clearRoom();
      hud.returnHome();
    }
  },
});

hud = new Hud(app, {
  onCreateRoom: (name, color) => {
    if (!requireName(name)) return;
    sound.unlock();
    sound.play("click");
    network.createRoom(name, color);
  },
  onJoinRoom: (name, roomCode, color) => {
    if (!requireName(name)) return;
    if (!/^[A-Z0-9]{5}$/.test(roomCode)) {
      hud.showNotification("O código da sala precisa ter 5 caracteres.", "warning");
      return;
    }
    sound.unlock();
    sound.play("click");
    network.joinRoom(name, roomCode, color);
  },
  onQuickPlay: (name, color) => {
    if (!requireName(name)) return;
    sound.unlock();
    sound.play("click");
    network.quickPlay(name, color);
  },
  onPlayerColorChange: (color) => {
    preferences.playerColor = color;
    savePreferences(preferences);
  },
  onUsePower: () => {
    game.input.requestPower();
    sound.play("click");
  },
  onPowerUp: (type, action) => {
    sound.playPowerUp(type, action);
  },
  onStartGame: () => {
    sound.unlock();
    sound.play("click");
    network.startGame();
  },
  onLeaveRoom: () => {
    network.leaveRoom();
    joinedRoomCode = "";
    localPlayerId = "";
    previousPhase = null;
    game.clearRoom();
    hud.returnHome();
    sound.play("click");
  },
  onCopyCode: () => {
    const code = joinedRoomCode || network.getRoomCode();
    if (!code) {
      hud.showNotification("O código da sala ainda não está disponível.", "warning");
      return;
    }
    if (!navigator.clipboard?.writeText) {
      hud.showNotification(`Código da sala: ${code}`, "neutral", 6000);
      return;
    }
    void navigator.clipboard
      .writeText(code)
      .then(() => hud.showNotification("Código copiado!", "success"))
      .catch((error: unknown) => {
        console.warn("Não foi possível copiar o código da sala.", error);
        hud.showNotification(`Código da sala: ${code}`, "neutral", 6000);
      });
  },
  onToggleSound: (enabled) => {
    preferences.soundEnabled = enabled;
    sound.setEnabled(enabled);
    savePreferences(preferences);
    if (enabled) sound.play("join");
  },
  onReady: (ready) => {
    network.setReady(ready);
    sound.play("click");
  },
});

hud.setDisplayName(preferences.displayName);
hud.setPlayerColor(preferences.playerColor);
hud.setSoundEnabled(preferences.soundEnabled);

const worldStage = hud.getWorldStage();
const joystick = hud.getJoystick();
const game = new Game({
  stage: worldStage,
  joystick: joystick.base,
  joystickKnob: joystick.knob,
  onInput: (input) => network.sendInput(input),
});

const sprintButton = hud.getSprintButton();
sprintButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  game.input.setSprint(true);
  sprintButton.setPointerCapture(event.pointerId);
  sprintButton.classList.add("is-sprinting");
});
const stopSprint = (): void => {
  game.input.setSprint(false);
  sprintButton.classList.remove("is-sprinting");
};
sprintButton.addEventListener("pointerup", stopSprint);
sprintButton.addEventListener("pointercancel", stopSprint);
sprintButton.addEventListener("lostpointercapture", stopSprint);
sprintButton.addEventListener("pointerleave", stopSprint);

const jumpButton = hud.getJumpButton();
jumpButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  game.input.requestJump();
  jumpButton.setPointerCapture(event.pointerId);
  jumpButton.classList.add("is-jumping");
});
const clearJumpButton = (): void => {
  jumpButton.classList.remove("is-jumping");
};
jumpButton.addEventListener("pointerup", clearJumpButton);
jumpButton.addEventListener("pointercancel", clearJumpButton);
jumpButton.addEventListener("lostpointercapture", clearJumpButton);
jumpButton.addEventListener("pointerleave", clearJumpButton);

const dashButton = hud.getDashButton();
dashButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  game.input.requestDash();
});

app.addEventListener(
  "pointerdown",
  () => {
    sound.unlock();
  },
  { once: true },
);

window.addEventListener("pagehide", () => {
  game.destroy();
  network.disconnect();
  sound.dispose();
});

function requireName(name: string): boolean {
  const cleanName = name.trim().slice(0, 18);
  if (!cleanName) {
    hud.showNotification("Escolha um apelido antes de jogar.", "warning");
    return false;
  }
  preferences.displayName = cleanName;
  savePreferences(preferences);
  return true;
}
