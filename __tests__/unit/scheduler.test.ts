/**
 * Milestone 2 Unit Test Suite: Auto-Slot Scheduling Engine
 * Tests fixed activity locking, bedtime barrier cutoff, gap allocation,
 * transition buffer padding, zero/100% boundary scenarios, and mid-day re-slotting.
 */

import { calculateSchedule } from '../../src/engine/scheduler';
import { findGaps } from '../../src/engine/gapFinder';
import { RoutineTemplate, ScheduledBlock } from '../../src/types';

describe('Milestone 2 — scheduler Suite', () => {
  const baseTemplate: RoutineTemplate = {
    id: 'template-test-standard',
    name: 'Standard Weekday',
    assignedDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    wakeTime: '07:00',
    bedtime: '23:00',
    defaultBufferMinutes: 5,
    overflowStrategy: 'hybrid',
    createdAt: '2026-11-06T00:00:00Z',
    updatedAt: '2026-11-06T00:00:00Z',
    fixedActivities: [
      {
        id: 'fix-work-1',
        title: 'Morning Work',
        startTime: '09:00',
        endTime: '12:00',
        isLocked: true,
      },
      {
        id: 'fix-work-2',
        title: 'Afternoon Work',
        startTime: '13:00',
        endTime: '17:00',
        isLocked: true,
      },
    ],
    flexibleActivities: [
      {
        id: 'flex-workout',
        title: 'Gym Workout',
        estimatedDuration: 60,
        minDuration: 30,
        priority: 'high',
        energyLevel: 'high',
      },
      {
        id: 'flex-reading',
        title: 'Book Reading',
        estimatedDuration: 45,
        minDuration: 20,
        priority: 'medium',
        energyLevel: 'low',
      },
    ],
  };

  // =========================================================================
  // 1. Fixed Activity Anchoring & Conflict Detection
  // =========================================================================
  describe('1. Fixed Activity Anchoring & Conflict Rejection', () => {
    it('anchors fixed activities strictly at explicit start and end times', () => {
      const schedule = calculateSchedule(baseTemplate, '2026-11-06');
      const morningWork = schedule.blocks.find((b) => b.activityId === 'fix-work-1');
      const afternoonWork = schedule.blocks.find((b) => b.activityId === 'fix-work-2');

      expect(morningWork).toBeDefined();
      expect(morningWork?.type).toBe('fixed');
      expect(morningWork?.isLocked).toBe(true);
      expect(morningWork?.startTime).toBe('09:00');
      expect(morningWork?.endTime).toBe('12:00');
      expect(morningWork?.startMinute).toBe(540);
      expect(morningWork?.endMinute).toBe(720);

      expect(afternoonWork).toBeDefined();
      expect(afternoonWork?.type).toBe('fixed');
      expect(afternoonWork?.isLocked).toBe(true);
      expect(afternoonWork?.startTime).toBe('13:00');
      expect(afternoonWork?.endTime).toBe('17:00');
      expect(afternoonWork?.startMinute).toBe(780);
      expect(afternoonWork?.endMinute).toBe(1020);
    });

    // EDGE CASE 7: Overlapping Fixed Activities
    it('handles EC7: detects and rejects overlapping fixed activities', () => {
      const corruptTemplate: RoutineTemplate = {
        ...baseTemplate,
        fixedActivities: [
          {
            id: 'fix-job',
            title: 'Job',
            startTime: '09:00',
            endTime: '17:00',
            isLocked: true,
          },
          {
            id: 'fix-doctor',
            title: 'Doctor Appointment',
            startTime: '14:00',
            endTime: '15:00',
            isLocked: true,
          },
        ],
      };

      expect(() => calculateSchedule(corruptTemplate, '2026-11-06')).toThrow(
        /OVERLAPPING_FIXED_ACTIVITIES|Overlapping fixed activities/i
      );
    });

    // EDGE CASE 8: Fixed Activity Outside Waking Hours
    it('handles EC8: fixed activity outside waking hours (Gym 05:00-06:00, Wake 07:00)', () => {
      const earlyTemplate: RoutineTemplate = {
        ...baseTemplate,
        wakeTime: '07:00',
        fixedActivities: [
          {
            id: 'fix-sunrise-gym',
            title: 'Sunrise Gym',
            startTime: '05:00',
            endTime: '06:00',
            isLocked: true,
          },
        ],
      };

      const schedule = calculateSchedule(earlyTemplate, '2026-11-06');
      const gymBlock = schedule.blocks.find((b) => b.activityId === 'fix-sunrise-gym');
      expect(gymBlock).toBeDefined();
      expect(gymBlock?.startTime).toBe('05:00');
      expect(gymBlock?.endTime).toBe('06:00');
      expect(gymBlock?.startMinute).toBe(300);
    });

    // EDGE CASE 2: Midnight Crossing Fixed Activity
    it('handles EC2: fixed activity crossing midnight (Night Shift 22:00-02:00, Bed 02:30)', () => {
      const overnightTemplate: RoutineTemplate = {
        ...baseTemplate,
        wakeTime: '18:00',
        bedtime: '02:30',
        fixedActivities: [
          {
            id: 'fix-night-shift',
            title: 'Night Shift',
            startTime: '22:00',
            endTime: '02:00',
            isLocked: true,
          },
        ],
      };

      const schedule = calculateSchedule(overnightTemplate, '2026-11-06');
      const shiftBlock = schedule.blocks.find((b) => b.activityId === 'fix-night-shift');
      expect(shiftBlock).toBeDefined();
      expect(shiftBlock?.startMinute).toBe(1320); // 22:00
      expect(shiftBlock?.endMinute).toBe(1560);   // 1440 + 120 = 02:00
      expect(shiftBlock?.durationMinutes).toBe(240);
    });
  });

  // =========================================================================
  // 2. Strict Bedtime Barrier Cutoff
  // =========================================================================
  describe('2. Strict Bedtime Barrier Cutoff Guardian', () => {
    it('locks non-negotiable bedtime block and ensures zero tasks exceed bedtime', () => {
      const schedule = calculateSchedule(baseTemplate, '2026-11-06');
      const bedtimeBlock = schedule.blocks.find((b) => b.type === 'bedtime');

      expect(bedtimeBlock).toBeDefined();
      expect(bedtimeBlock?.isLocked).toBe(true);
      expect(bedtimeBlock?.startMinute).toBe(1380); // 23:00

      // All scheduled flexible tasks must conclude at or before 1380
      schedule.blocks
        .filter((b) => b.type === 'flexible' || b.type === 'buffer')
        .forEach((block) => {
          expect(block.endMinute).toBeLessThanOrEqual(1380);
        });
    });

    // EDGE CASE 1: Midnight Rollover Bedtime (Wake 07:30, Bed 01:00)
    it('handles EC1: strict bedtime past midnight (Bedtime "01:00")', () => {
      const rolloverTemplate: RoutineTemplate = {
        ...baseTemplate,
        wakeTime: '07:30',
        bedtime: '01:00',
      };

      const schedule = calculateSchedule(rolloverTemplate, '2026-11-06');
      const bedtimeBlock = schedule.blocks.find((b) => b.type === 'bedtime');
      expect(bedtimeBlock).toBeDefined();
      expect(bedtimeBlock?.startMinute).toBe(1500); // 1440 + 60
      expect(schedule.bedtime).toBe('01:00');
    });

    // EDGE CASE 12: Exact End-of-Day Bedtime Fit
    it('handles EC12: last flexible task ends exactly at bedtime without exceeding boundary', () => {
      // Available gap 21:00 (1260) to 23:00 (1380) = 120 min.
      // Task is 120m exactly consuming remaining gap.
      const exactFitTemplate: RoutineTemplate = {
        ...baseTemplate,
        fixedActivities: [
          {
            id: 'fix-until-21',
            title: 'Evening Event',
            startTime: '07:00',
            endTime: '21:00',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flex-exact',
            title: 'Night Focus',
            estimatedDuration: 120, // Exactly consumes remaining 120m
            minDuration: 60,
            priority: 'high',
            energyLevel: 'medium',
          },
        ],
      };

      const schedule = calculateSchedule(exactFitTemplate, '2026-11-06');
      const lastFlex = schedule.blocks.find((b) => b.activityId === 'flex-exact');
      expect(lastFlex).toBeDefined();
      expect(lastFlex?.endMinute).toBe(1380); // Exactly at 23:00 bedtime
      const bedtimeBlock = schedule.blocks.find((b) => b.type === 'bedtime');
      expect(bedtimeBlock?.startMinute).toBe(1380);
    });
  });

  // =========================================================================
  // 3. Gap Allocation & Transition Buffer Padding
  // =========================================================================
  describe('3. Gap Allocation & Transition Buffer Padding', () => {
    it('identifies free gaps between fixed activities and injects transition buffers', () => {
      const schedule = calculateSchedule(baseTemplate, '2026-11-06');
      const bufferBlocks = schedule.blocks.filter((b) => b.type === 'buffer');

      expect(bufferBlocks.length).toBeGreaterThanOrEqual(1);
      bufferBlocks.forEach((buf) => {
        expect(buf.durationMinutes).toBe(baseTemplate.defaultBufferMinutes);
      });
    });

    // EDGE CASE 10: Gap Smaller Than Min Gap Threshold
    it('handles EC10: ignores gaps smaller than minGapThreshold (3 min < 5 min threshold)', () => {
      const wakingInterval = { startMinute: 420, endMinute: 1380 };
      const fixedBlocks: ScheduledBlock[] = [
        {
          id: 'b1',
          title: 'Meeting 1',
          type: 'fixed',
          startTime: '09:00',
          endTime: '09:57',
          startMinute: 540,
          endMinute: 597,
          durationMinutes: 57,
          isLocked: true,
          isCompleted: false,
        },
        {
          id: 'b2',
          title: 'Meeting 2',
          type: 'fixed',
          startTime: '10:00',
          endTime: '11:00',
          startMinute: 600,
          endMinute: 660,
          durationMinutes: 60,
          isLocked: true,
          isCompleted: false,
        },
      ];

      // Gap between 597 and 600 is 3 minutes (< default 5 min threshold)
      const gaps = findGaps(wakingInterval, fixedBlocks, 5);
      const smallGap = gaps.find((g) => g.startMinute === 597 && g.endMinute === 600);
      expect(smallGap).toBeUndefined();
    });

    // EDGE CASE 9: Gap Exactly Equal to Task Duration
    it('handles EC9: gap 45m, task 45m, buffer 5m (total 50m > 45m gap)', () => {
      // Gap: 07:00 (420) to 07:45 (465) = 45m. Fixed starts at 07:45.
      const exactGapTemplate: RoutineTemplate = {
        ...baseTemplate,
        fixedActivities: [
          {
            id: 'fix-morning-standup',
            title: 'Standup',
            startTime: '07:45',
            endTime: '08:30',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flex-45m',
            title: '45m Task',
            estimatedDuration: 45,
            minDuration: 30,
            priority: 'high',
            energyLevel: 'high',
          },
        ],
      };

      const schedule = calculateSchedule(exactGapTemplate, '2026-11-06');
      const flexBlock = schedule.blocks.find((b) => b.activityId === 'flex-45m');
      expect(flexBlock).toBeDefined();
      // Should not collide with Standup at 07:45 (minute 465)
      expect(flexBlock!.endMinute).toBeLessThanOrEqual(465);
    });

    it('labels unused gap time as explicit "free" blocks ("Free Time")', () => {
      const schedule = calculateSchedule(baseTemplate, '2026-11-06');
      const freeBlocks = schedule.blocks.filter((b) => b.type === 'free');
      expect(freeBlocks.length).toBeGreaterThan(0);
      freeBlocks.forEach((fb) => {
        expect(fb.title).toMatch(/Free Time|Free/i);
        expect(fb.isLocked).toBe(false);
      });
    });
  });

  // =========================================================================
  // 4. Boundary Topologies: Zero Flexible, Zero Fixed, 100% Fixed
  // =========================================================================
  describe('4. Boundary Topologies', () => {
    // EDGE CASE 4: Zero Flexible Activities
    it('handles EC4: routine with zero flexible activities creates fixed and free blocks', () => {
      const zeroFlexTemplate: RoutineTemplate = {
        ...baseTemplate,
        flexibleActivities: [],
      };

      const schedule = calculateSchedule(zeroFlexTemplate, '2026-11-06');
      expect(schedule.deferredActivities).toEqual([]);
      expect(schedule.blocks.filter((b) => b.type === 'flexible')).toHaveLength(0);

      // Intervening gaps must be explicit "free" blocks
      const freeBlocks = schedule.blocks.filter((b) => b.type === 'free');
      expect(freeBlocks.length).toBeGreaterThanOrEqual(1);
      expect(schedule.totalFreeMinutes).toBeGreaterThan(0);
    });

    // EDGE CASE 5: Zero Fixed Activities
    it('handles EC5: routine with zero fixed activities treats entire waking interval as single gap', () => {
      const zeroFixedTemplate: RoutineTemplate = {
        ...baseTemplate,
        wakeTime: '07:00',
        bedtime: '23:00',
        fixedActivities: [],
      };

      const schedule = calculateSchedule(zeroFixedTemplate, '2026-11-06');
      const fixedBlocks = schedule.blocks.filter((b) => b.type === 'fixed');
      expect(fixedBlocks).toHaveLength(0);

      // Flexible activities should be slotted sequentially starting from wake time (07:00 / 420)
      const firstFlex = schedule.blocks.find((b) => b.type === 'flexible');
      expect(firstFlex).toBeDefined();
      expect(firstFlex?.startMinute).toBe(420);
    });

    // EDGE CASE 6: 100% Fixed Day (Zero Gap Time)
    it('handles EC6: 100% fixed day defers all flexible tasks to protect bedtime', () => {
      const fullFixedTemplate: RoutineTemplate = {
        ...baseTemplate,
        wakeTime: '07:00',
        bedtime: '23:00',
        fixedActivities: [
          {
            id: 'fix-full-day',
            title: 'All Day Work',
            startTime: '07:00',
            endTime: '23:00',
            isLocked: true,
          },
        ],
      };

      const schedule = calculateSchedule(fullFixedTemplate, '2026-11-06');
      expect(schedule.blocks.filter((b) => b.type === 'flexible')).toHaveLength(0);
      expect(schedule.deferredActivities.length).toBe(fullFixedTemplate.flexibleActivities.length);
      expect(schedule.totalFreeMinutes).toBe(0);
    });
  });

  // =========================================================================
  // 5. Dynamic Mid-Day Re-scheduling
  // =========================================================================
  describe('5. Dynamic Mid-Day Re-scheduling', () => {
    // EDGE CASE 13: Mid-Day Regeneration / Past Time Anchor
    it('handles EC13: preserves past/completed blocks and re-slots only future gaps after anchorMinute', () => {
      // Completed morning block before anchor minute 14:15 (855)
      const existingSchedule = calculateSchedule(baseTemplate, '2026-11-06');
      const morningBlock = existingSchedule.blocks.find((b) => b.activityId === 'fix-work-1')!;
      const completedMorningBlock: ScheduledBlock = {
        ...morningBlock,
        isCompleted: true,
      };

      // User triggers re-slot at 14:15 (minute 855)
      const reSchedule = calculateSchedule(baseTemplate, '2026-11-06', {
        anchorMinute: 855,
        existingBlocks: [completedMorningBlock],
      });

      // Completed block preserved
      const preservedBlock = reSchedule.blocks.find((b) => b.activityId === 'fix-work-1');
      expect(preservedBlock?.isCompleted).toBe(true);

      // No new flexible tasks scheduled before anchorMinute (855)
      const futureFlexible = reSchedule.blocks.filter(
        (b) => b.type === 'flexible' && !b.isCompleted
      );
      futureFlexible.forEach((b) => {
        expect(b.startMinute).toBeGreaterThanOrEqual(855);
      });
    });

    it('returns completed past blocks and 0 new flexible slots when anchorMinute >= bedtime', () => {
      const lateSchedule = calculateSchedule(baseTemplate, '2026-11-06', {
        anchorMinute: 1400, // 23:20 (past 23:00 bedtime)
      });

      expect(lateSchedule.blocks.filter((b) => b.type === 'flexible')).toHaveLength(0);
    });
  });

  // =========================================================================
  // 6. Chronological Integrity & Time Conservation Invariant
  // =========================================================================
  describe('6. Chronological Integrity & Conservation Invariant', () => {
    it('guarantees zero block overlap and monotonic chronological order across all blocks', () => {
      const schedule = calculateSchedule(baseTemplate, '2026-11-06');
      for (let i = 0; i < schedule.blocks.length - 1; i++) {
        const curr = schedule.blocks[i];
        const next = schedule.blocks[i + 1];
        expect(curr.endMinute).toBeLessThanOrEqual(next.startMinute);
      }
    });

    it('guarantees conservation of waking window minutes', () => {
      const schedule = calculateSchedule(baseTemplate, '2026-11-06');
      const wakingMinutes = 1380 - 420; // 960 min
      expect(schedule.totalScheduledMinutes + schedule.totalFreeMinutes).toBe(wakingMinutes);
    });
  });
});
