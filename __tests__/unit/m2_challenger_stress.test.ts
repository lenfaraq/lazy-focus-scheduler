/**
 * Milestone 2 Challenger Adversarial Stress Suite
 * Engine Stress, Boundary Invariants, and Combinatorial Verification
 *
 * Scenarios Tested:
 * 1. Extreme Combinatorial Overflows (10+ to 50 flexible tasks competing for micro-gaps)
 * 2. Complex Fixed Activity Obstacle Mazes across 24h
 * 3. Rapid Mid-Day Anchor Shifts (07:00 -> 10:30 -> 14:15 -> 21:00 -> 23:45)
 * 4. Multiple Midnight Crossings and Overnight Shifts
 * 5. Extreme Degenerate Inputs (0 buffer, 0 gap, 100% fixed, 0 fixed, 1-minute tasks)
 * 6. High-Volume Randomized Invariant Fuzzing
 */

import { calculateSchedule } from '../../src/engine/scheduler';
import { findGaps } from '../../src/engine/gapFinder';
import { resolveOverflow, sortFlexibleActivities } from '../../src/engine/overflowHandler';
import {
  timeToMinutes,
  minutesToTime,
  normalizeMinute,
  normalizeWakingInterval,
} from '../../src/engine/timeUtils';
import { validateDaySchedule } from '../../src/store/validation';
import { RoutineTemplate, ScheduledBlock, FlexibleActivity, FixedActivity } from '../../src/types';

