/**
 * Routine Templates Store
 * Manages recurring routine presets, active selection, and template CRUD.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAppJSONStorage } from './storageAdapter';
import { RoutineTemplate, DayOfWeek } from '../types';
import { validateRoutineTemplate } from './validation';

/**
 * Pre-configured Initial Default Templates
 */
export const DEFAULT_WEEKDAY_TEMPLATE: RoutineTemplate = {
  id: 'template-weekday',
  name: 'Weekday Routine',
  assignedDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  wakeTime: '07:00',
  bedtime: '23:30',
  defaultBufferMinutes: 10,
  overflowStrategy: 'hybrid',
  isDefault: true,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
  fixedActivities: [
    {
      id: 'fixed-work',
      title: 'Work / Study',
      startTime: '09:00',
      endTime: '18:00',
      categoryEmoji: '💼',
      bufferMinutes: 10,
      isLocked: true,
    },
  ],
  flexibleActivities: [
    {
      id: 'flex-morning-workout',
      title: 'Morning Focus & Movement (Workout)',
      estimatedDuration: 30,
      minDuration: 15,
      priority: 'high',
      energyLevel: 'high',
      categoryEmoji: '⚡',
    },
    {
      id: 'flex-evening-read',
      title: 'Reading & Wind-Down',
      estimatedDuration: 45,
      minDuration: 20,
      priority: 'medium',
      energyLevel: 'low',
      categoryEmoji: '📚',
    },
    {
      id: 'flex-chores',
      title: 'Quick Chores & Tidy Up',
      estimatedDuration: 20,
      minDuration: 10,
      priority: 'low',
      energyLevel: 'medium',
      categoryEmoji: '🧹',
    },
  ],
};

export const DEFAULT_WEEKEND_TEMPLATE: RoutineTemplate = {
  id: 'template-weekend',
  name: 'Weekend Routine',
  assignedDays: ['sat', 'sun'],
  wakeTime: '08:30',
  bedtime: '00:00',
  defaultBufferMinutes: 15,
  overflowStrategy: 'hybrid',
  isDefault: true,
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
  fixedActivities: [
    {
      id: 'fixed-brunch',
      title: 'Weekend Brunch / Social',
      startTime: '11:30',
      endTime: '13:00',
      categoryEmoji: '🥞',
      bufferMinutes: 10,
      isLocked: true,
    },
  ],
  flexibleActivities: [
    {
      id: 'flex-outdoor',
      title: 'Outdoor Workout / Activity',
      estimatedDuration: 60,
      minDuration: 30,
      priority: 'high',
      energyLevel: 'high',
      categoryEmoji: '🚴',
    },
    {
      id: 'flex-creative',
      title: 'Gaming / Creative Time',
      estimatedDuration: 90,
      minDuration: 45,
      priority: 'medium',
      energyLevel: 'high',
      categoryEmoji: '🎮',
    },
    {
      id: 'flex-rest',
      title: 'Relax & Chill',
      estimatedDuration: 45,
      minDuration: 30,
      priority: 'low',
      energyLevel: 'low',
      categoryEmoji: '☕',
    },
  ],
};

export const DEFAULT_ROUTINE_TEMPLATES: RoutineTemplate[] = [
  DEFAULT_WEEKDAY_TEMPLATE,
  DEFAULT_WEEKEND_TEMPLATE,
];

export interface RoutineStoreState {
  templates: RoutineTemplate[];
  activeTemplateId: string | null;
  selectedTemplateId: string | null;
  hasHydrated: boolean;
}

