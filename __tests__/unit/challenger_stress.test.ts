/**
 * Challenger Adversarial Stress Suite for Milestone 1
 * Targets:
 * 1. Corrupted storage JSON recovery (SafeJSONStorage + store rehydration)
 * 2. High-concurrency rapid store updates (race conditions, invariant checks)
 * 3. Validation boundaries (zero waking window, midnight rollover, invalid HH:mm, negative buffers)
 * 4. Storage facade audit (verifying actual persistence without mocks/fakes)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useRoutineStore,
  DEFAULT_ROUTINE_TEMPLATES,
  DEFAULT_WEEKDAY_TEMPLATE,
} from '../../src/store/routineStore';
import { useScheduleStore } from '../../src/store/scheduleStore';
import { useActiveStateStore } from '../../src/store/activeStateStore';
import {
  InMemoryStorage,
  SafeJSONStorage,
  asyncStorageAdapter,
} from '../../src/store/storageAdapter';
import {
  validateTimeFormat,
  timeToMinutes,
  validateFixedActivity,
  validateFlexibleActivity,
  validateRoutineTemplate,
  validateDaySchedule,
} from '../../src/store/validation';
import { RoutineTemplate, DaySchedule, ScheduledBlock } from '../../src/types';

describe('CHALLENGER STRESS SUITE — Milestone 1 Offline Storage & Stores', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useRoutineStore.getState().resetToDefaults();
    useScheduleStore.getState().clearSchedules();
    useActiveStateStore.getState().resetActiveState();
    jest.clearAllMocks();
  });

  // =========================================================================
  // SECTION 1: Corrupted Storage JSON Recovery
  // =========================================================================
  describe('1. Corrupted Storage JSON Recovery', () => {
    describe('SafeJSONStorage unit-level probes', () => {
      it('recovers with null on malformed JSON strings without throwing', async () => {
        const memory = new InMemoryStorage();
        const safe = new SafeJSONStorage(memory);

        const malformedSamples = [
          '{',
          '{"key":',
          '{"name": "test",,}',
          'undefined',
          'NaN',
          '{"version": 1, "state": {',
          '<<<HTML>>>',
        ];

        for (const sample of malformedSamples) {
          memory.setItem('test-key', sample);
          let result: string | null = 'not-called';
          let threw = false;
          try {
            result = await safe.getItem('test-key');
          } catch (e) {
            threw = true;
          }
          expect(threw).toBe(false);
          expect(result).toBeNull();
        }
      });

      it('probes behavior on non-object roots (numbers, booleans, strings, arrays, null)', async () => {
        const memory = new InMemoryStorage();
        const safe = new SafeJSONStorage(memory);

        const nonObjectRoots = [
          { raw: '12345', desc: 'number primitive' },
          { raw: 'true', desc: 'boolean primitive' },
          { raw: '"plain string"', desc: 'string primitive' },
          { raw: 'null', desc: 'null literal' },
          { raw: '[1, 2, 3]', desc: 'array root' },
        ];

        for (const { raw, desc } of nonObjectRoots) {
          memory.setItem('non-obj-key', raw);
          let result: string | null = null;
          let threw = false;
          try {
            result = await safe.getItem('non-obj-key');
          } catch (e) {
            threw = true;
          }
          expect(threw).toBe(false);
          // Verify that SafeJSONStorage returns either null or raw without crashing
        }
      });

      it('detects corrupted Zustand envelope where state property is not an object or null', async () => {
        const memory = new InMemoryStorage();
        const safe = new SafeJSONStorage(memory);

        const invalidEnvelopes = [
          JSON.stringify({ version: 1, state: null }),
          JSON.stringify({ version: 1, state: 'not-an-object' }),
          JSON.stringify({ version: 1, state: 42 }),
          JSON.stringify({ version: 1, state: true }),
        ];

        for (const payload of invalidEnvelopes) {
          memory.setItem('envelope-key', payload);
          const res = await safe.getItem('envelope-key');
          // When state is non-object/null, SafeJSONStorage throws SyntaxError internally and catches it, returning null
          expect(res).toBeNull();
        }
      });
    });

    describe('Store rehydration under corrupt payloads', () => {
      it('survives rehydration when AsyncStorage contains primitive string', async () => {
        await AsyncStorage.setItem('routine-storage', '"malicious string"');
        await expect(useRoutineStore.persist.rehydrate()).resolves.not.toThrow();

        const state = useRoutineStore.getState();
        expect(Array.isArray(state.templates)).toBe(true);
        expect(state.templates.length).toBeGreaterThanOrEqual(1);
      });

      it('survives rehydration when AsyncStorage contains primitive number', async () => {
        await AsyncStorage.setItem('routine-storage', '99999');
        await expect(useRoutineStore.persist.rehydrate()).resolves.not.toThrow();

        const state = useRoutineStore.getState();
        expect(Array.isArray(state.templates)).toBe(true);
        expect(state.templates.length).toBeGreaterThanOrEqual(1);
      });

      it('survives rehydration when AsyncStorage contains array root', async () => {
        await AsyncStorage.setItem('routine-storage', '[{"id": "bad"}]');
        await expect(useRoutineStore.persist.rehydrate()).resolves.not.toThrow();

        const state = useRoutineStore.getState();
        expect(Array.isArray(state.templates)).toBe(true);
        expect(state.templates.length).toBeGreaterThanOrEqual(1);
      });

      it('survives rehydration when AsyncStorage contains null literal', async () => {
        await AsyncStorage.setItem('routine-storage', 'null');
        await expect(useRoutineStore.persist.rehydrate()).resolves.not.toThrow();

        const state = useRoutineStore.getState();
        expect(Array.isArray(state.templates)).toBe(true);
        expect(state.templates.length).toBeGreaterThanOrEqual(1);
      });

      it('survives rehydration when schedule-storage contains truncated payload', async () => {
        await AsyncStorage.setItem('schedule-storage', '{"version": 1, "state": {"schedules": {');
        await expect(useScheduleStore.persist.rehydrate()).resolves.not.toThrow();

        const state = useScheduleStore.getState();
        expect(typeof state.schedules).toBe('object');
      });

      it('probes schedule-storage rehydration when payload is array root [1, 2, 3]', async () => {
        await AsyncStorage.setItem('schedule-storage', '[1, 2, 3]');
        await expect(useScheduleStore.persist.rehydrate()).resolves.not.toThrow();
        const state = useScheduleStore.getState();
        // Check if schedules map is still valid object and functions like getDaySchedule don't crash
        expect(typeof state.schedules).toBe('object');
        expect(() => state.getDaySchedule('2026-11-06')).not.toThrow();
      });

      it('probes schedule-storage rehydration when payload is primitive number 42', async () => {
        await AsyncStorage.setItem('schedule-storage', '42');
        await expect(useScheduleStore.persist.rehydrate()).resolves.not.toThrow();
        const state = useScheduleStore.getState();
        expect(typeof state.schedules).toBe('object');
        expect(() => state.getDaySchedule('2026-11-06')).not.toThrow();
      });

      it('survives rehydration when active-state-storage contains empty JSON object', async () => {
        await AsyncStorage.setItem('active-state-storage', '{}');
        await expect(useActiveStateStore.persist.rehydrate()).resolves.not.toThrow();

        const state = useActiveStateStore.getState();
        expect(state.remainingSeconds).toBeDefined();
      });
    });
  });

  // =========================================================================
  // SECTION 2: High-Concurrency Rapid Store Updates
  // =========================================================================
  describe('2. High-Concurrency Rapid Store Updates', () => {
    it('rapidly adds 50 templates concurrently without duplicate IDs or corrupted state', async () => {
      const templateCreations = Array.from({ length: 50 }, (_, i) => {
        return useRoutineStore.getState().addTemplate({
          name: `Concurrent Template ${i}`,
          assignedDays: [],
          wakeTime: '07:00',
          bedtime: '23:00',
          defaultBufferMinutes: 10,
          overflowStrategy: 'hybrid',
          fixedActivities: [],
          flexibleActivities: [],
        });
      });

      const templates = useRoutineStore.getState().templates;
      // 2 default templates + 50 added = 52
      expect(templates.length).toBe(52);

      // Verify all IDs are unique
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(52);
    });

    it('handles concurrent interleaved add, update, and delete calls', async () => {
      // First seed 10 templates
      const seeded: string[] = [];
      for (let i = 0; i < 10; i++) {
        const t = useRoutineStore.getState().addTemplate({
          name: `Seed Template ${i}`,
          assignedDays: [],
          wakeTime: '06:00',
          bedtime: '22:00',
          defaultBufferMinutes: 5,
          overflowStrategy: 'hybrid',
          fixedActivities: [],
          flexibleActivities: [],
        });
        seeded.push(t.id);
      }

      // Execute interleaved operations
      const ops = [
        ...seeded.map((id, index) => () => {
          if (index % 2 === 0) {
            useRoutineStore.getState().updateTemplate(id, { name: `Updated Name ${index}` });
          } else {
            useRoutineStore.getState().deleteTemplate(id);
          }
        }),
        ...Array.from({ length: 5 }, (_, i) => () => {
          useRoutineStore.getState().addTemplate({
            name: `Parallel Add ${i}`,
            assignedDays: [],
            wakeTime: '08:00',
            bedtime: '23:30',
            defaultBufferMinutes: 10,
            overflowStrategy: 'hybrid',
            fixedActivities: [],
            flexibleActivities: [],
          });
        }),
      ];

      // Shuffle and execute in rapid succession
      ops.sort(() => Math.random() - 0.5);
      ops.forEach((fn) => fn());

      const finalState = useRoutineStore.getState();
      expect(finalState.templates.length).toBeGreaterThanOrEqual(1);

      // Ensure activeTemplateId and selectedTemplateId point to existing templates
      if (finalState.activeTemplateId) {
        expect(finalState.templates.some((t) => t.id === finalState.activeTemplateId)).toBe(true);
      }
      if (finalState.selectedTemplateId) {
        expect(finalState.templates.some((t) => t.id === finalState.selectedTemplateId)).toBe(true);
      }
    });

    it('stress-tests concurrent rapid completions and skips on scheduleStore', () => {
      const mockSchedule: DaySchedule = {
        date: '2026-11-06',
        wakeTime: '07:00',
        bedtime: '23:00',
        totalScheduledMinutes: 300,
        totalFreeMinutes: 660,
        generatedAt: '2026-11-06T00:00:00Z',
        deferredActivities: [],
        blocks: Array.from({ length: 20 }, (_, i) => ({
          id: `block-${i}`,
          title: `Block ${i}`,
          type: 'flexible',
          startTime: '08:00',
          endTime: '08:30',
          startMinute: 480 + i * 30,
          endMinute: 510 + i * 30,
          durationMinutes: 30,
          isLocked: false,
          isCompleted: false,
        })),
      };

      useScheduleStore.getState().saveSchedule(mockSchedule);

      // Rapidly toggle completions concurrently
      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0) {
          useScheduleStore.getState().completeBlockEarly('2026-11-06', `block-${i}`, 480 + i * 30 + 15);
        } else if (i % 3 === 1) {
          useScheduleStore.getState().skipBlock('2026-11-06', `block-${i}`);
        } else {
          useScheduleStore.getState().toggleBlockCompletion('2026-11-06', `block-${i}`);
        }
      }

      const updated = useScheduleStore.getState().getDaySchedule('2026-11-06');
      expect(updated).toBeDefined();
      expect(updated?.blocks.length).toBe(20);

      // Verify early completed block has updated duration
      const earlyBlock = updated?.blocks.find((b) => b.id === 'block-0');
      expect(earlyBlock?.isCompleted).toBe(true);
      expect(earlyBlock?.durationMinutes).toBe(15);

      // Verify skipped block has notes
      const skippedBlock = updated?.blocks.find((b) => b.id === 'block-1');
      expect(skippedBlock?.isCompleted).toBe(true);
      expect(skippedBlock?.notes).toContain('Skipped');

      // Verify toggled block is completed
      const toggledBlock = updated?.blocks.find((b) => b.id === 'block-2');
      expect(toggledBlock?.isCompleted).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 3: Validation Boundaries
  // =========================================================================
  describe('3. Validation Boundaries', () => {
    describe('Time Format Validation & timeToMinutes', () => {
      it('validates 24-hr time strings correctly', () => {
        expect(validateTimeFormat('00:00')).toBe(true);
        expect(validateTimeFormat('07:30')).toBe(true);
        expect(validateTimeFormat('23:59')).toBe(true);
        expect(validateTimeFormat('12:00')).toBe(true);

        // Invalid cases
        expect(validateTimeFormat('24:00')).toBe(false);
        expect(validateTimeFormat('25:00')).toBe(false);
        expect(validateTimeFormat('12:60')).toBe(false);
        expect(validateTimeFormat('9:00')).toBe(false);   // missing leading zero
        expect(validateTimeFormat('09:5')).toBe(false);   // missing trailing digit
        expect(validateTimeFormat('ab:cd')).toBe(false);
        expect(validateTimeFormat('12:34:56')).toBe(false);
        expect(validateTimeFormat('-01:00')).toBe(false);
        expect(validateTimeFormat('12:-10')).toBe(false);
        expect(validateTimeFormat('')).toBe(false);
        expect(validateTimeFormat('   ')).toBe(false);
        expect(validateTimeFormat(null as any)).toBe(false);
        expect(validateTimeFormat(undefined as any)).toBe(false);
      });

      it('converts valid time strings to linear minutes from midnight', () => {
        expect(timeToMinutes('00:00')).toBe(0);
        expect(timeToMinutes('01:00')).toBe(60);
        expect(timeToMinutes('07:30')).toBe(450);
        expect(timeToMinutes('12:00')).toBe(720);
        expect(timeToMinutes('23:59')).toBe(1439);
      });

      it('throws descriptive error on invalid time in timeToMinutes', () => {
        expect(() => timeToMinutes('24:00')).toThrow(/Invalid time format/);
        expect(() => timeToMinutes('invalid')).toThrow(/Invalid time format/);
        expect(() => timeToMinutes('')).toThrow(/Invalid time format/);
      });
    });

    describe('Zero-minute waking window', () => {
      it('rejects template when wakeTime equals bedtime (zero waking window)', () => {
        const template: RoutineTemplate = {
          id: 'test-zero-window',
          name: 'Zero Window Template',
          assignedDays: [],
          wakeTime: '07:00',
          bedtime: '07:00', // Equal to wakeTime
          defaultBufferMinutes: 10,
          overflowStrategy: 'hybrid',
          createdAt: '2026-11-06T00:00:00Z',
          updatedAt: '2026-11-06T00:00:00Z',
          fixedActivities: [],
          flexibleActivities: [],
        };

        const result = validateRoutineTemplate(template);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'ZERO_WAKING_WINDOW')).toBe(true);
      });

      it('rejects template when wakeTime and bedtime are both 00:00', () => {
        const template: RoutineTemplate = {
          id: 'test-midnight-zero',
          name: 'Midnight Zero Window',
          assignedDays: [],
          wakeTime: '00:00',
          bedtime: '00:00',
          defaultBufferMinutes: 10,
          overflowStrategy: 'hybrid',
          createdAt: '2026-11-06T00:00:00Z',
          updatedAt: '2026-11-06T00:00:00Z',
          fixedActivities: [],
          flexibleActivities: [],
        };

        const result = validateRoutineTemplate(template);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'ZERO_WAKING_WINDOW')).toBe(true);
      });

      it('allows minimal non-zero waking windows', () => {
        const template: RoutineTemplate = {
          id: 'test-minimal-window',
          name: 'Minimal Window',
          assignedDays: [],
          wakeTime: '07:00',
          bedtime: '07:01', // 1 minute window
          defaultBufferMinutes: 0,
          overflowStrategy: 'hybrid',
          createdAt: '2026-11-06T00:00:00Z',
          updatedAt: '2026-11-06T00:00:00Z',
          fixedActivities: [],
          flexibleActivities: [],
        };

        const result = validateRoutineTemplate(template);
        expect(result.isValid).toBe(true);
      });
    });

    describe('Midnight rollover & fixed activity conflict boundary', () => {
      it('validates single fixed activity spanning past midnight', () => {
        const template: RoutineTemplate = {
          id: 'test-night-shift',
          name: 'Night Shift',
          assignedDays: [],
          wakeTime: '18:00',
          bedtime: '10:00',
          defaultBufferMinutes: 10,
          overflowStrategy: 'hybrid',
          createdAt: '2026-11-06T00:00:00Z',
          updatedAt: '2026-11-06T00:00:00Z',
          fixedActivities: [
            {
              id: 'fixed-shift',
              title: 'Overnight Shift',
              startTime: '22:00',
              endTime: '06:00', // Rollover into next morning
              isLocked: true,
            },
          ],
          flexibleActivities: [],
        };

        const result = validateRoutineTemplate(template);
        expect(result.isValid).toBe(true);
      });

      it('detects overlap between fixed activities crossing midnight', () => {
        // Activity 1: 23:00 to 02:00
        // Activity 2: 01:00 to 03:00
        // Both share 01:00 to 02:00. This is an adversarial edge case for circular intervals.
        const template: RoutineTemplate = {
          id: 'test-rollover-overlap',
          name: 'Rollover Overlap',
          assignedDays: [],
          wakeTime: '07:00',
          bedtime: '23:30',
          defaultBufferMinutes: 10,
          overflowStrategy: 'hybrid',
          createdAt: '2026-11-06T00:00:00Z',
          updatedAt: '2026-11-06T00:00:00Z',
          fixedActivities: [
            {
              id: 'fixed-1',
              title: 'Late Night Shift',
              startTime: '23:00',
              endTime: '02:00',
              isLocked: true,
            },
            {
              id: 'fixed-2',
              title: 'Early Morning Prep',
              startTime: '01:00',
              endTime: '03:00',
              isLocked: true,
            },
          ],
          flexibleActivities: [],
        };

        const result = validateRoutineTemplate(template);
        // Does validateRoutineTemplate catch circular midnight overlap (23:00-02:00 vs 01:00-03:00)?
        // If it misses it, result.isValid will be true instead of false.
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'OVERLAPPING_FIXED_ACTIVITIES')).toBe(true);
      });

      it('detects simple consecutive non-rollover overlaps', () => {
        const template: RoutineTemplate = {
          id: 'test-direct-overlap',
          name: 'Direct Overlap',
          assignedDays: [],
          wakeTime: '07:00',
          bedtime: '23:00',
          defaultBufferMinutes: 10,
          overflowStrategy: 'hybrid',
          createdAt: '2026-11-06T00:00:00Z',
          updatedAt: '2026-11-06T00:00:00Z',
          fixedActivities: [
            {
              id: 'fixed-1',
              title: 'Meeting 1',
              startTime: '09:00',
              endTime: '11:00',
              isLocked: true,
            },
            {
              id: 'fixed-2',
              title: 'Meeting 2',
              startTime: '10:30',
              endTime: '12:00',
              isLocked: true,
            },
          ],
          flexibleActivities: [],
        };

        const result = validateRoutineTemplate(template);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'OVERLAPPING_FIXED_ACTIVITIES')).toBe(true);
      });
    });

    describe('Negative buffer durations & flexible activity boundaries', () => {
      it('rejects template with negative defaultBufferMinutes', () => {
        const template: RoutineTemplate = {
          id: 'test-neg-buffer',
          name: 'Negative Buffer Template',
          assignedDays: [],
          wakeTime: '07:00',
          bedtime: '23:00',
          defaultBufferMinutes: -10, // Negative buffer!
          overflowStrategy: 'hybrid',
          createdAt: '2026-11-06T00:00:00Z',
          updatedAt: '2026-11-06T00:00:00Z',
          fixedActivities: [],
          flexibleActivities: [],
        };
        const result = validateRoutineTemplate(template);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.field === 'defaultBufferMinutes' || e.code === 'INVALID_BUFFER')).toBe(true);
      });

      it('rejects fixed activity with negative bufferMinutes', () => {
        const res = validateFixedActivity({
          id: 'fa-neg-buf',
          title: 'Work',
          startTime: '09:00',
          endTime: '17:00',
          bufferMinutes: -5,
          isLocked: true,
        });

        expect(res.isValid).toBe(false);
        expect(res.errors.some((e) => e.code === 'INVALID_BUFFER')).toBe(true);
      });

      it('rejects flexible activity with minDuration > estimatedDuration', () => {
        const res = validateFlexibleActivity({
          id: 'flex-invalid-dur',
          title: 'Coding',
          estimatedDuration: 30,
          minDuration: 60, // Invalid: exceeds estimated
          priority: 'high',
          energyLevel: 'high',
        });

        expect(res.isValid).toBe(false);
        expect(res.errors.some((e) => e.code === 'MIN_DURATION_EXCEEDS_ESTIMATED')).toBe(true);
      });

      it('rejects flexible activity with zero or negative durations', () => {
        const zeroDur = validateFlexibleActivity({
          id: 'flex-zero',
          title: 'Task',
          estimatedDuration: 0,
          minDuration: 0,
          priority: 'high',
          energyLevel: 'high',
        });
        expect(zeroDur.isValid).toBe(false);

        const negDur = validateFlexibleActivity({
          id: 'flex-neg',
          title: 'Task',
          estimatedDuration: -10,
          minDuration: -5,
          priority: 'high',
          energyLevel: 'high',
        });
        expect(negDur.isValid).toBe(false);
      });

      it('rejects flexible activity with non-integer duration', () => {
        const floatDur = validateFlexibleActivity({
          id: 'flex-float',
          title: 'Task',
          estimatedDuration: 45.5,
          minDuration: 15,
          priority: 'high',
          energyLevel: 'high',
        });
        expect(floatDur.isValid).toBe(false);
      });

      it('rejects flexible activity with invalid priority or energy level', () => {
        const badPriority = validateFlexibleActivity({
          id: 'flex-bad-prio',
          title: 'Task',
          estimatedDuration: 30,
          minDuration: 15,
          priority: 'super-urgent' as any,
          energyLevel: 'high',
        });
        expect(badPriority.isValid).toBe(false);

        const badEnergy = validateFlexibleActivity({
          id: 'flex-bad-energy',
          title: 'Task',
          estimatedDuration: 30,
          minDuration: 15,
          priority: 'high',
          energyLevel: 'extreme' as any,
        });
        expect(badEnergy.isValid).toBe(false);
      });
    });
  });

  // =========================================================================
  // SECTION 4: Storage Facade Audit & Actual Mechanics Verification
  // =========================================================================
  describe('4. Storage Facade Audit (Verifying Actual Mechanics)', () => {
    it('verifies that store mutations directly invoke AsyncStorage without mock bypasses', async () => {
      // Clear mocks to start recording
      (AsyncStorage.setItem as jest.Mock).mockClear();

      const newTemplate = useRoutineStore.getState().addTemplate({
        name: 'Persisted Template Audit',
        assignedDays: ['mon'],
        wakeTime: '06:00',
        bedtime: '22:00',
        defaultBufferMinutes: 10,
        overflowStrategy: 'hybrid',
        fixedActivities: [],
        flexibleActivities: [],
      });

      // Verify AsyncStorage.setItem was called
      expect(AsyncStorage.setItem).toHaveBeenCalled();
      const lastCall = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
        ([key]) => key === 'routine-storage'
      );
      expect(lastCall).toBeDefined();

      // Check payload contains the added template
      const payloadString = lastCall[1];
      const parsed = JSON.parse(payloadString);
      expect(parsed.state).toBeDefined();
      expect(parsed.state.templates.some((t: any) => t.id === newTemplate.id)).toBe(true);
    });

    it('verifies that AsyncStorageAdapter safely delegates to underlying AsyncStorage', async () => {
      await asyncStorageAdapter.setItem('audit-key', 'audit-value');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('audit-key', 'audit-value');

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('audit-value');
      const retrieved = await asyncStorageAdapter.getItem('audit-key');
      expect(retrieved).toBe('audit-value');

      await asyncStorageAdapter.removeItem('audit-key');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('audit-key');
    });

    it('verifies that daySchedule persistence stores full block objects with correct properties', async () => {
      (AsyncStorage.setItem as jest.Mock).mockClear();

      const schedule: DaySchedule = {
        date: '2026-11-07',
        wakeTime: '08:00',
        bedtime: '23:00',
        totalScheduledMinutes: 120,
        totalFreeMinutes: 780,
        generatedAt: '2026-11-07T00:00:00Z',
        deferredActivities: [],
        blocks: [
          {
            id: 'block-audit-1',
            title: 'Audit Block',
            type: 'fixed',
            startTime: '10:00',
            endTime: '12:00',
            startMinute: 600,
            endMinute: 720,
            durationMinutes: 120,
            isLocked: true,
            isCompleted: false,
          },
        ],
      };

      useScheduleStore.getState().saveSchedule(schedule);

      const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
      const scheduleCall = calls.find(([k]) => k === 'schedule-storage');
      expect(scheduleCall).toBeDefined();

      const parsedPayload = JSON.parse(scheduleCall[1]);
      expect(parsedPayload.state.schedules['2026-11-07']).toBeDefined();
      expect(parsedPayload.state.schedules['2026-11-07'].blocks[0].id).toBe('block-audit-1');
    });
  });
});
