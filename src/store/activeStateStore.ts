/**
 * Active Schedule Runtime State Store
 * Manages live second countdowns, active block pointer, peek card,
 * transition nagging modal loop, and 10-second micro-action screen.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAppJSONStorage } from './storageAdapter';
import { ActiveScheduleState, ScheduledBlock, DaySchedule } from '../types';

export interface ActiveStateStoreActions {
  syncWithCurrentTime: (
    date: string,
    schedule: DaySchedule | null,
    overrideMinute?: number,
    overrideSeconds?: number
  ) => void;
  tick: () => void;
  triggerTransition: (block: ScheduledBlock, notificationIds?: string[]) => void;
  acknowledgeTransition: () => void;
  tickCountdown: () => void;
  completeCountdown: () => void;
  cancelTransition: () => void;
  setBedtimeWindDown: (isWindDown: boolean) => void;
  resetActiveState: () => void;
}

export type ActiveStateStore = ActiveScheduleState & ActiveStateStoreActions;

export const INITIAL_ACTIVE_STATE: ActiveScheduleState = {
  currentBlock: null,
  nextBlock: null,
  remainingSeconds: 0,
  elapsedSeconds: 0,
  progress: 0,
  isTransitionActive: false,
  transitionBlock: null,
  isCountdownActive: false,
  countdownSecondsLeft: 10,
  activeNotificationIds: [],
  isBedtimeWindDown: false,
  lastTickTimestamp: Date.now(),
};

export const useActiveStateStore = create<ActiveStateStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_ACTIVE_STATE,

      syncWithCurrentTime: (date, schedule, overrideMinute, overrideSeconds) => {
        if (!schedule || schedule.blocks.length === 0) {
          set({
            currentBlock: null,
            nextBlock: null,
            remainingSeconds: 0,
            elapsedSeconds: 0,
            progress: 0,
            lastTickTimestamp: Date.now(),
          });
          return;
        }

        const now = new Date();
        const currentMinute = overrideMinute ?? (now.getHours() * 60 + now.getMinutes());
        const currentSeconds = overrideSeconds ?? now.getSeconds();
        const currentAbsoluteSeconds = currentMinute * 60 + currentSeconds;

        // Find active block
        let activeIndex = -1;
        for (let i = 0; i < schedule.blocks.length; i++) {
          const b = schedule.blocks[i];
          if (currentMinute >= b.startMinute && currentMinute < b.endMinute) {
            activeIndex = i;
            break;
          }
        }

        let currentBlock: ScheduledBlock | null = null;
        let nextBlock: ScheduledBlock | null = null;
        let remainingSeconds = 0;
        let elapsedSeconds = 0;
        let progress = 0;

        if (activeIndex !== -1) {
          currentBlock = schedule.blocks[activeIndex];
          const blockEndSeconds = currentBlock.endMinute * 60;
          const blockStartSeconds = currentBlock.startMinute * 60;
          const totalDurationSeconds = Math.max(1, currentBlock.durationMinutes * 60);

          remainingSeconds = Math.max(0, blockEndSeconds - currentAbsoluteSeconds);
          elapsedSeconds = Math.max(0, currentAbsoluteSeconds - blockStartSeconds);
          progress = Math.min(1.0, Math.max(0.0, elapsedSeconds / totalDurationSeconds));

          // Next block peek
          if (activeIndex + 1 < schedule.blocks.length) {
            nextBlock = schedule.blocks[activeIndex + 1];
          }
        } else {
          // Check upcoming block if between blocks
          nextBlock = schedule.blocks.find((b) => b.startMinute > currentMinute) ?? null;
        }

        // Bedtime wind-down check (within 60m of bedtime)
        const bedtimeBlock = schedule.blocks.find((b) => b.type === 'bedtime');
        let isBedtimeWindDown = false;
        if (bedtimeBlock) {
          const diffMinutes = bedtimeBlock.startMinute - currentMinute;
          if (diffMinutes > 0 && diffMinutes <= 60) {
            isBedtimeWindDown = true;
          }
        }

        set({
          currentBlock,
          nextBlock,
          remainingSeconds,
          elapsedSeconds,
          progress,
          isBedtimeWindDown,
          lastTickTimestamp: Date.now(),
        });
      },

      tick: () => {
        const {
          remainingSeconds,
          currentBlock,
          isTransitionActive,
          isCountdownActive,
          countdownSecondsLeft,
        } = get();

        // If 10s countdown is running
        if (isCountdownActive) {
          const nextCountdown = countdownSecondsLeft - 1;
          if (nextCountdown <= 0) {
            get().completeCountdown();
          } else {
            set({ countdownSecondsLeft: nextCountdown });
          }
          return;
        }

        // Active activity countdown tick
        if (currentBlock && !isTransitionActive) {
          if (remainingSeconds <= 1) {
            // Activity expired! Trigger unignorable transition modal
            set({
              remainingSeconds: 0,
              progress: 1.0,
              isTransitionActive: true,
              transitionBlock: currentBlock,
              lastTickTimestamp: Date.now(),
            });
          } else {
            const nextRemaining = remainingSeconds - 1;
            const totalDurationSeconds = Math.max(1, currentBlock.durationMinutes * 60);
            const elapsed = totalDurationSeconds - nextRemaining;
            const progress = Math.min(1.0, Math.max(0.0, elapsed / totalDurationSeconds));

            set({
              remainingSeconds: nextRemaining,
              elapsedSeconds: elapsed,
              progress,
              lastTickTimestamp: Date.now(),
            });
          }
        }
      },

      triggerTransition: (block, notificationIds = []) => {
        set({
          isTransitionActive: true,
          transitionBlock: block,
          activeNotificationIds: notificationIds,
          isCountdownActive: false,
        });
      },

      acknowledgeTransition: () => {
        // CTA "รับทราบแล้ว" tapped
        set({
          isTransitionActive: false,
          isCountdownActive: true,
          countdownSecondsLeft: 10,
        });
      },

      tickCountdown: () => {
        const { countdownSecondsLeft, isCountdownActive } = get();
        if (!isCountdownActive) return;

        if (countdownSecondsLeft <= 1) {
          get().completeCountdown();
        } else {
          set({ countdownSecondsLeft: countdownSecondsLeft - 1 });
        }
      },

      completeCountdown: () => {
        const { nextBlock } = get();
        set({
          isCountdownActive: false,
          countdownSecondsLeft: 10,
          transitionBlock: null,
          activeNotificationIds: [],
          currentBlock: nextBlock,
          nextBlock: null,
          remainingSeconds: nextBlock ? Math.max(1, nextBlock.durationMinutes * 60) : 0,
          elapsedSeconds: 0,
          progress: 0.0,
          lastTickTimestamp: Date.now(),
        });
      },

      cancelTransition: () => {
        set({
          isTransitionActive: false,
          isCountdownActive: false,
          countdownSecondsLeft: 10,
          transitionBlock: null,
          activeNotificationIds: [],
        });
      },

      setBedtimeWindDown: (isWindDown) => {
        set({ isBedtimeWindDown: isWindDown });
      },

      resetActiveState: () => {
        set({ ...INITIAL_ACTIVE_STATE });
      },
    }),
    {
      name: 'active-state-storage',
      storage: createAppJSONStorage(),
      version: 1,
      // Partialize: Persist only transition & notification state so modal reliably restores on launch
      partialize: (state) => ({
        isTransitionActive: state.isTransitionActive,
        transitionBlock: state.transitionBlock,
        activeNotificationIds: state.activeNotificationIds,
        isBedtimeWindDown: state.isBedtimeWindDown,
      }),
    }
  )
);