export interface RoutineStoreActions {
  addTemplate: (template: Omit<RoutineTemplate, 'id' | 'createdAt' | 'updatedAt'> | RoutineTemplate) => RoutineTemplate;
  updateTemplate: (id: string, updates: Partial<Omit<RoutineTemplate, 'id' | 'createdAt'>>) => boolean;
  deleteTemplate: (id: string) => boolean;
  setActiveTemplate: (id: string) => void;
  selectTemplate: (id: string) => void;
  getTemplateById: (id: string) => RoutineTemplate | undefined;
  getTemplateForDay: (day: DayOfWeek) => RoutineTemplate;
  getActiveTemplateForDay: (day: DayOfWeek) => RoutineTemplate;
  resetToDefaults: () => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export type RoutineStore = RoutineStoreState & RoutineStoreActions;

export const useRoutineStore = create<RoutineStore>()(
  persist(
    (set, get) => ({
      templates: DEFAULT_ROUTINE_TEMPLATES,
      activeTemplateId: DEFAULT_WEEKDAY_TEMPLATE.id,
      selectedTemplateId: DEFAULT_WEEKDAY_TEMPLATE.id,
      hasHydrated: false,

      addTemplate: (templateData) => {
        const id = 'id' in templateData && templateData.id
          ? templateData.id
          : `template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const now = new Date().toISOString();
        const template: RoutineTemplate = {
          ...templateData,
          id,
          createdAt: 'createdAt' in templateData && templateData.createdAt ? templateData.createdAt : now,
          updatedAt: now,
        };

        const validation = validateRoutineTemplate(template);
        if (!validation.isValid) {
          throw new Error(`Template validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        set((state) => ({
          templates: [...state.templates, template],
        }));

        return template;
      },

      updateTemplate: (id, updates) => {
        const existing = get().templates.find((t) => t.id === id);
        if (!existing) return false;

        const updated: RoutineTemplate = {
          ...existing,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const validation = validateRoutineTemplate(updated);
        if (!validation.isValid) {
          console.warn('Update rejected due to validation errors:', validation.errors);
          return false;
        }

        set((state) => ({
          templates: state.templates.map((t) => (t.id === id ? updated : t)),
        }));
        return true;
      },

      deleteTemplate: (id) => {
        const { templates, activeTemplateId, selectedTemplateId } = get();
        // Prevent deleting the last template
        if (templates.length <= 1) {
          console.warn('Cannot delete the last remaining routine template');
          return false;
        }

        const remaining = templates.filter((t) => t.id !== id);
        if (remaining.length === templates.length) return false;

        // If active/selected template is deleted, reassign to first available
        const currentActive = activeTemplateId ?? selectedTemplateId;
        const newActiveId = currentActive === id ? remaining[0].id : currentActive;

        set({
          templates: remaining,
          activeTemplateId: newActiveId,
          selectedTemplateId: newActiveId,
        });
        return true;
      },

      setActiveTemplate: (id) => {
        const exists = get().templates.some((t) => t.id === id);
        if (exists) {
          set({ activeTemplateId: id, selectedTemplateId: id });
        }
      },

      selectTemplate: (id) => {
        get().setActiveTemplate(id);
      },

      getTemplateById: (id) => {
        return get().templates.find((t) => t.id === id);
      },

      getTemplateForDay: (day) => {
        const matching = get().templates.find((t) => t.assignedDays.includes(day));
        return matching ?? get().templates[0];
      },

      getActiveTemplateForDay: (day) => {
        return get().getTemplateForDay(day);
      },

      resetToDefaults: () => {
        set({
          templates: DEFAULT_ROUTINE_TEMPLATES,
          activeTemplateId: DEFAULT_WEEKDAY_TEMPLATE.id,
          selectedTemplateId: DEFAULT_WEEKDAY_TEMPLATE.id,
        });
      },

      setHasHydrated: (hydrated) => {
        set({ hasHydrated: hydrated });
      },
    }),
    {
      name: 'routine-storage',
      storage: createAppJSONStorage(),
      version: 1,
      migrate: (persistedState: any) => {
        // Guard against corrupted schema on rehydration
        if (
          !persistedState ||
          typeof persistedState !== 'object' ||
          !Array.isArray(persistedState.templates) ||
          persistedState.templates.length === 0
        ) {
          return {
            templates: DEFAULT_ROUTINE_TEMPLATES,
            activeTemplateId: DEFAULT_WEEKDAY_TEMPLATE.id,
            selectedTemplateId: DEFAULT_WEEKDAY_TEMPLATE.id,
            hasHydrated: true,
          };
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[routineStore] Rehydration failed, loading safe defaults:', error);
          state?.resetToDefaults();
        } else if (state && (!Array.isArray(state.templates) || state.templates.length === 0)) {
          state.resetToDefaults();
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
