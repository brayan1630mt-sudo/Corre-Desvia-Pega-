import {
  PALETTE,
  PLAYER_COLORS,
  POWER_UP_COLORS,
  POWER_UP_LABELS,
} from "../shared/constants.ts";
import { formatTime } from "../shared/math.ts";
import type {
  FeedEvent,
  LobbyActionCallbacks,
  NotificationItem,
  PlayerState,
  RoomState,
  TagEvent,
} from "../shared/types.ts";

type ScreenName = "home" | "lobby" | "game" | "results";

const NOTIFICATION_LIMIT = 4;

function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function avatarInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

function icon(name: string): string {
  const paths: Record<string, string> = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    speaker:
      '<path d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    leave: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    spark:
      '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly callbacks: LobbyActionCallbacks;
  private readonly screen: HTMLElement;
  private readonly toastStack: HTMLElement;
  private currentScreen: ScreenName = "home";
  private currentState: RoomState | null = null;
  private localPlayerId = "";
  private feed: FeedEvent[] = [];
  private notifications: NotificationItem[] = [];
  private displayName = "";
  private selectedPlayerColor: string = PLAYER_COLORS[0];
  private soundEnabled = true;
  private connected = false;
  private lastPhase = "";
  private bound = false;

  constructor(root: HTMLElement, callbacks: LobbyActionCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.innerHTML = `
      <div class="world-stage" id="world-stage"></div>
      <div class="interface-layer">
        <div class="screen" id="screen"></div>
        <div class="touch-controls" id="touch-controls" hidden aria-label="Controles de movimento">
          <div class="joystick" id="joystick"><div class="joystick-ring"></div><div class="joystick-knob" id="joystick-knob"></div></div>
          <div class="touch-action-group">
            <button class="dash-button" data-action="dash" type="button" aria-label="Dash (Q)">DASH<span data-dash-cooldown>↗</span></button>
            <button class="jump-button" data-action="jump" type="button" aria-label="Pular">PULAR<span>↑</span></button>
            <button class="power-button" data-action="power" type="button" aria-label="Usar poder (E)" disabled><span data-power-action>PODER</span><span>E</span></button>
            <button class="sprint-button" data-action="sprint">CORRER<span>↗</span></button>
          </div>
        </div>
        <div class="toast-stack" id="toast-stack" aria-live="polite"></div>
      </div>
    `;
    this.screen = this.requireElement("#screen");
    this.toastStack = this.requireElement("#toast-stack");
    this.bind();
    this.renderHome();
  }

  setDisplayName(name: string): void {
    this.displayName = name;
    const input = this.root.querySelector<HTMLInputElement>("#player-name");
    if (input && !input.value) {
      input.value = name;
    }
  }

  setPlayerColor(color: string): void {
    if (!PLAYER_COLORS.some((option) => option === color)) {
      throw new Error("A cor selecionada não está disponível na paleta.");
    }
    this.selectedPlayerColor = color;
    this.updateColorPalette();
  }

  setConnectionStatus(connected: boolean): void {
    this.connected = connected;
    const status = this.root.querySelector<HTMLElement>("[data-connection]");
    if (!status) {
      return;
    }
    status.dataset.connected = String(connected);
    const label = status.querySelector<HTMLElement>("[data-connection-label]");
    if (label) {
      label.textContent = connected ? "Online" : "Conectando";
    }
  }

  setRoomState(state: RoomState, localPlayerId: string): void {
    const previousLocalPlayer = this.currentState?.players.find(
      (player) => player.id === localPlayerId,
    );
    const nextLocalPlayer = state.players.find(
      (player) => player.id === localPlayerId,
    );
    const collectedPowerUp =
      state.phase === "playing" &&
      nextLocalPlayer?.powerUp &&
      (nextLocalPlayer.powerUp !== previousLocalPlayer?.powerUp ||
        nextLocalPlayer.powerUpExpiresAt >
          (previousLocalPlayer?.powerUpExpiresAt ?? 0));
    const usedPowerUp =
      state.phase === "playing" &&
      (previousLocalPlayer?.powerUp === "freeze" ||
        previousLocalPlayer?.powerUp === "grapple") &&
      nextLocalPlayer?.powerUp === null;
    this.currentState = state;
    this.localPlayerId = localPlayerId;
    const nextScreen = this.screenForPhase(state.phase);
    if (nextScreen !== this.currentScreen || state.phase !== this.lastPhase) {
      this.lastPhase = state.phase;
      this.currentScreen = nextScreen;
      this.renderRoomScreen();
    }
    const touchControls = this.root.querySelector<HTMLElement>("#touch-controls");
    if (touchControls) {
      touchControls.hidden = nextScreen !== "game";
    }
    this.updateLiveValues();
    if (collectedPowerUp && nextLocalPlayer?.powerUp) {
      const label = POWER_UP_LABELS[nextLocalPlayer.powerUp];
      this.callbacks.onPowerUp(nextLocalPlayer.powerUp, "collected");
      const requiresUse =
        nextLocalPlayer.powerUp === "freeze" ||
        nextLocalPlayer.powerUp === "grapple";
      this.showNotification(
        requiresUse ? `${label} pronto! Use E para ativar.` : `${label} ativada!`,
        "success",
        2600,
      );
    }
    if (usedPowerUp && previousLocalPlayer?.powerUp) {
      this.callbacks.onPowerUp(previousLocalPlayer.powerUp, "used");
      this.showNotification(
        `${POWER_UP_LABELS[previousLocalPlayer.powerUp]} usado!`,
        "neutral",
        1800,
      );
    }
  }

  setRoomCode(code: string): void {
    const display = this.root.querySelector<HTMLElement>("[data-room-code]");
    if (display) {
      display.textContent = code;
    }
  }

  returnHome(): void {
    this.currentState = null;
    this.currentScreen = "home";
    this.lastPhase = "";
    this.feed = [];
    const touchControls = this.root.querySelector<HTMLElement>("#touch-controls");
    if (touchControls) touchControls.hidden = true;
    this.renderHome();
  }

  addFeedEvent(event: FeedEvent): void {
    this.feed.unshift(event);
    this.feed = this.feed.slice(0, 5);
    this.renderFeed();
  }

  addTagEvent(event: TagEvent): void {
    const caughtSelf = event.toId === this.localPlayerId;
    const caughtOther = event.fromId === this.localPlayerId;
    const text = caughtSelf
      ? "Você foi pego!"
      : caughtOther
        ? `Você pegou ${event.toName}!`
        : `${event.fromName} pegou ${event.toName}`;
    this.addFeedEvent({
      id: `${event.at}-${event.toId}`,
      text,
      kind: "tag",
      createdAt: event.at,
    });
    if (caughtSelf) {
      this.showNotification("Agora é sua vez de pegar!", "warning");
    } else if (caughtOther) {
      this.showNotification(`Boa! Você pegou ${event.toName}.`, "success");
    }
  }

  showNotification(
    message: string,
    type: NotificationItem["type"] = "neutral",
    duration = 3400,
  ): void {
    const notification: NotificationItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      type,
      duration,
    };
    this.notifications.unshift(notification);
    this.notifications = this.notifications.slice(0, NOTIFICATION_LIMIT);
    this.renderToasts();
    window.setTimeout(() => {
      this.notifications = this.notifications.filter(
        (item) => item.id !== notification.id,
      );
      this.renderToasts();
    }, duration);
  }

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    const button = this.root.querySelector<HTMLButtonElement>(
      '[data-action="sound"]',
    );
    if (button) {
      button.setAttribute(
        "aria-label",
        enabled ? "Desativar som" : "Ativar som",
      );
      button.classList.toggle("is-muted", !enabled);
    }
  }

  getWorldStage(): HTMLElement {
    return this.requireElement("#world-stage");
  }

  getJoystick(): { base: HTMLElement; knob: HTMLElement } {
    return {
      base: this.requireElement("#joystick"),
      knob: this.requireElement("#joystick-knob"),
    };
  }

  getSprintButton(): HTMLButtonElement {
    return this.requireElement<HTMLButtonElement>('[data-action="sprint"]');
  }

  getJumpButton(): HTMLButtonElement {
    return this.requireElement<HTMLButtonElement>('[data-action="jump"]');
  }

  getDashButton(): HTMLButtonElement {
    return this.requireElement<HTMLButtonElement>('[data-action="dash"]');
  }

  private bind(): void {
    if (this.bound) {
      return;
    }
    this.bound = true;
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("submit", this.handleSubmit);
    this.root.addEventListener("input", this.handleInput);
  }

  private handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const dismiss = target.closest<HTMLElement>("[data-dismiss]");
    if (dismiss) {
      const id = dismiss.dataset.dismiss;
      this.notifications = this.notifications.filter(
        (notification) => notification.id !== id,
      );
      this.renderToasts();
      return;
    }
    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) return;
    if (button.hasAttribute("disabled")) return;
    const action = button.dataset.action;
    if (action === "select-color") {
      const color = button.dataset.color;
      if (color && PLAYER_COLORS.some((option) => option === color)) {
        this.setPlayerColor(color);
        this.callbacks.onPlayerColorChange(color);
      }
    } else if (action === "create-room") {
      this.callbacks.onCreateRoom(this.readName(), this.selectedPlayerColor);
    } else if (action === "join-room") {
      const code = this.readInput("#room-code").toUpperCase().trim();
      this.callbacks.onJoinRoom(
        this.readName(),
        code,
        this.selectedPlayerColor,
      );
    } else if (action === "start-game") {
      this.callbacks.onStartGame();
    } else if (action === "power") {
      this.callbacks.onUsePower();
    } else if (action === "leave-room") {
      this.callbacks.onLeaveRoom();
    } else if (action === "copy-code") {
      this.callbacks.onCopyCode();
    } else if (action === "sound") {
      this.soundEnabled = !this.soundEnabled;
      this.setSoundEnabled(this.soundEnabled);
      this.callbacks.onToggleSound(this.soundEnabled);
    } else if (action === "toggle-players") {
      const panel = this.root.querySelector<HTMLElement>("#players-panel");
      if (!panel) return;
      const expanded = panel.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(expanded));
      const count = button.querySelector<HTMLElement>("[data-player-total]")?.textContent ?? "0";
      button.setAttribute(
        "aria-label",
        `${expanded ? "Ocultar" : "Mostrar"} jogadores e eventos: ${count}`,
      );
    } else if (action === "ready") {
      const ready = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(ready));
      button.classList.toggle("is-ready", ready);
      button.querySelector("[data-ready-label]")!.textContent = ready
        ? "Pronto!"
        : "Estou pronto";
      this.callbacks.onReady(ready);
    }
  };

  private handleSubmit = (event: SubmitEvent): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    event.preventDefault();
    if (form.id === "join-form") {
      const code = this.readInput("#room-code").toUpperCase().trim();
      this.callbacks.onJoinRoom(
        this.readName(),
        code,
        this.selectedPlayerColor,
      );
    } else if (form.id === "name-form") {
      this.callbacks.onQuickPlay(this.readName(), this.selectedPlayerColor);
    }
  };

  private handleInput = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === "player-name") {
      this.displayName = target.value;
      const avatar = this.root.querySelector<HTMLElement>("[data-name-avatar]");
      if (avatar) avatar.textContent = avatarInitial(target.value);
    }
    if (target instanceof HTMLInputElement && target.id === "room-code") {
      target.value = target.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
    }
  };

  private renderHome(): void {
    this.currentScreen = "home";
    this.screen.innerHTML = `
      <header class="topbar home-topbar">
        <a class="brand" href="#" aria-label="Corre, início">
          <span class="brand-mark"><span></span><span></span><span></span></span>
          <span class="brand-word">corre<span>!</span></span>
          <span class="brand-divider"></span>
          <span class="brand-caption">PEGA-PEGA 3D</span>
        </a>
        <div class="topbar-right">
          <div class="connection-pill" data-connection data-connected="false">
            <span class="connection-dot"></span>
            <span data-connection-label>Conectando</span>
          </div>
          <button class="icon-button" data-action="sound" aria-label="Desativar som" title="Som">
            ${icon("speaker")}
          </button>
        </div>
      </header>
      <main class="home-layout">
        <section class="hero-copy">
          <div class="eyebrow"><span class="eyebrow-line"></span> A brincadeira que nunca acaba</div>
          <h1>Corra.<br /><span>Desvie.</span><br />Pegue!</h1>
          <p class="hero-description">
            Uma arena, seus amigos e uma missão simples:<br class="desktop-break" />
            não deixe a brincadeira acabar com você.
          </p>
          <div class="hero-meta">
            <span class="meta-avatar-stack">
              <i>✦</i><i>●</i><i>✿</i><i>↗</i>
            </span>
            <span>Uma partida rápida com <strong>até 12 pessoas</strong></span>
          </div>
          <div class="hero-sticker" aria-hidden="true">
            <span>3D</span><small>MUITO<br />DIVERTIDO</small>
          </div>
        </section>
        <section class="play-card" aria-labelledby="play-heading">
          <div class="card-topline">
            <span class="status-spark">${icon("spark")}</span>
            <span>PRONTO PARA A CORRERIA?</span>
          </div>
          <h2 id="play-heading">Bora jogar.</h2>
          <p class="card-description">Entre com seu nome e encontre a galera.</p>
          <form id="name-form" class="name-form">
            <label class="field-label" for="player-name">Seu apelido</label>
            <div class="input-wrap name-input-wrap">
              <span class="input-avatar" data-name-avatar>?</span>
              <input id="player-name" name="name" type="text" maxlength="18"
                placeholder="Como te chamam?" autocomplete="nickname" required />
              <span class="input-hint">até 18</span>
            </div>
            <div class="character-customizer">
              <span class="field-label">Cor do personagem</span>
              <div class="character-color-palette" role="group" aria-label="Cor do personagem">
                ${PLAYER_COLORS.map(
                  (color, index) => `
                    <button
                      class="character-color-swatch${color === this.selectedPlayerColor ? " is-selected" : ""}"
                      type="button"
                      data-action="select-color"
                      data-color="${escapeHTML(color)}"
                      style="--player-color:${escapeHTML(color)}"
                      aria-label="Selecionar cor ${index + 1}"
                      aria-pressed="${color === this.selectedPlayerColor}"
                    ></button>`,
                ).join("")}
              </div>
            </div>
            <button type="submit" class="button button-primary button-main" data-action="quick-play">
              <span>Jogar agora</span>${icon("arrow")}
            </button>
            <div class="button-divider"><span>ou</span></div>
            <button type="button" class="button button-secondary" data-action="create-room">
              Criar uma sala privada <span class="button-plus">+</span>
            </button>
          </form>
          <div class="join-divider"><span>JÁ TEM UM CÓDIGO?</span></div>
          <form id="join-form" class="join-form">
            <label class="sr-only" for="room-code">Código da sala</label>
            <div class="input-wrap code-input-wrap">
              <span class="code-hash">#</span>
              <input id="room-code" type="text" maxlength="5" placeholder="CÓDIGO"
                autocomplete="off" aria-label="Código da sala" />
            </div>
            <button class="button button-dark" type="submit" aria-label="Entrar na sala">
              ${icon("arrow")}
            </button>
          </form>
          <div class="card-footnote"><span class="footnote-lock">✳</span> Sem cadastro. Só entrar e se divertir.</div>
        </section>
      </main>
      <footer class="home-footer">
        <div class="footer-controls"><span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span><span>para se mover</span></div>
        <span class="footer-center">FEITO PARA BRINCAR JUNTO</span>
        <span class="footer-version">1.0 <span>●</span> MULTIPLAYER</span>
      </footer>
      <div class="home-doodle home-doodle-one" aria-hidden="true">✳</div>
      <div class="home-doodle home-doodle-two" aria-hidden="true">✿</div>
    `;
    this.setDisplayName(this.displayName);
    this.updateColorPalette();
    this.setSoundEnabled(this.soundEnabled);
    this.setConnectionStatus(this.connected);
  }

  private renderRoomScreen(): void {
    const state = this.currentState;
    if (!state) {
      this.renderHome();
      return;
    }
    if (this.currentScreen === "lobby") {
      this.renderLobby(state);
    } else if (this.currentScreen === "game") {
      this.renderGame();
    } else {
      this.renderResults(state);
    }
  }

  private renderLobby(state: RoomState): void {
    const isHost = state.hostId === this.localPlayerId;
    this.screen.innerHTML = `
      <header class="topbar game-topbar">
        <a class="brand brand-compact" href="#">
          <span class="brand-mark"><span></span><span></span><span></span></span>
          <span class="brand-word">corre<span>!</span></span>
        </a>
        <div class="room-top-center"><span class="room-live-dot"></span> SALA DE ESPERA</div>
        <div class="topbar-right">
          <div class="connection-pill" data-connection data-connected="false">
            <span class="connection-dot"></span><span data-connection-label>Conectando</span>
          </div>
          <button class="icon-button" data-action="sound" aria-label="Desativar som" title="Som">${icon("speaker")}</button>
          <button class="icon-button leave-icon" data-action="leave-room" aria-label="Sair da sala" title="Sair">${icon("leave")}</button>
        </div>
      </header>
      <main class="lobby-layout">
        <section class="lobby-card">
          <div class="lobby-card-head">
            <div>
              <div class="eyebrow"><span class="eyebrow-line"></span> A GALERA ESTÁ CHEGANDO</div>
              <h1>Chama a turma<span class="mint-dot">.</span></h1>
              <p>Compartilhe o código e a brincadeira começa.</p>
            </div>
            <div class="lobby-illustration" aria-hidden="true">
              <span class="illustration-sun"></span><span class="illustration-person person-a"></span>
              <span class="illustration-person person-b"></span><span class="illustration-ball">✳</span>
            </div>
          </div>
          <div class="room-code-box">
            <div><span class="room-code-label">CÓDIGO DA SALA</span><strong data-room-code>${escapeHTML(state.code)}</strong></div>
            <button class="copy-code-button" data-action="copy-code">${icon("copy")}<span>Copiar</span></button>
          </div>
          <div class="players-heading">
            <div><span>JOGADORES</span><strong data-player-count>${state.players.length}<small> / 12</small></strong></div>
            <span class="waiting-pulse"><i></i> aguardando a turma</span>
          </div>
          <div class="player-grid" data-player-grid></div>
          <div class="lobby-bottom">
            <div class="lobby-tip"><span class="tip-icon">✳</span><span>Quem for <strong>pego</strong> vira o pegador. Será que você escapa?</span></div>
            <div class="lobby-actions">
              <button class="button button-secondary button-leave" data-action="leave-room">${icon("leave")} Sair</button>
              ${isHost
                ? `<button class="button button-primary button-start" data-action="start-game" ${state.players.length < 2 ? "disabled" : ""}><span>Começar a partida</span>${icon("arrow")}</button>`
                : `<button class="button button-secondary button-ready" data-action="ready" aria-pressed="false"><span data-ready-label>Estou pronto</span><span class="ready-check">✓</span></button>`}
            </div>
          </div>
        </section>
        <aside class="lobby-side-note">
          <span class="side-note-kicker">DICA DE OURO</span>
          <span class="side-note-mark">↗</span>
          <p>Olhe ao redor.<br /><strong>A saída está sempre<br />por perto.</strong></p>
          <span class="side-note-line"></span>
          <span class="side-note-foot">WASD OU TOQUE PARA CORRER</span>
        </aside>
      </main>
      <div class="game-bottom-note"><span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span><span>mover</span><i></i><span>arraste para olhar</span></div>
    `;
    this.setSoundEnabled(this.soundEnabled);
    this.setConnectionStatus(this.connected);
    this.renderPlayerGrid();
    this.renderToasts();
  }

  private renderGame(): void {
    this.screen.innerHTML = `
      <header class="topbar game-topbar live-topbar">
        <a class="brand brand-compact" href="#"><span class="brand-mark"><span></span><span></span><span></span></span><span class="brand-word">corre<span>!</span></span></a>
        <div class="live-room"><span class="room-live-dot"></span><span data-room-code></span></div>
        <div class="topbar-right">
          <div class="connection-pill" data-connection data-connected="false"><span class="connection-dot"></span><span data-connection-label>Conectando</span></div>
          <button class="icon-button" data-action="sound" aria-label="Desativar som">${icon("speaker")}</button>
          <button class="icon-button leave-icon" data-action="leave-room" aria-label="Sair da partida">${icon("leave")}</button>
        </div>
      </header>
      <main class="live-layout">
        <div class="live-status-row">
          <div class="tag-status" data-tag-status aria-label="Quem está pegando">
            <span class="tag-status-icon">✳</span><span class="tag-copy"><small>QUEM ESTÁ PEGANDO</small><strong data-tag-name>—</strong></span>
          </div>
          <div class="power-status" data-power-status><small>PODER</small><strong data-power-name>Sem poder</strong></div>
          <div class="timer-card" data-timer-card aria-label="Tempo da rodada"><span class="timer-label">TEMPO</span><strong data-timer>03:00</strong><small>RODADA <span data-round-number>01</span></small></div>
        </div>
        <button class="players-toggle" data-action="toggle-players" type="button" aria-expanded="false" aria-controls="players-panel" aria-label="Mostrar jogadores e eventos" title="Jogadores e eventos">
          ${icon("users")}<span data-player-total>0</span>
        </button>
        <aside class="players-panel" id="players-panel" aria-label="Jogadores e eventos">
          <div class="panel-heading"><span>NA BRINCADEIRA</span></div>
          <div class="live-player-list" data-live-player-list></div>
          <div class="feed-section"><div class="feed-heading"><span>ACONTECEU</span><span class="feed-live"><i></i> AO VIVO</span></div><div class="event-feed" data-event-feed></div></div>
        </aside>
        <div class="countdown-overlay" data-countdown hidden><span>PREPARADOS?</span><strong data-countdown-value>3</strong></div>
        <div class="first-person-reticle" aria-hidden="true"><span></span><i></i></div>
        <div class="game-instructions"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover</span><i></i><span>arraste para olhar</span><i></i><span><kbd>ESPAÇO</kbd> pular</span><i></i><span><kbd>SHIFT</kbd> correr</span><i></i><span><kbd>Q</kbd> dash</span><i></i><span><kbd>E</kbd> poder</span></div>
        <div class="tag-flash" data-tag-flash aria-hidden="true"><span>PEGOU!</span></div>
      </main>
    `;
    this.setSoundEnabled(this.soundEnabled);
    this.setConnectionStatus(this.connected);
    this.setRoomCode(this.currentState?.code ?? "");
    this.renderLivePlayers();
    this.renderFeed();
    this.renderToasts();
  }

  private renderResults(state: RoomState): void {
    const winner = state.players.find((player) => player.id === state.winnerId);
    const localWinner = winner?.id === this.localPlayerId;
    const isHost = state.hostId === this.localPlayerId;
    this.screen.innerHTML = `
      <header class="topbar game-topbar"><a class="brand brand-compact" href="#"><span class="brand-mark"><span></span><span></span><span></span></span><span class="brand-word">corre<span>!</span></span></a>
        <div class="topbar-right"><button class="icon-button" data-action="sound" aria-label="Som">${icon("speaker")}</button></div>
      </header>
      <main class="results-screen">
        <div class="results-confetti" aria-hidden="true"><i>✳</i><i>✦</i><i>✿</i><i>✳</i><i>●</i><i>✦</i></div>
        <div class="results-card">
          <div class="results-medal">${localWinner ? "✦" : "✳"}</div>
          <div class="eyebrow"><span class="eyebrow-line"></span> FIM DE RODADA</div>
          <h1>${localWinner ? "Mandou bem!" : "Boa brincadeira!"}</h1>
          <p>${winner ? `<strong>${escapeHTML(winner.name)}</strong> levou essa!` : "A rodada terminou."}</p>
          <div class="results-scoreboard">${this.renderScoreboard(state.players)}</div>
          <div class="results-actions">
            ${isHost
              ? `<button class="button button-primary button-main" data-action="start-game" ${state.players.length < 2 ? "disabled" : ""}><span>Jogar de novo</span>${icon("arrow")}</button>`
              : `<div class="waiting-rematch"><span class="room-live-dot"></span> esperando o anfitrião</div>`}
            <button class="button button-secondary" data-action="leave-room">Voltar ao início</button>
          </div>
        </div>
      </main>
    `;
    this.setSoundEnabled(this.soundEnabled);
    this.setConnectionStatus(this.connected);
    this.renderToasts();
  }

  private renderScoreboard(players: PlayerState[]): string {
    const sorted = [...players].sort(
      (first, second) =>
        second.survivalPoints - first.survivalPoints,
    );
    return sorted
      .map(
        (player, index) => `
          <div class="score-row ${player.id === this.localPlayerId ? "is-self" : ""}">
            <span class="score-rank">${String(index + 1).padStart(2, "0")}</span>
            <span class="score-player-dot" style="--player-color:${escapeHTML(player.color)}"></span>
            <span class="score-name">${escapeHTML(player.name)}${player.id === this.localPlayerId ? "<small>VOCÊ</small>" : ""}</span>
            <strong>${player.survivalPoints}<small> PONTOS</small></strong>
          </div>`,
      )
      .join("");
  }

  private updateLiveValues(): void {
    const state = this.currentState;
    if (!state) {
      return;
    }
    this.setRoomCode(state.code);
    const count = this.root.querySelector<HTMLElement>("[data-player-count]");
    if (count) {
      count.innerHTML = `${state.players.length}<small> / 12</small>`;
    }
    const total = this.root.querySelector<HTMLElement>("[data-player-total]");
    if (total) {
      total.textContent = String(state.players.length);
      const toggle = total.closest<HTMLButtonElement>('[data-action="toggle-players"]');
      const expanded = toggle?.getAttribute("aria-expanded") === "true";
      toggle?.setAttribute(
        "aria-label",
        `${expanded ? "Ocultar" : "Mostrar"} jogadores e eventos: ${total.textContent}`,
      );
    }
    const timer = this.root.querySelector<HTMLElement>("[data-timer]");
    if (timer) timer.textContent = formatTime(state.timeLeft);
    const round = this.root.querySelector<HTMLElement>("[data-round-number]");
    if (round) round.textContent = String(state.round).padStart(2, "0");

    const tagger = state.players.find((player) => player.isIt);
    const localPlayer = state.players.find(
      (player) => player.id === this.localPlayerId,
    );
    const dashButton = this.root.querySelector<HTMLButtonElement>(
      '[data-action="dash"]',
    );
    if (dashButton && localPlayer) {
      const cooldownLabel = dashButton.querySelector<HTMLElement>(
        "[data-dash-cooldown]",
      );
      if (!Number.isFinite(localPlayer.dashCooldownEndsAt)) {
        dashButton.disabled = true;
        dashButton.setAttribute(
          "aria-label",
          "Reinicie o servidor para usar o dash",
        );
        if (cooldownLabel) cooldownLabel.textContent = "!";
      } else {
        const cooldownMs = Math.max(
          0,
          localPlayer.dashCooldownEndsAt - Date.now(),
        );
        const cooldownSeconds = Math.ceil(cooldownMs / 1000);
        dashButton.disabled = state.phase !== "playing" || cooldownMs > 0;
        dashButton.classList.toggle("is-cooling", cooldownMs > 0);
        dashButton.setAttribute(
          "aria-label",
          cooldownSeconds > 0 ? `Dash em ${cooldownSeconds} segundos` : "Dash (Q)",
        );
        if (cooldownLabel) {
          cooldownLabel.textContent = cooldownSeconds > 0
            ? `${cooldownSeconds}s`
            : "↗";
        }
      }
    }
    const powerButton = this.root.querySelector<HTMLButtonElement>(
      '[data-action="power"]',
    );
    const powerName = this.root.querySelector<HTMLElement>("[data-power-name]");
    if (powerButton && powerName) {
      const power = localPlayer?.powerUp ?? null;
      const canUse = power === "freeze" || power === "grapple";
      const remainingSeconds =
        localPlayer && localPlayer.powerUpExpiresAt > 0
          ? Math.ceil(
              Math.max(0, localPlayer.powerUpExpiresAt - Date.now()) / 1000,
            )
          : 0;
      powerButton.disabled =
        state.phase !== "playing" ||
        !canUse ||
        Boolean(localPlayer?.isFrozen);
      powerButton.classList.toggle("is-ready", canUse);
      powerButton.style.setProperty(
        "--power-color",
        power ? POWER_UP_COLORS[power] : PALETTE.muted,
      );
      powerButton.setAttribute(
        "aria-label",
        canUse
          ? `Usar ${POWER_UP_LABELS[power]} (E)`
          : power
            ? `${POWER_UP_LABELS[power]} ativada`
            : "Nenhum poder disponível",
      );
      const actionLabel =
        powerButton.querySelector<HTMLElement>("[data-power-action]");
      if (actionLabel) {
        actionLabel.textContent =
          power === "freeze"
            ? "NEVE"
            : power === "grapple"
              ? "RAPEL"
              : power
                ? "ATIVO"
                : "PODER";
      }
      powerName.textContent = power
        ? `${POWER_UP_LABELS[power]}${
            canUse ? " · 1 uso" : ` · ${remainingSeconds}s`
          }`
        : "Sem poder";
    }
    const tagName = this.root.querySelector<HTMLElement>("[data-tag-name]");
    if (tagName) {
      tagName.textContent =
        tagger?.id === this.localPlayerId ? "VOCÊ!" : tagger?.name ?? "Preparados...";
    }
    const tagCard = this.root.querySelector<HTMLElement>("[data-tag-status]");
    tagCard?.classList.toggle("is-you", tagger?.id === this.localPlayerId);
    const timerCard = this.root.querySelector<HTMLElement>("[data-timer-card]");
    timerCard?.classList.toggle("timer-warning", state.timeLeft <= 20);
    const startButton =
      this.root.querySelector<HTMLButtonElement>('[data-action="start-game"]');
    if (startButton && state.phase === "waiting") {
      startButton.disabled = state.players.length < 2;
    }
    const countdown = this.root.querySelector<HTMLElement>("[data-countdown]");
    if (countdown) {
      countdown.hidden = state.phase !== "countdown";
      const value = countdown.querySelector<HTMLElement>("[data-countdown-value]");
      if (value) value.textContent = String(Math.max(1, state.countdown));
    }
    if (this.currentScreen === "lobby") {
      this.renderPlayerGrid();
    } else if (this.currentScreen === "game") {
      this.renderLivePlayers();
    }
  }

  private renderPlayerGrid(): void {
    const state = this.currentState;
    const grid = this.root.querySelector<HTMLElement>("[data-player-grid]");
    if (!state || !grid) {
      return;
    }
    const playerCards = state.players
      .map((player) => {
        const host = player.id === state.hostId;
        const self = player.id === this.localPlayerId;
        return `
          <div class="lobby-player ${self ? "is-self" : ""}" style="--player-color:${escapeHTML(player.color)}">
            <span class="player-avatar">${escapeHTML(avatarInitial(player.name))}<i></i></span>
            <span class="lobby-player-name">${escapeHTML(player.name)}${self ? "<small>VOCÊ</small>" : ""}</span>
            ${host ? '<span class="host-crown">★</span>' : '<span class="player-ready-dot"></span>'}
          </div>`;
      })
      .join("");
    const emptySlots = Array.from(
      { length: Math.min(4, Math.max(0, 4 - state.players.length)) },
      (_, index) =>
        `<div class="lobby-player lobby-player-empty" style="--slot:${index}"><span class="empty-avatar">+</span><span>esperando</span></div>`,
    ).join("");
    grid.innerHTML = playerCards + emptySlots;
  }

  private renderLivePlayers(): void {
    const state = this.currentState;
    const list = this.root.querySelector<HTMLElement>("[data-live-player-list]");
    if (!state || !list) {
      return;
    }
    list.innerHTML = [...state.players]
      .sort((first, second) => second.survivalPoints - first.survivalPoints)
      .map(
        (player) => `
          <div class="live-player ${player.id === this.localPlayerId ? "is-self" : ""} ${player.isIt ? "is-tagged" : ""}">
            <span class="live-player-dot" style="--player-color:${escapeHTML(player.color)}">${escapeHTML(avatarInitial(player.name))}</span>
            <span class="live-player-name">${escapeHTML(player.name)}${player.id === this.localPlayerId ? "<small>VOCÊ</small>" : ""}</span>
            <span class="live-player-score">${player.survivalPoints}<small> pts</small></span>
          </div>`,
      )
      .join("");
  }

  private updateColorPalette(): void {
    for (const swatch of this.root.querySelectorAll<HTMLButtonElement>(
      '[data-action="select-color"]',
    )) {
      const selected = swatch.dataset.color === this.selectedPlayerColor;
      swatch.classList.toggle("is-selected", selected);
      swatch.setAttribute("aria-pressed", String(selected));
    }
    const avatar = this.root.querySelector<HTMLElement>("[data-name-avatar]");
    avatar?.style.setProperty("--player-color", this.selectedPlayerColor);
  }

  private renderFeed(): void {
    const container = this.root.querySelector<HTMLElement>("[data-event-feed]");
    if (!container) {
      return;
    }
    if (this.feed.length === 0) {
      container.innerHTML = '<div class="feed-empty"><span>✦</span> A brincadeira vai começar!</div>';
      return;
    }
    container.innerHTML = this.feed
      .slice(0, 4)
      .map(
        (event) => `
          <div class="feed-item feed-${event.kind}">
            <span class="feed-icon">${event.kind === "tag" ? "✳" : event.kind === "win" ? "✦" : "·"}</span>
            <span>${escapeHTML(event.text)}</span>
          </div>`,
      )
      .join("");
  }

  private renderToasts(): void {
    this.toastStack.innerHTML = this.notifications
      .map(
        (notification) =>
          `<div class="toast toast-${notification.type}" role="status"><span class="toast-mark">${notification.type === "success" ? "✓" : notification.type === "warning" ? "!" : "✳"}</span><span>${escapeHTML(notification.message)}</span><button aria-label="Fechar notificação" data-dismiss="${escapeHTML(notification.id)}">×</button></div>`,
      )
      .join("");
  }

  private screenForPhase(phase: RoomState["phase"]): ScreenName {
    if (phase === "waiting") return "lobby";
    if (phase === "finished") return "results";
    return "game";
  }

  private readName(): string {
    const input = this.root.querySelector<HTMLInputElement>("#player-name");
    const value = input?.value.trim() ?? this.displayName.trim();
    if (!value) {
      input?.focus();
      this.showNotification("Escolha um apelido antes de jogar.", "warning");
      return "";
    }
    this.displayName = value;
    return value;
  }

  private readInput(selector: string): string {
    return this.root.querySelector<HTMLInputElement>(selector)?.value ?? "";
  }

  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
    }
    return element;
  }
}

export const BRAND_COLOR = PALETTE.mint;
