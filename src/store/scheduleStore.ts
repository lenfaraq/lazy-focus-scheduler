/**
 * Daily Schedule Store
 * Persists calculated schedules by date (YYYY-MM-DD), tracks completion, and enables mid-day updates.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAppJSONStorage } from './storageAdapter';
import { DaySchedule, ScheduledBlock } from '../types';
import { validateDaySchedule } from './validation';

export interface ScheduleStoreState {
  schedules: Record<string, DaySchedule>;
  activeDate: string; // "YYYY-MM-DD"
  hasHydrated: boolean;
}

export interface ScheduleStoreActions {
  setDaySchedule: (date: string, schedule: DaySchedule) => void;
  saveSchedule: (schedule: DaySchedule) => void;
  getDaySchedule: (date: string) => DaySchedule | null;
  getScheduleForDate: (date: string) => DaySchedule | null;
  setActiveDate: (date: string) => void;
  toggleBlockCompletion: (date: string, blockId: string) => void;
  setBlockCompleted: (date: string, blockId: string, isCompleted: boolean) => boolean;
  completeBlockEarly: (date: string, blockId: string, actualEndMinute: number) => void;
  skipBlock: (date: string, blockId: string) => void;
  updateBlock: (date: string, blockId: string, updates: Partial<ScheduledBlock>) => void;
  clearOldSchedules: (retentionDays?: number) => void;
  clearAllSchedules: () => void;
  clearSchedules: () => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export type ScheduleStore = ScheduleStoreState & ScheduleStoreActions;

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const useScheduleStore = create<ScheduleStore>()(
  persist(
    (set, get) => ({
      schedules: {},
      activeDate: getTodayString(),
      hasHydrated: false,

      setDaySchedule: (date, schedule) => {
        const validation = validateDaySchedule(schedule);
        if (!validation.isValid) {
          console.warn('[scheduleStore] Invalid day schedule:', validation.errors);
        }
        set((state) => ({
          schedules: {
            ...state.schedules,
            [date]: {
              ...schedule,
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      saveSchedule: (schedule) => {
        get().setDaySchedule(schedule.date, schedule);
      },

      getDaySchedule: (date) => {
        return get().schedules[date] ?? null;
      },

      getScheduleForDate: (date) => {
        return get().getDaySchedule(date);
      },

      setActiveDate: (date) => {
        set({ activeDate: date });
      },

      toggleBlockCompletion: (date, blockId) => {
        const schedule = get().schedules[date];
        if (!schedule) return;

        const updatedBlocks = schedule.blocks.map((block) =>
          block.id === blockId ? { ...block, isCompleted: !block.isCompleted } : block
        );

        set((state) => ({
          schedules: {
            ...state.schedules,
            [date]: {
              ...schedule,
              blocks: updatedBlocks,
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      setBlockCompleted: (date, blockId, isCompleted) => {
        const schedule = get().schedules[date];
        if (!schedule) return false;

        const exists = schedule.blocks.some((b) => b.id === blockId);
        if (!exists) return false;

        const updatedBlocks = schedule.blocks.map((block) =>
          block.id === blockId ? { ...block, isCompleted } : block
        );

        set((state) => ({
          schedules: {
            ...state.schedules,
            [date]: {
              ...schedule,
              blocks: updatedBlocks,
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        }));
        return true;
      },

      completeBlockEarly: (date, blockId, actualEndMinute) => {
        const schedule = get().schedules[date];
        if (!schedule) return;

        const updatedBlocks = schedule.blocks.map((block) => {
          if (block.id !== blockId) return block;
          const clampedEnd = Math.max(block.startMinute + 1, Math.min(block.endMinute, actualEndMinute));
          const newDuration = clampedEnd - block.startMinute;
          const endHours = Math.floor(clampedEnd / 60) % 24;
          const endMins = clampedEnd % 60;
          const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

          return {
            ...block,
            endMinute: clampedEnd,
            endTime,
            durationMinutes: newDuration,
            isCompleted: true,
          };
        });

        set((state) => ({
          schedules: {
            ...state.schedules,
            [date]: {
              ...schedule,
              blocks: updatedBlocks,
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      skipBlock: (date, blockId) => {
        const schedule = get().schedules[date];
        if (!schedule) return;

        const updatedBlocks = schedule.blocks.map((block) =>
          block.id === blockId ? { ...block, isCompleted: true, notes: 'Skipped by user' } : block
        );

        set((state) => ({
          schedules: {
            ...state.schedules,
            [date]: {
              ...schedule,
              blocks: updatedBlocks,
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      updateBlock: (date, blockId, updates) => {
        const schedule = get().schedules[date];
        if (!schedule) return;

        const updatedBlocks = schedule.blocks.map((block) =>
          block.id === blockId ? { ...block, ...updates } : block
        );

        set((state) => ({
          schedules: {
            ...state.schedules,
            [date]: {
              ...schedule,
              blocks: updatedBlocks,
              lastUpdatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      clearOldSchedules: (retentionDays = 14) => {
        const now = Date.now();
        const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
        const currentSchedules = get().schedules;
        const pruned: Record<string, DaySchedule> = {};

        for (const [dateStr, sched] of Object.entries(currentSchedules)) {
          const scheduleTime = new Date(dateStr).getTime();
          if (!isNaN(scheduleTime) && now - scheduleTime <= cutoffMs) {
            pruned[dateStr] = sched;
          }
        }

        set({ schedules: pruned });
      },

      clearAllSchedules: () => {
        set({ schedules: {} });
      },

      clearSchedules: () => {
        get().clearAllSchedules();
      },

      setHasHydrated: (hydrated) => {
        set({ hasHydrated: hydrated });
      },
    }),
    {
      name: 'schedule-storage',
      storage: createAppJSONStorage(),
      version: 1,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[scheduleStore] Rehydration failed:', error);
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
