/**
 * Audio & Haptic Alert Service
 * 
 * Manages foreground looping alarm audio with silent-mode override (expo-audio)
 * and rhythmic heavy haptic feedback loops during activity expiration transition alerts.
 * Provides per-second countdown haptics and completion chimes.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Safe require/import of expo-audio
let ExpoAudio: typeof import('expo-audio') | null = null;
try {
  ExpoAudio = require('expo-audio');
} catch {
  ExpoAudio = null;
}

export interface AlarmPlaybackConfig {
  soundSource?: any;
  volume?: number;
  loop?: boolean;
  hapticIntervalMs?: number;
  enableHaptics?: boolean;
}

export type AudioServiceConfig = AlarmPlaybackConfig;

/**
 * Trigger per-second light impact haptic for 10-second countdown.
 */
export async function triggerTickHaptic(): Promise<void> {
  try {
    if (Platform.OS !== 'web' && Haptics?.impactAsync) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Gracefully suppress UnavailabilityError in Jest/Simulator
  }
}

/**
 * Trigger success notification chime haptic upon countdown reaching 0s.
 */
export async function triggerCompleteHaptic(): Promise<void> {
  try {
    if (Platform.OS !== 'web' && Haptics?.notificationAsync) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    try {
      if (Platform.OS !== 'web' && Haptics?.impactAsync) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch {
      // Gracefully suppress UnavailabilityError
    }
  }
}

export class AudioService {
  private player: any = null;
  private playing: boolean = false;
  private hapticTimer: ReturnType<typeof setInterval> | null = null;
  private hapticsRunning: boolean = false;

  /**
   * Configure audio mode for unignorable alarm playback (bypasses iOS hardware silent switch).
   */
  async initialize(): Promise<void> {
    try {
      if (Platform.OS === 'ios' && ExpoAudio?.setAudioModeAsync) {
        await ExpoAudio.setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'duckOthers' as any,
          shouldPlayInBackground: false,
        });
      }
    } catch {
      // Safe degradation for simulator or headless test environments
    }
  }

  /**
   * Start looping audio alarm and rhythmic heavy haptic pulse.
   */
  async startAlarm(config?: Partial<AlarmPlaybackConfig>): Promise<void> {
    const volume = config?.volume ?? 1.0;
    const loop = config?.loop ?? true;
    const hapticInterval = config?.hapticIntervalMs ?? 1500;
    const enableHaptics = config?.enableHaptics ?? true;

    this.playing = true;

    // 1. Audio Playback
    if (ExpoAudio?.createAudioPlayer) {
      try {
        const source = config?.soundSource ?? null;
        if (source) {
          this.player = ExpoAudio.createAudioPlayer(source);
          this.player.loop = loop;
          this.player.volume = volume;
          this.player.play?.();
        }
      } catch (err) {
        console.warn('[AudioService] Failed to initialize audio player; proceeding with haptics only:', err);
      }
    }

    // 2. Rhythmic Heavy Haptic Feedback Loop
    if (enableHaptics) {
      this.startRhythmicHaptics(hapticInterval);
    }
  }

  // Alias for compatibility
  startTransitionAlert = async (config?: Partial<AlarmPlaybackConfig>): Promise<void> => {
    return this.startAlarm(config);
  };

  /**
   * Stop alarm immediately: pause audio, reset position, clear haptics.
   */
  async stopAlarm(): Promise<void> {
    this.playing = false;
    this.stopRhythmicHaptics();

    if (this.player) {
      try {
        this.player.pause?.();
        if (typeof this.player.currentTime === 'number') {
          this.player.currentTime = 0;
        }
        this.player.release?.() ?? this.player.remove?.();
      } catch {
        // Ignore release error
      }
      this.player = null;
    }
  }

  // Alias for compatibility
  stopTransitionAlert = async (): Promise<void> => {
    return this.stopAlarm();
  };

  private startRhythmicHaptics(intervalMs: number): void {
    this.stopRhythmicHaptics();
    this.hapticsRunning = true;

    // Trigger immediate first pulse
    this.triggerHeavyHapticSafe();

    this.hapticTimer = setInterval(() => {
      if (!this.hapticsRunning) return;
      this.triggerHeavyHapticSafe();
    }, intervalMs);
  }

  private stopRhythmicHaptics(): void {
    this.hapticsRunning = false;
    if (this.hapticTimer) {
      clearInterval(this.hapticTimer);
      this.hapticTimer = null;
    }
  }

  private async triggerHeavyHapticSafe(): Promise<void> {
    try {
      if (Platform.OS !== 'web' && Haptics?.impactAsync) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch {
      // Safe fallback
    }
  }

  playCountdownTick = async (): Promise<void> => {
    return triggerTickHaptic();
  };

  playCountdownComplete = async (): Promise<void> => {
    return triggerCompleteHaptic();
  };

  isAlarmPlaying(): boolean {
    return this.playing;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isHapticActive(): boolean {
    return this.hapticsRunning;
  }

  async cleanup(): Promise<void> {
    await this.stopAlarm();
  }
}

export const audioService = new AudioService();
