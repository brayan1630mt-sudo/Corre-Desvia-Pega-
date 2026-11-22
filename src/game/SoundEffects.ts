import { SOUND_SETTINGS } from "../shared/constants.ts";
import type { PowerUpType, TagEvent } from "../shared/types.ts";

type SoundName =
  | "click"
  | "join"
  | "tag"
  | "start"
  | "win"
  | "tick"
  | "power"
  | "freeze";

const SOUND_PRESETS: Record<
  SoundName,
  { frequency: number; duration: number; wave: OscillatorType; pitchEnd?: number }
> = {
  click: { frequency: 460, duration: 0.055, wave: "sine", pitchEnd: 1.16 },
  join: { frequency: 520, duration: 0.22, wave: "triangle", pitchEnd: 1.42 },
  tag: { frequency: 245, duration: 0.3, wave: "sawtooth", pitchEnd: 0.62 },
  start: { frequency: 390, duration: 0.36, wave: "triangle", pitchEnd: 1.75 },
  win: { frequency: 580, duration: 0.54, wave: "sine", pitchEnd: 1.68 },
  tick: { frequency: 760, duration: 0.075, wave: "sine", pitchEnd: 0.9 },
  power: { frequency: 520, duration: 0.28, wave: "triangle", pitchEnd: 1.8 },
  freeze: { frequency: 410, duration: 0.24, wave: "triangle", pitchEnd: 0.62 },
};

const BACKGROUND_MELODY = [
  261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23,
  440, 523.25, 392, 349.23, 329.63, 261.63, 293.66, 392,
];
const BACKGROUND_BASS = [130.81, 110, 87.31, 98];
const MUSIC_SCHEDULER_INTERVAL_MS = 120;
const MUSIC_LOOKAHEAD_SECONDS = 0.45;
const MUSIC_FADE_SECONDS = 0.55;

export class SoundEffects {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = SOUND_SETTINGS.enabledByDefault;
  private volume = SOUND_SETTINGS.masterVolume;
  private hasStarted = false;
  private musicBus: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextMusicAt = 0;
  private musicIndex = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopBackgroundMusic();
    } else if (this.hasStarted) {
      this.unlock();
    }
  }

  play(name: SoundName): void {
    if (!this.enabled || typeof window === "undefined") {
      return;
    }
    const context = this.getContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => this.syncBackgroundMusic())
        .catch((error: unknown) => {
          console.warn("Não foi possível iniciar o áudio do jogo.", error);
        });
    }

    const preset = SOUND_PRESETS[name];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const endFrequency = preset.frequency * (preset.pitchEnd ?? 1);
    oscillator.type = preset.wave;
    oscillator.frequency.setValueAtTime(preset.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency),
      now + preset.duration,
    );
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(this.volume, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, now + preset.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.02);
  }

  playTag(event: TagEvent, localId: string): void {
    if (event.toId === localId) {
      this.play("tag");
      return;
    }
    if (event.fromId === localId) {
      this.play("join");
      return;
    }
    this.play("click");
  }

  playPowerUp(
    type: PowerUpType,
    action: "collected" | "used",
  ): void {
    this.play(action === "used" && type === "freeze" ? "freeze" : "power");
  }

  unlock(): void {
    this.hasStarted = true;
    const context = this.getContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => this.syncBackgroundMusic())
        .catch((error: unknown) => {
          console.warn("Não foi possível iniciar o áudio do jogo.", error);
        });
      return;
    }
    this.syncBackgroundMusic();
  }

  dispose(): void {
    this.stopBackgroundMusic();
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
    }
    this.audioContext = null;
  }

  private getContext(): AudioContext | null {
    if (this.audioContext) {
      return this.audioContext;
    }
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }
    this.audioContext = new AudioContextConstructor();
    return this.audioContext;
  }

  private syncBackgroundMusic(): void {
    if (!this.enabled || !this.audioContext || this.audioContext.state !== "running") {
      this.stopBackgroundMusic();
      return;
    }
    if (this.musicTimer !== null) {
      return;
    }

    const context = this.audioContext;
    const bus = context.createGain();
    bus.gain.setValueAtTime(0, context.currentTime);
    bus.gain.linearRampToValueAtTime(1, context.currentTime + 1.4);
    bus.connect(context.destination);
    this.musicBus = bus;
    this.nextMusicAt = context.currentTime + 0.08;
    this.scheduleBackgroundNotes(context);
    this.musicTimer = window.setInterval(
      () => this.scheduleBackgroundNotes(context),
      MUSIC_SCHEDULER_INTERVAL_MS,
    );
  }

  private scheduleBackgroundNotes(context: AudioContext): void {
    if (
      !this.enabled ||
      context.state !== "running" ||
      !this.musicBus
    ) {
      this.stopBackgroundMusic();
      return;
    }

    const scheduleUntil = context.currentTime + MUSIC_LOOKAHEAD_SECONDS;
    while (this.nextMusicAt < scheduleUntil) {
      const noteIndex = this.musicIndex % BACKGROUND_MELODY.length;
      this.scheduleNote(
        context,
        this.musicBus,
        BACKGROUND_MELODY[noteIndex]!,
        this.nextMusicAt,
        MUSIC_FADE_SECONDS,
        SOUND_SETTINGS.backgroundMusicVolume,
        "sine",
      );
      if (noteIndex % 4 === 0) {
        const bassIndex =
          Math.floor(noteIndex / 4) % BACKGROUND_BASS.length;
        this.scheduleNote(
          context,
          this.musicBus,
          BACKGROUND_BASS[bassIndex]!,
          this.nextMusicAt,
          SOUND_SETTINGS.backgroundMusicBeatSeconds * 3.5,
          SOUND_SETTINGS.backgroundMusicVolume * 0.36,
          "triangle",
        );
      }
      this.musicIndex += 1;
      this.nextMusicAt += SOUND_SETTINGS.backgroundMusicBeatSeconds;
    }
  }

  private scheduleNote(
    context: AudioContext,
    bus: GainNode,
    frequency: number,
    startAt: number,
    duration: number,
    peakVolume: number,
    waveform: OscillatorType,
  ): void {
    const oscillator = context.createOscillator();
    const noteGain = context.createGain();
    const fadeIn = Math.min(0.12, duration * 0.28);
    const endAt = startAt + duration;

    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    noteGain.gain.setValueAtTime(0.0001, startAt);
    noteGain.gain.exponentialRampToValueAtTime(peakVolume, startAt + fadeIn);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(noteGain);
    noteGain.connect(bus);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.03);
  }

  private stopBackgroundMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    const bus = this.musicBus;
    this.musicBus = null;
    if (!bus || !this.audioContext || this.audioContext.state === "closed") {
      return;
    }
    const now = this.audioContext.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(0, now, 0.08);
    window.setTimeout(() => bus.disconnect(), 700);
  }
}