describe('CHALLENGER ADVERSARIAL STRESS SUITE — Milestone 2 Engine', () => {
  const TARGET_DATE = '2026-11-06';

  // Helper to assert strict schedule invariants on any DaySchedule
  function assertScheduleInvariants(schedule: ReturnType<typeof calculateSchedule>, template: RoutineTemplate) {
    // Invariant 1: Valid date and time formats
    expect(schedule.date).toBe(TARGET_DATE);
    expect(schedule.wakeTime).toBe(template.wakeTime);
    expect(schedule.bedtime).toBe(template.bedtime);

    // Invariant 2: validateDaySchedule passes with zero errors
    const validation = validateDaySchedule(schedule);
    if (!validation.isValid) {
      const errDetails = validation.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
      throw new Error(`Schedule validation failed: ${errDetails}`);
    }
    expect(validation.isValid).toBe(true);

    // Invariant 3: Strictly non-overlapping monotonic blocks
    for (let i = 0; i < schedule.blocks.length - 1; i++) {
      const curr = schedule.blocks[i];
      const next = schedule.blocks[i + 1];
      expect(curr.endMinute).toBeLessThanOrEqual(next.startMinute);
      expect(curr.durationMinutes).toBeGreaterThanOrEqual(0);
    }

    // Invariant 4: Bedtime barrier is respected (no flexible or buffer block ends after bedtime startMinute)
    const wakingInterval = normalizeWakingInterval(template.wakeTime, template.bedtime);
    const nonBedtimeBlocks = schedule.blocks.filter((b) => b.type !== 'bedtime');
    for (const b of nonBedtimeBlocks) {
      expect(b.endMinute).toBeLessThanOrEqual(wakingInterval.endMinute);
    }

    // Invariant 5: Bedtime block exists and is anchored at wakingInterval.endMinute
    const bedtimeBlock = schedule.blocks.find((b) => b.type === 'bedtime');
    expect(bedtimeBlock).toBeDefined();
    expect(bedtimeBlock?.startMinute).toBe(wakingInterval.endMinute);

    // Invariant 6: Conservation of flexible tasks (every task is either scheduled or deferred)
    const allTaskIds = (template.flexibleActivities || []).map((t) => t.id);
    const scheduledTaskIds = schedule.blocks
      .filter((b) => b.type === 'flexible' && b.activityId)
      .map((b) => b.activityId!);
    const deferredTaskIds = schedule.deferredActivities.map((d) => d.id);

    for (const id of allTaskIds) {
      const isScheduled = scheduledTaskIds.includes(id);
      const isDeferred = deferredTaskIds.includes(id);
      expect(isScheduled || isDeferred).toBe(true);
    }
  }

  // =========================================================================
  // SECTION 1: Extreme Combinatorial Overflows
  // =========================================================================
  describe('1. Extreme Combinatorial Overflows', () => {
    it('handles 20 flexible tasks competing for small fragmented gaps under drop_low_priority', () => {
      const tasks: FlexibleActivity[] = Array.from({ length: 20 }, (_, i) => {
        const priority: 'high' | 'medium' | 'low' = i < 5 ? 'high' : i < 13 ? 'medium' : 'low';
        const energy: 'high' | 'medium' | 'low' = i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low';
        return {
          id: `flex-comb-${i}`,
          title: `Combinatorial Task ${i}`,
          estimatedDuration: 40 + (i % 4) * 10,
          minDuration: 20,
          priority,
          energyLevel: energy,
        };
      });

      const template: RoutineTemplate = {
        id: 'tmpl-comb-drop',
        name: 'Combinatorial Drop Low',
        assignedDays: ['mon'],
        wakeTime: '07:00',
        bedtime: '23:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'drop_low_priority',
        fixedActivities: [
          { id: 'f1', title: 'Work 1', startTime: '08:00', endTime: '12:00', isLocked: true },
          { id: 'f2', title: 'Work 2', startTime: '13:00', endTime: '18:00', isLocked: true },
          { id: 'f3', title: 'Night Event', startTime: '19:30', endTime: '23:00', isLocked: true },
        ],
        flexibleActivities: tasks,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      const deferredLow = schedule.deferredActivities.filter((t) => t.priority === 'low');
      expect(deferredLow.length).toBeGreaterThan(0);

      const scheduledFlex = schedule.blocks.filter((b) => b.type === 'flexible');
      expect(scheduledFlex.length).toBeGreaterThanOrEqual(1);

      const scheduledIds = new Set(scheduledFlex.map((b) => b.activityId));
      const droppedHigh = schedule.deferredActivities.filter((t) => t.priority === 'high');
      if (droppedHigh.length > 0) {
        const scheduledLow = scheduledFlex.filter((b) => {
          const original = tasks.find((t) => t.id === b.activityId);
          return original?.priority === 'low';
        });
        expect(scheduledLow).toHaveLength(0);
      }
    });

    it('handles 20 flexible tasks under proportional_scale without dropping below minDuration', () => {
      const tasks: FlexibleActivity[] = Array.from({ length: 15 }, (_, i) => ({
        id: `flex-scale-${i}`,
        title: `Scale Task ${i}`,
        estimatedDuration: 60,
        minDuration: 30,
        priority: 'high',
        energyLevel: 'medium',
      }));

      const template: RoutineTemplate = {
        id: 'tmpl-comb-scale',
        name: 'Combinatorial Scale',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '18:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'proportional_scale',
        fixedActivities: [],
        flexibleActivities: tasks,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      const scheduledFlex = schedule.blocks.filter((b) => b.type === 'flexible');
      for (const b of scheduledFlex) {
        expect(b.durationMinutes).toBeGreaterThanOrEqual(30);
      }
    });

    it('handles 50 micro-tasks (10-15m) competing for limited space under hybrid strategy', () => {
      const tasks: FlexibleActivity[] = Array.from({ length: 50 }, (_, i) => ({
        id: `flex-micro-${i}`,
        title: `Micro Task ${i}`,
        estimatedDuration: 10 + (i % 6),
        minDuration: 8,
        priority: i % 4 === 0 ? 'high' : i % 2 === 0 ? 'medium' : 'low',
        energyLevel: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
      }));

      const template: RoutineTemplate = {
        id: 'tmpl-comb-50',
        name: '50 Micro Tasks',
        assignedDays: ['mon'],
        wakeTime: '06:00',
        bedtime: '22:00',
        defaultBufferMinutes: 2,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'f1', title: 'Work Block', startTime: '09:00', endTime: '17:00', isLocked: true },
        ],
        flexibleActivities: tasks,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      expect(schedule.blocks.length).toBeGreaterThan(10);
      expect(schedule.deferredActivities.length).toBeGreaterThan(0);
    });

    it('handles extreme overflow where even single high-priority task exceeds total capacity', () => {
      const template: RoutineTemplate = {
        id: 'tmpl-impossible-fit',
        name: 'Impossible Fit',
        assignedDays: ['mon'],
        wakeTime: '07:00',
        bedtime: '23:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'f1', title: 'Day Job', startTime: '07:20', endTime: '23:00', isLocked: true },
        ],
        flexibleActivities: [
          {
            id: 'huge-task',
            title: 'Big High Task',
            estimatedDuration: 60,
            minDuration: 45,
            priority: 'high',
            energyLevel: 'high',
          },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      expect(schedule.blocks.filter((b) => b.type === 'flexible')).toHaveLength(0);
      expect(schedule.deferredActivities).toHaveLength(1);
      expect(schedule.deferredActivities[0].id).toBe('huge-task');

      const freeBlock = schedule.blocks.find((b) => b.type === 'free');
      expect(freeBlock).toBeDefined();
      expect(freeBlock?.durationMinutes).toBe(20);
    });

    it('guarantees deterministic stability when tasks have identical attributes', () => {
      const identicalTasks: FlexibleActivity[] = Array.from({ length: 6 }, (_, i) => ({
        id: `identical-${i}`,
        title: `Task ${i}`,
        estimatedDuration: 30,
        minDuration: 15,
        priority: 'medium',
        energyLevel: 'medium',
      }));

      const template: RoutineTemplate = {
        id: 'tmpl-identical',
        name: 'Identical Tasks',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '12:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [],
        flexibleActivities: identicalTasks,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const run1 = calculateSchedule(template, TARGET_DATE);
      const run2 = calculateSchedule(template, TARGET_DATE);

      expect(run1.blocks.map((b) => b.id)).toEqual(run2.blocks.map((b) => b.id));
      expect(run1.blocks.map((b) => b.startMinute)).toEqual(run2.blocks.map((b) => b.startMinute));
      expect(run1.deferredActivities.map((d) => d.id)).toEqual(run2.deferredActivities.map((d) => d.id));
    });
  });

  // =========================================================================
  // SECTION 2: Complex Fixed Activity Obstacle Mazes Across 24h
  // =========================================================================
  describe('2. Complex Fixed Activity Mazes Across 24h', () => {
    it('navigates an 8-activity obstacle maze across 24h with zero-gaps and micro-gaps', () => {
      const fixedMaze: FixedActivity[] = [
        { id: 'fx1', title: 'Morning Routine', startTime: '06:00', endTime: '06:30', isLocked: true },
        { id: 'fx2', title: 'Commute In', startTime: '06:30', endTime: '07:30', isLocked: true },
        { id: 'fx3', title: 'Standup', startTime: '08:00', endTime: '08:30', isLocked: true },
        { id: 'fx4', title: 'Deep Work A', startTime: '08:34', endTime: '11:30', isLocked: true },
        { id: 'fx5', title: 'Team Lunch', startTime: '12:00', endTime: '13:00', isLocked: true },
        { id: 'fx6', title: 'Client Sync', startTime: '13:00', endTime: '14:30', isLocked: true },
        { id: 'fx7', title: 'Commute Out', startTime: '17:00', endTime: '18:00', isLocked: true },
        { id: 'fx8', title: 'Gym Class', startTime: '20:30', endTime: '22:00', isLocked: true },
      ];

      const flexPool: FlexibleActivity[] = [
        { id: 'fl1', title: 'Review Code', estimatedDuration: 25, minDuration: 15, priority: 'high', energyLevel: 'high' },
        { id: 'fl2', title: 'Write Docs', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'medium' },
        { id: 'fl3', title: 'Language Study', estimatedDuration: 45, minDuration: 20, priority: 'medium', energyLevel: 'low' },
        { id: 'fl4', title: 'Inbox Zero', estimatedDuration: 30, minDuration: 15, priority: 'low', energyLevel: 'low' },
      ];

      const template: RoutineTemplate = {
        id: 'tmpl-fixed-maze',
        name: 'Fixed Activity Maze',
        assignedDays: ['mon'],
        wakeTime: '06:00',
        bedtime: '23:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: fixedMaze,
        flexibleActivities: flexPool,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      for (const fx of fixedMaze) {
        const found = schedule.blocks.find((b) => b.activityId === fx.id);
        expect(found).toBeDefined();
        expect(found?.isLocked).toBe(true);
        expect(found?.startTime).toBe(fx.startTime);
        expect(found?.endTime).toBe(fx.endTime);
      }

      const subThresholdGap = schedule.blocks.find(
        (b) => b.startMinute === 510 && b.endMinute === 514
      );
      expect(subThresholdGap).toBeDefined();
      expect(subThresholdGap?.type).toBe('free');

      const b1 = schedule.blocks.find((b) => b.activityId === 'fx1')!;
      const b2 = schedule.blocks.find((b) => b.activityId === 'fx2')!;
      expect(b1.endMinute).toBe(b2.startMinute);
    });

    it('handles fixed activity ending exactly at bedtime without interval clipping', () => {
      const template: RoutineTemplate = {
        id: 'tmpl-fixed-at-bedtime',
        name: 'Fixed Until Bedtime',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '22:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'evening-class', title: 'Night Class', startTime: '19:00', endTime: '22:00', isLocked: true },
        ],
        flexibleActivities: [
          { id: 'fl-1', title: 'Morning Gym', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'high' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      const nightClass = schedule.blocks.find((b) => b.activityId === 'evening-class');
      const bedtimeBlock = schedule.blocks.find((b) => b.type === 'bedtime');

      expect(nightClass?.endMinute).toBe(1320);
      expect(bedtimeBlock?.startMinute).toBe(1320);
    });

    it('handles fixed activity starting exactly at wake time', () => {
      const template: RoutineTemplate = {
        id: 'tmpl-fixed-at-wake',
        name: 'Fixed From Wake',
        assignedDays: ['mon'],
        wakeTime: '06:00',
        bedtime: '22:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'dawn-duty', title: 'Dawn Duty', startTime: '06:00', endTime: '08:00', isLocked: true },
        ],
        flexibleActivities: [
          { id: 'flex-after-dawn', title: 'Post-Duty Rest', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'low' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      const dawnBlock = schedule.blocks.find((b) => b.activityId === 'dawn-duty');
      expect(dawnBlock?.startMinute).toBe(360);
    });
  });

  // =========================================================================
  // SECTION 3: Rapid Mid-Day Anchor Shifts
  // =========================================================================
  describe('3. Rapid Mid-Day Anchor Shifts', () => {
    const baseShiftTemplate: RoutineTemplate = {
      id: 'tmpl-anchor-shifts',
      name: 'Mid-Day Shift Routine',
      assignedDays: ['mon'],
      wakeTime: '07:00', // 420
      bedtime: '23:30',  // 1410
      defaultBufferMinutes: 5,
      overflowStrategy: 'hybrid',
      fixedActivities: [
        { id: 'work-morning', title: 'Morning Job', startTime: '09:00', endTime: '12:00', isLocked: true },
        { id: 'work-afternoon', title: 'Afternoon Job', startTime: '13:00', endTime: '17:00', isLocked: true },
        { id: 'family-dinner', title: 'Family Dinner', startTime: '19:00', endTime: '20:30', isLocked: true },
      ],
      flexibleActivities: [
        { id: 'fl-workout', title: 'Gym Workout', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'high' },
        { id: 'fl-study', title: 'Deep Study', estimatedDuration: 90, minDuration: 45, priority: 'high', energyLevel: 'high' },
        { id: 'fl-reading', title: 'Read Book', estimatedDuration: 45, minDuration: 20, priority: 'medium', energyLevel: 'low' },
        { id: 'fl-meditation', title: 'Evening Meditation', estimatedDuration: 30, minDuration: 15, priority: 'low', energyLevel: 'low' },
      ],
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    it('simulates rapid sequential progression through daytime anchors (07:00 -> 10:30 -> 14:15 -> 21:00)', () => {
      // Step 1: Initial Day Schedule at 07:00
      let schedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, { anchorMinute: 420 });
      assertScheduleInvariants(schedule, baseShiftTemplate);

      // Simulate completion of morning workout before 09:00
      const morningWorkoutBlock = schedule.blocks.find((b) => b.activityId === 'fl-workout');
      if (morningWorkoutBlock) {
        morningWorkoutBlock.isCompleted = true;
      }

      // Step 2: User opens app at 10:30 (anchor = 630)
      schedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: 630,
        existingBlocks: schedule.blocks,
      });
      assertScheduleInvariants(schedule, baseShiftTemplate);

      const morningWork = schedule.blocks.find((b) => b.activityId === 'work-morning');
      expect(morningWork).toBeDefined();
      expect(morningWork?.startMinute).toBe(540);
      expect(morningWork?.endMinute).toBe(720);

      // Step 3: User opens app at 14:15 (anchor = 855)
      schedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: 855,
        existingBlocks: schedule.blocks,
      });
      assertScheduleInvariants(schedule, baseShiftTemplate);

      const afternoonWork = schedule.blocks.find((b) => b.activityId === 'work-afternoon');
      expect(afternoonWork).toBeDefined();
      expect(afternoonWork?.startMinute).toBe(780);
      expect(afternoonWork?.endMinute).toBe(1020);

      const futureFlexible = schedule.blocks.filter(
        (b) => b.type === 'flexible' && !b.isCompleted && b.startMinute >= 855
      );
      for (const flex of futureFlexible) {
        expect(flex.startMinute).toBeGreaterThanOrEqual(1020);
      }

      // Step 4: User opens app at 21:00 (anchor = 1260)
      schedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: 1260,
        existingBlocks: schedule.blocks,
      });
      assertScheduleInvariants(schedule, baseShiftTemplate);

      expect(schedule.blocks.find((b) => b.activityId === 'work-morning')).toBeDefined();
      expect(schedule.blocks.find((b) => b.activityId === 'work-afternoon')).toBeDefined();
      expect(schedule.blocks.find((b) => b.activityId === 'family-dinner')).toBeDefined();
    });

    // ADVERSARIAL STRESS CHALLENGE 1: Duplicate bedtime block on late anchor
    it('handles mid-day anchor shift past bedtime cutoff (23:45) when existingBlocks are provided', () => {
      const daytimeSchedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, { anchorMinute: 1260 });
      expect(daytimeSchedule.blocks.some((b) => b.type === 'bedtime')).toBe(true);

      // Calling calculateSchedule with anchorMinute >= bedtime (1425 >= 1410) and existingBlocks
      // Must NOT duplicate bedtime block or throw unhandled validation error!
      const lateSchedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: 1425,
        existingBlocks: daytimeSchedule.blocks,
      });

      assertScheduleInvariants(lateSchedule, baseShiftTemplate);

      // Verify exactly one bedtime block exists
      const bedtimeBlocks = lateSchedule.blocks.filter((b) => b.type === 'bedtime');
      expect(bedtimeBlocks).toHaveLength(1);
    });

    // ADVERSARIAL STRESS CHALLENGE 2: Completed tasks must not be deferred
    it('preserves completed flexible tasks without adding them to deferredActivities when anchor >= bedtime', () => {
      const daytimeSchedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, { anchorMinute: 420 });
      const workoutBlock = daytimeSchedule.blocks.find((b) => b.activityId === 'fl-workout')!;
      workoutBlock.isCompleted = true;

      // Provide existingBlocks containing the completed task
      const completedBlocksOnly = daytimeSchedule.blocks.filter((b) => b.isCompleted && b.type !== 'bedtime');
      const lateSchedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: 1425,
        existingBlocks: completedBlocksOnly,
      });

      // fl-workout was completed during the day and should NOT be reported in deferredActivities backlog
      const deferredIds = lateSchedule.deferredActivities.map((d) => d.id);
      expect(deferredIds).not.toContain('fl-workout');
    });

    it('handles anchor shift cutting through a transition buffer block cleanly', () => {
      const schedule1 = calculateSchedule(baseShiftTemplate, TARGET_DATE);
      const bufferBlock = schedule1.blocks.find((b) => b.type === 'buffer');
      expect(bufferBlock).toBeDefined();

      const midBuffer = bufferBlock!.startMinute + 2;
      const reSchedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: midBuffer,
        existingBlocks: schedule1.blocks,
      });

      assertScheduleInvariants(reSchedule, baseShiftTemplate);
    });

    it('handles anchor shift cutting through a free time block cleanly', () => {
      const schedule1 = calculateSchedule(baseShiftTemplate, TARGET_DATE);
      const freeBlock = schedule1.blocks.find((b) => b.type === 'free');
      expect(freeBlock).toBeDefined();

      const midFree = freeBlock!.startMinute + Math.floor(freeBlock!.durationMinutes / 2);
      const reSchedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: midFree,
        existingBlocks: schedule1.blocks,
      });

      assertScheduleInvariants(reSchedule, baseShiftTemplate);
    });

    it('handles anchorMinute set before wake time (e.g. 05:00 when wake is 07:00)', () => {
      const earlySchedule = calculateSchedule(baseShiftTemplate, TARGET_DATE, {
        anchorMinute: 300,
      });

      assertScheduleInvariants(earlySchedule, baseShiftTemplate);
      const firstActive = earlySchedule.blocks.find((b) => b.type !== 'bedtime');
      expect(firstActive?.startMinute).toBeGreaterThanOrEqual(420);
    });
  });

  // =========================================================================
  // SECTION 4: Multiple Midnight Crossings & Overnight Shifts
  // =========================================================================
  describe('4. Multiple Midnight Crossings & Overnight Shifts', () => {
    it('manages full night-shift schedule spanning midnight (Wake 20:00 -> Bedtime 06:00 next day)', () => {
      const nightTemplate: RoutineTemplate = {
        id: 'tmpl-night-shift',
        name: 'Night Shift Professional',
        assignedDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        wakeTime: '20:00',
        bedtime: '06:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'night-duty', title: 'Night Shift Duty', startTime: '22:00', endTime: '02:00', isLocked: true },
          { id: 'handover', title: 'Shift Handover', startTime: '03:00', endTime: '04:30', isLocked: true },
        ],
        flexibleActivities: [
          { id: 'pre-shift-meal', title: 'Pre-Shift Meal', estimatedDuration: 45, minDuration: 30, priority: 'high', energyLevel: 'high' },
          { id: 'mid-shift-reading', title: 'Study Notes', estimatedDuration: 40, minDuration: 20, priority: 'medium', energyLevel: 'medium' },
          { id: 'post-shift-winddown', title: 'Wind Down', estimatedDuration: 30, minDuration: 15, priority: 'low', energyLevel: 'low' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(nightTemplate, TARGET_DATE);
      assertScheduleInvariants(schedule, nightTemplate);

      const duty = schedule.blocks.find((b) => b.activityId === 'night-duty');
      expect(duty).toBeDefined();
      expect(duty?.startMinute).toBe(1320);
      expect(duty?.endMinute).toBe(1560);

      const handover = schedule.blocks.find((b) => b.activityId === 'handover');
      expect(handover).toBeDefined();
      expect(handover?.startMinute).toBe(1620);
      expect(handover?.endMinute).toBe(1710);

      const bedtime = schedule.blocks.find((b) => b.type === 'bedtime');
      expect(bedtime?.startMinute).toBe(1800);
    });

    it('handles bedtime at exact midnight ("00:00")', () => {
      const midnightBedTemplate: RoutineTemplate = {
        id: 'tmpl-midnight-bed',
        name: 'Midnight Bedtime',
        assignedDays: ['mon'],
        wakeTime: '07:30',
        bedtime: '00:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'dinner', title: 'Dinner', startTime: '19:00', endTime: '20:30', isLocked: true },
        ],
        flexibleActivities: [
          { id: 'late-movie', title: 'Movie', estimatedDuration: 120, minDuration: 60, priority: 'medium', energyLevel: 'low' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(midnightBedTemplate, TARGET_DATE);
      assertScheduleInvariants(schedule, midnightBedTemplate);

      const bedtime = schedule.blocks.find((b) => b.type === 'bedtime');
      expect(bedtime?.startMinute).toBe(1440);
      expect(bedtime?.startTime).toBe('00:00');
    });

    it('handles flexible task scheduled in the post-midnight hours before bedtime (00:30 - 01:30)', () => {
      const lateNightTemplate: RoutineTemplate = {
        id: 'tmpl-late-flex',
        name: 'Late Owl Routine',
        assignedDays: ['sat'],
        wakeTime: '10:00',
        bedtime: '02:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'evening-gig', title: 'Music Gig', startTime: '19:00', endTime: '23:30', isLocked: true },
        ],
        flexibleActivities: [
          { id: 'flex-post-gig', title: 'Late Relaxing', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'low' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(lateNightTemplate, TARGET_DATE);
      assertScheduleInvariants(schedule, lateNightTemplate);

      const lateFlex = schedule.blocks.find((b) => b.activityId === 'flex-post-gig');
      expect(lateFlex).toBeDefined();
      expect(lateFlex?.endMinute).toBeLessThanOrEqual(1560);
    });
  });

  // =========================================================================
  // SECTION 5: Extreme Degenerate Inputs
  // =========================================================================
  describe('5. Extreme Degenerate Inputs', () => {
    it('handles zero buffer (defaultBufferMinutes: 0) without gaps between adjacent tasks', () => {
      const zeroBufferTemplate: RoutineTemplate = {
        id: 'tmpl-zero-buf',
        name: 'Zero Buffer Routine',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '12:00',
        defaultBufferMinutes: 0,
        overflowStrategy: 'hybrid',
        fixedActivities: [],
        flexibleActivities: [
          { id: 't1', title: 'Task 1', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'high' },
          { id: 't2', title: 'Task 2', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'high' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(zeroBufferTemplate, TARGET_DATE);
      assertScheduleInvariants(schedule, zeroBufferTemplate);

      const buffers = schedule.blocks.filter((b) => b.type === 'buffer');
      expect(buffers).toHaveLength(0);

      const b1 = schedule.blocks.find((b) => b.activityId === 't1')!;
      const b2 = schedule.blocks.find((b) => b.activityId === 't2')!;
      expect(b1.endMinute).toBe(b2.startMinute);
    });

    it('handles 100% fixed day (zero gap capacity) with 15 flexible tasks cleanly deferred', () => {
      const fullFixedTemplate: RoutineTemplate = {
        id: 'tmpl-100-fixed',
        name: '100% Fixed Day',
        assignedDays: ['mon'],
        wakeTime: '07:00',
        bedtime: '23:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'block-all-day', title: 'Full Day Marathon', startTime: '07:00', endTime: '23:00', isLocked: true },
        ],
        flexibleActivities: Array.from({ length: 15 }, (_, i) => ({
          id: `flex-neg-${i}`,
          title: `Task ${i}`,
          estimatedDuration: 30,
          minDuration: 15,
          priority: 'medium',
          energyLevel: 'medium',
        })),
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(fullFixedTemplate, TARGET_DATE);
      assertScheduleInvariants(schedule, fullFixedTemplate);

      expect(schedule.deferredActivities).toHaveLength(15);
      expect(schedule.blocks.filter((b) => b.type === 'flexible')).toHaveLength(0);
      expect(schedule.totalFreeMinutes).toBe(0);
    });

    it('handles 0% fixed day (completely free waking window) packing flexibly from morning to bedtime', () => {
      const zeroFixedTemplate: RoutineTemplate = {
        id: 'tmpl-0-fixed',
        name: '0% Fixed Day',
        assignedDays: ['sun'],
        wakeTime: '09:00',
        bedtime: '21:00',
        defaultBufferMinutes: 10,
        overflowStrategy: 'hybrid',
        fixedActivities: [],
        flexibleActivities: [
          { id: 'morning-run', title: 'Run', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'high' },
          { id: 'cook-lunch', title: 'Cooking', estimatedDuration: 60, minDuration: 30, priority: 'medium', energyLevel: 'medium' },
          { id: 'movie-night', title: 'Movie', estimatedDuration: 120, minDuration: 60, priority: 'low', energyLevel: 'low' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(zeroFixedTemplate, TARGET_DATE);
      assertScheduleInvariants(schedule, zeroFixedTemplate);

      expect(schedule.blocks.filter((b) => b.type === 'fixed')).toHaveLength(0);
      expect(schedule.deferredActivities).toHaveLength(0);

      const firstFlex = schedule.blocks.find((b) => b.type === 'flexible');
      expect(firstFlex?.startMinute).toBe(540);
    });

    it('handles single-minute micro-tasks (estimatedDuration: 1, minDuration: 1)', () => {
      const microTasks: FlexibleActivity[] = Array.from({ length: 10 }, (_, i) => ({
        id: `micro-${i}`,
        title: `1-min Check ${i}`,
        estimatedDuration: 1,
        minDuration: 1,
        priority: 'high',
        energyLevel: 'medium',
      }));

      const template: RoutineTemplate = {
        id: 'tmpl-micro-1m',
        name: '1-Minute Tasks',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '10:00',
        defaultBufferMinutes: 1,
        overflowStrategy: 'hybrid',
        fixedActivities: [],
        flexibleActivities: microTasks,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(template, TARGET_DATE);
      assertScheduleInvariants(schedule, template);

      const flexBlocks = schedule.blocks.filter((b) => b.type === 'flexible');
      expect(flexBlocks.length).toBe(10);
      for (const b of flexBlocks) {
        expect(b.durationMinutes).toBe(1);
      }
    });

    it('clamps giant transition buffer (e.g. 60 min buffer on a 70 min gap)', () => {
      const giantBufferTemplate: RoutineTemplate = {
        id: 'tmpl-giant-buffer',
        name: 'Giant Buffer',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '20:00',
        defaultBufferMinutes: 60,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'f1', title: 'Meeting', startTime: '09:10', endTime: '12:00', isLocked: true },
        ],
        flexibleActivities: [
          { id: 't1', title: 'Work Prep', estimatedDuration: 50, minDuration: 30, priority: 'high', energyLevel: 'high' },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(giantBufferTemplate, TARGET_DATE);
      assertScheduleInvariants(schedule, giantBufferTemplate);

      const buffer = schedule.blocks.find((b) => b.type === 'buffer');
      expect(buffer).toBeDefined();
      expect(buffer?.durationMinutes).toBe(20);
      expect(buffer?.endMinute).toBe(550);
    });

    // ADVERSARIAL STRESS CHALLENGE 3: Time Conservation across sub-threshold gaps
    it('conserves total waking window time even when fixed activities have gaps smaller than minGapThreshold', () => {
      // Waking window: 08:00 - 12:00 (240 min)
      // Fixed 1: 08:30 - 09:30 (60 min)
      // Fixed 2: 09:33 - 10:30 (57 min)
      // Gap between Fixed 1 and 2 is 3 minutes (< 5 min minGapThreshold)
      const leakTemplate: RoutineTemplate = {
        id: 'tmpl-leak',
        name: 'Sub-Threshold Gap Conservation',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '12:00', // 240m
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          { id: 'fx1', title: 'Fixed 1', startTime: '08:30', endTime: '09:30', isLocked: true },
          { id: 'fx2', title: 'Fixed 2', startTime: '09:33', endTime: '10:30', isLocked: true },
        ],
        flexibleActivities: [],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(leakTemplate, TARGET_DATE);
      const wakingDuration = 240;
      const accountedMinutes = schedule.totalScheduledMinutes + schedule.totalFreeMinutes;

      // Invariant: Total scheduled minutes + total free minutes MUST EQUAL waking window duration
      // Sub-threshold gaps must not leak or vanish from timeline!
      expect(accountedMinutes).toBe(wakingDuration);
    });
  });

  // =========================================================================
  // SECTION 6: High-Volume Randomized Invariant Fuzzing
  // =========================================================================
  describe('6. High-Volume Invariant Fuzzing', () => {
    it('executes 30 randomized schedule variations and verifies all invariants hold', () => {
      let seed = 42;
      function pseudoRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }

      for (let run = 0; run < 30; run++) {
        const wakeHour = 6 + Math.floor(pseudoRandom() * 4);
        const bedHour = 20 + Math.floor(pseudoRandom() * 4);
        const wakeTime = `${String(wakeHour).padStart(2, '0')}:00`;
        const bedtime = `${String(bedHour).padStart(2, '0')}:00`;

        const numFixed = Math.floor(pseudoRandom() * 4);
        const fixed: FixedActivity[] = [];
        let curHour = wakeHour + 1;
        for (let f = 0; f < numFixed; f++) {
          if (curHour + 2 < bedHour) {
            fixed.push({
              id: `fuzz-fix-${run}-${f}`,
              title: `Fuzz Fix ${f}`,
              startTime: `${String(curHour).padStart(2, '0')}:00`,
              endTime: `${String(curHour + 2).padStart(2, '0')}:00`,
              isLocked: true,
            });
            curHour += 3;
          }
        }

        const numFlex = 5 + Math.floor(pseudoRandom() * 10);
        const flex: FlexibleActivity[] = Array.from({ length: numFlex }, (_, i) => ({
          id: `fuzz-flex-${run}-${i}`,
          title: `Fuzz Task ${i}`,
          estimatedDuration: 15 + Math.floor(pseudoRandom() * 45),
          minDuration: 10 + Math.floor(pseudoRandom() * 15),
          priority: pseudoRandom() > 0.6 ? 'high' : pseudoRandom() > 0.3 ? 'medium' : 'low',
          energyLevel: pseudoRandom() > 0.6 ? 'high' : pseudoRandom() > 0.3 ? 'medium' : 'low',
        }));

        const strategy: 'hybrid' | 'drop_low_priority' | 'proportional_scale' =
          pseudoRandom() > 0.66 ? 'hybrid' : pseudoRandom() > 0.33 ? 'drop_low_priority' : 'proportional_scale';

        const template: RoutineTemplate = {
          id: `fuzz-template-${run}`,
          name: `Fuzz Run ${run}`,
          assignedDays: ['mon'],
          wakeTime,
          bedtime,
          defaultBufferMinutes: Math.floor(pseudoRandom() * 15),
          overflowStrategy: strategy,
          fixedActivities: fixed,
          flexibleActivities: flex,
          createdAt: '2026-11-06T00:00:00.000Z',
          updatedAt: '2026-11-06T00:00:00.000Z',
        };

        const schedule = calculateSchedule(template, TARGET_DATE);
        assertScheduleInvariants(schedule, template);
      }
    });
  });
});
