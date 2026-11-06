/**
 * Milestone 2 Challenger 2 — Mathematical Invariant Verification Suite
 *
 * Verifies the 5 core mathematical invariants across 65+ randomized, diverse,
 * and boundary-stressing valid routine templates:
 *
 * 1. Invariant 1 (Strict Chronological Non-Overlap):
 *    \forall i, block[i].endMinute <= block[i+1].startMinute
 *    with durationMinutes === endMinute - startMinute > 0.
 *
 * 2. Invariant 2 (Bedtime Barrier):
 *    No flexible task or buffer block has endMinute > wakingInterval.endMinute.
 *    Bedtime block starts exactly at wakingInterval.endMinute.
 *
 * 3. Invariant 3 (Time Conservation):
 *    totalScheduledMinutes + totalFreeMinutes === wakingMinutes.
 *    Partition of the waking interval is exact and leak-free.
 *
 * 4. Invariant 4 (Fixed Activity Immutability):
 *    Every fixed activity remains locked at its exact explicit start/end times,
 *    unaltered by flexible packing or buffer insertion.
 *
 * 5. Invariant 5 (Validation Compliance):
 *    Every emitted DaySchedule strictly passes validateDaySchedule(schedule).
 *
 * Plus Auxiliary Invariants:
 * - Activity Conservation (every flexible activity is either slotted or deferred; no drops, no dupes).
 * - Pure Functional Determinism (idempotent output across repeated calculations).
 */

import {
  calculateSchedule,
  normalizeWakingInterval,
  timeToMinutes,
  minutesToTime,
} from '../../src/engine';
import {
  validateDaySchedule,
  validateRoutineTemplate,
} from '../../src/store/validation';
import {
  RoutineTemplate,
  DaySchedule,
  ScheduledBlock,
  FixedActivity,
  FlexibleActivity,
  ActivityPriority,
  EnergyLevel,
  OverflowStrategy,
} from '../../src/types';

// =============================================================================
// Deterministic Pseudo-Random Generator (Mulberry32)
// Ensures 100% reproducible test runs across environments
// =============================================================================
function createPrng(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const prng = createPrng(20261106);

function randomInt(min: number, max: number): number {
  return Math.floor(prng() * (max - min + 1)) + min;
}

function randomChoice<T>(items: readonly T[]): T {
  return items[Math.floor(prng() * items.length)];
}

const PRIORITIES: ActivityPriority[] = ['high', 'medium', 'low'];
const ENERGIES: EnergyLevel[] = ['high', 'medium', 'low'];
const OVERFLOW_STRATEGIES: OverflowStrategy[] = [
  'hybrid',
  'drop_low_priority',
  'proportional_scale',
];

// =============================================================================
// Invariant Verification Harness
// =============================================================================
function assertAllInvariants(
  schedule: DaySchedule,
  template: RoutineTemplate,
  options?: { anchorMinute?: number }
): void {
  // ---------------------------------------------------------------------------
  // Invariant 5: Schema Validation Compliance
  // ---------------------------------------------------------------------------
  const validation = validateDaySchedule(schedule);
  expect(validation.isValid).toBe(true);
  expect(validation.errors).toHaveLength(0);
  expect(schedule.date).toBe('2026-11-06');
  expect(schedule.blocks.length).toBeGreaterThanOrEqual(1); // At least bedtime block

  // ---------------------------------------------------------------------------
  // Invariant 1: Strict Chronological Non-Overlap & Duration Integrity
  // ---------------------------------------------------------------------------
  for (let i = 0; i < schedule.blocks.length - 1; i++) {
    const curr = schedule.blocks[i];
    const next = schedule.blocks[i + 1];

    // Non-overlap invariant
    expect(curr.endMinute).toBeLessThanOrEqual(next.startMinute);

    // Duration integrity
    expect(curr.durationMinutes).toBe(curr.endMinute - curr.startMinute);
    expect(curr.durationMinutes).toBeGreaterThan(0);
  }

  const lastBlock = schedule.blocks[schedule.blocks.length - 1];
  expect(lastBlock.durationMinutes).toBe(lastBlock.endMinute - lastBlock.startMinute);
  expect(lastBlock.durationMinutes).toBeGreaterThan(0);

  // ---------------------------------------------------------------------------
  // Invariant 2: Bedtime Barrier Cutoff
  // ---------------------------------------------------------------------------
  const waking = normalizeWakingInterval(template.wakeTime, template.bedtime);

  // Flexible and buffer blocks must not cross bedtime
  for (const block of schedule.blocks) {
    if (block.type === 'flexible' || block.type === 'buffer') {
      expect(block.endMinute).toBeLessThanOrEqual(waking.endMinute);
      expect(block.startMinute).toBeGreaterThanOrEqual(waking.startMinute);
    }
  }

  // Bedtime block must start exactly at bedtime
  const bedtimeBlock = schedule.blocks.find((b) => b.type === 'bedtime');
  expect(bedtimeBlock).toBeDefined();
  expect(bedtimeBlock!.startMinute).toBe(waking.endMinute);
  expect(bedtimeBlock!.startTime).toBe(template.bedtime);
  expect(bedtimeBlock!.endTime).toBe(template.wakeTime);
  expect(bedtimeBlock!.isLocked).toBe(true);

  // ---------------------------------------------------------------------------
  // Invariant 3: Total Time Conservation
  // ---------------------------------------------------------------------------
  if (options?.anchorMinute === undefined) {
    // Standard full-day schedule: waking interval is partitioned without leaks
    expect(schedule.totalScheduledMinutes + schedule.totalFreeMinutes).toBe(waking.duration);

    // Direct sum of block durations equals waking duration (excluding sleep block)
    const sumWakingBlocks = schedule.blocks
      .filter((b) => b.type !== 'bedtime')
      .reduce((sum, b) => sum + b.durationMinutes, 0);
    expect(sumWakingBlocks).toBe(waking.duration);
  } else {
    // Dynamic mid-day re-scheduling: partition of active timeline blocks is consistent
    const sumActiveBlocks = schedule.blocks
      .filter((b) => b.type !== 'bedtime')
      .reduce((sum, b) => sum + b.durationMinutes, 0);
    expect(schedule.totalScheduledMinutes + schedule.totalFreeMinutes).toBe(sumActiveBlocks);
  }

  // ---------------------------------------------------------------------------
  // Invariant 4: Fixed Activity Immutability
  // ---------------------------------------------------------------------------
  for (const fixed of template.fixedActivities) {
    const fixedBlock = schedule.blocks.find((b) => b.activityId === fixed.id);
    expect(fixedBlock).toBeDefined();
    expect(fixedBlock!.type).toBe('fixed');
    expect(fixedBlock!.startTime).toBe(fixed.startTime);
    expect(fixedBlock!.endTime).toBe(fixed.endTime);
    expect(fixedBlock!.isLocked).toBe(true);
    expect(fixedBlock!.title).toBe(fixed.title);
  }

  // ---------------------------------------------------------------------------
  // Auxiliary Invariant: Conservation of Flexible Activities (Slotted or Deferred)
  // ---------------------------------------------------------------------------
  const slottedFlexBlocks = schedule.blocks.filter((b) => b.type === 'flexible');
  const slottedIds = new Set(slottedFlexBlocks.map((b) => b.activityId!));
  const deferredIds = new Set(schedule.deferredActivities.map((d) => d.id));

  // No duplicate slotting of the same flexible activity
  expect(slottedFlexBlocks.length).toBe(slottedIds.size);

  // No activity simultaneously slotted and deferred
  for (const id of slottedIds) {
    expect(deferredIds.has(id)).toBe(false);
  }

  // All template flexible activities accounted for
  if (options?.anchorMinute === undefined) {
    expect(slottedIds.size + deferredIds.size).toBe(template.flexibleActivities.length);
  }
}

// =============================================================================
// Helper: Random Valid Template Generator
// =============================================================================
interface GeneratorConfig {
  wakeMinute: number;
  bedtimeMinute: number;
  fixedCount: number;
  flexibleCount: number;
  bufferMinutes: number;
  overflowStrategy: OverflowStrategy;
  minGapSpacing?: number;
}

function generateValidTemplate(id: string, config: GeneratorConfig): RoutineTemplate {
  const wakeTime = minutesToTime(config.wakeMinute);
  const bedtime = minutesToTime(config.bedtimeMinute);

  // Build non-overlapping fixed activities within [wakeMinute, bedtimeMinute]
  const fixedActivities: FixedActivity[] = [];
  const wakingDuration = config.bedtimeMinute - config.wakeMinute;
  const minSpacing = config.minGapSpacing ?? 10;

  if (config.fixedCount > 0 && wakingDuration > 60) {
    let cursor = config.wakeMinute + randomChoice([0, 5, 10, 15, 30]);

    for (let f = 0; f < config.fixedCount; f++) {
      const remainingTime = config.bedtimeMinute - cursor;
      if (remainingTime < 35) break;

      const actDuration = randomChoice([30, 45, 60, 75, 90, 120]);
      if (cursor + actDuration > config.bedtimeMinute) break;

      const startMin = cursor;
      const endMin = startMin + actDuration;

      fixedActivities.push({
        id: `${id}-fix-${f}`,
        title: `Fixed Event ${f + 1}`,
        startTime: minutesToTime(startMin),
        endTime: minutesToTime(endMin),
        categoryEmoji: randomChoice(['💼', '🎓', '🏋️', '🍽️', '🩺']),
        bufferMinutes: config.bufferMinutes,
        isLocked: true,
      });

      // Spacing before next fixed activity: either contiguous (0m) or spaced (>= 5m)
      const gapChoice = randomChoice([0, 5, 10, 15, 30]);
      cursor = endMin + gapChoice;

      // If remaining gap to bedtime would be between 1 and 4 minutes (< 5 min threshold),
      // adjust cursor so it either directly meets bedtime or leaves >= 5 min.
      const gapToBed = config.bedtimeMinute - cursor;
      if (gapToBed > 0 && gapToBed < 5) {
        cursor = endMin; // Make it contiguous with last fixed block
      }
    }
  }

  // Build flexible activities
  const flexibleActivities: FlexibleActivity[] = [];
  for (let t = 0; t < config.flexibleCount; t++) {
    const estDuration = randomInt(15, 120);
    const minDuration = randomInt(10, estDuration);

    flexibleActivities.push({
      id: `${id}-flex-${t}`,
      title: `Flex Task ${t + 1}`,
      estimatedDuration: estDuration,
      minDuration,
      priority: randomChoice(PRIORITIES),
      energyLevel: randomChoice(ENERGIES),
      categoryEmoji: randomChoice(['⚡', '📖', '💻', '🎨', '🧹']),
    });
  }

  const template: RoutineTemplate = {
    id,
    name: `Template ${id}`,
    assignedDays: ['mon', 'wed', 'fri'],
    wakeTime,
    bedtime,
    defaultBufferMinutes: config.bufferMinutes,
    overflowStrategy: config.overflowStrategy,
    fixedActivities,
    flexibleActivities,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Pre-validate template schema
  const templateValidation = validateRoutineTemplate(template);
  if (!templateValidation.isValid) {
    throw new Error(
      `Generated template failed validation: ${templateValidation.errors
        .map((e) => e.message)
        .join(', ')}`
    );
  }

  return template;
}

// =============================================================================
// Test Suites
// =============================================================================
describe('CHALLENGER 2 — Milestone 2 Mathematical Invariant Verification Suite', () => {
  const TARGET_DATE = '2026-11-06';

  // ===========================================================================
  // CATEGORY A: Daytime Standard Routine Templates (15 Templates)
  // ===========================================================================
  describe('Category A: Standard Daytime Routines (15 templates)', () => {
    const templates: RoutineTemplate[] = [];

    beforeAll(() => {
      for (let i = 1; i <= 15; i++) {
        const wakeHour = randomInt(5, 8);
        const wakeMin = randomChoice([0, 15, 30, 45]);
        const bedHour = randomInt(21, 23);
        const bedMin = randomChoice([0, 15, 30, 45]);

        templates.push(
          generateValidTemplate(`cat-a-${i}`, {
            wakeMinute: wakeHour * 60 + wakeMin,
            bedtimeMinute: bedHour * 60 + bedMin,
            fixedCount: randomInt(0, 4),
            flexibleCount: randomInt(1, 8),
            bufferMinutes: randomChoice([0, 5, 10, 15]),
            overflowStrategy: randomChoice(OVERFLOW_STRATEGIES),
            minGapSpacing: 10,
          })
        );
      }
    });

    it('verifies all 5 mathematical invariants across 15 standard daytime templates', () => {
      expect(templates).toHaveLength(15);
      for (const tmpl of templates) {
        const schedule = calculateSchedule(tmpl, TARGET_DATE);
        assertAllInvariants(schedule, tmpl);
      }
    });
  });

  // ===========================================================================
  // CATEGORY B: Midnight Rollover Bedtimes (15 Templates)
  // Bedtimes extend past midnight into next calendar day (00:00 - 03:00)
  // ===========================================================================
  describe('Category B: Midnight Rollover Bedtimes (15 templates)', () => {
    const templates: RoutineTemplate[] = [];

    beforeAll(() => {
      for (let i = 1; i <= 15; i++) {
        const wakeHour = randomInt(6, 10);
        const wakeMin = randomChoice([0, 15, 30]);
        // Rollover bedtime: 00:00 (1440) to 03:00 (1620)
        const bedRolloverHour = randomInt(0, 3);
        const bedRolloverMin = randomChoice([0, 15, 30]);
        const bedtimeMinute = 1440 + bedRolloverHour * 60 + bedRolloverMin;

        templates.push(
          generateValidTemplate(`cat-b-${i}`, {
            wakeMinute: wakeHour * 60 + wakeMin,
            bedtimeMinute,
            fixedCount: randomInt(1, 4),
            flexibleCount: randomInt(2, 9),
            bufferMinutes: randomChoice([0, 5, 10]),
            overflowStrategy: randomChoice(OVERFLOW_STRATEGIES),
            minGapSpacing: 10,
          })
        );
      }
    });

    it('verifies all 5 invariants with post-midnight bedtime rollover', () => {
      expect(templates).toHaveLength(15);
      for (const tmpl of templates) {
        const schedule = calculateSchedule(tmpl, TARGET_DATE);
        assertAllInvariants(schedule, tmpl);
      }
    });
  });

  // ===========================================================================
  // CATEGORY C: Night Shift Worker Schedules (10 Templates)
  // Wake: Evening (18:00 - 22:00); Bed: Morning/Afternoon (08:00 - 14:00)
  // ===========================================================================
  describe('Category C: Night Shift Worker Schedules (10 templates)', () => {
    const templates: RoutineTemplate[] = [];

    beforeAll(() => {
      for (let i = 1; i <= 10; i++) {
        const wakeHour = randomInt(18, 21);
        const wakeMin = randomChoice([0, 30]);
        // Bed next morning: 06:00 (1800) to 12:00 (2160)
        const bedHour = randomInt(6, 11);
        const bedMin = randomChoice([0, 30]);
        const bedtimeMinute = 1440 + bedHour * 60 + bedMin;

        templates.push(
          generateValidTemplate(`cat-c-${i}`, {
            wakeMinute: wakeHour * 60 + wakeMin,
            bedtimeMinute,
            fixedCount: randomInt(1, 3),
            flexibleCount: randomInt(2, 7),
            bufferMinutes: randomChoice([5, 10]),
            overflowStrategy: randomChoice(OVERFLOW_STRATEGIES),
            minGapSpacing: 15,
          })
        );
      }
    });

    it('verifies invariants on inverted night-shift cycles spanning midnight', () => {
      expect(templates).toHaveLength(10);
      for (const tmpl of templates) {
        const schedule = calculateSchedule(tmpl, TARGET_DATE);
        assertAllInvariants(schedule, tmpl);
      }
    });
  });

  // ===========================================================================
  // CATEGORY D: Extreme Boundary Topologies & Stress Shapes (15 Templates)
  // ===========================================================================
  describe('Category D: Extreme Boundary Topologies (15 templates)', () => {
    it('handles D1: Zero flexible activities (all waking intervals become free or fixed)', () => {
      const tmpl = generateValidTemplate('cat-d-1', {
        wakeMinute: 420, // 07:00
        bedtimeMinute: 1380, // 23:00
        fixedCount: 3,
        flexibleCount: 0,
        bufferMinutes: 5,
        overflowStrategy: 'hybrid',
      });
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
      expect(schedule.deferredActivities).toHaveLength(0);
      expect(schedule.blocks.filter((b) => b.type === 'flexible')).toHaveLength(0);
      expect(schedule.totalFreeMinutes).toBeGreaterThan(0);
    });

    it('handles D2: Zero fixed activities (entire waking window is a single free gap)', () => {
      const tmpl = generateValidTemplate('cat-d-2', {
        wakeMinute: 480, // 08:00
        bedtimeMinute: 1320, // 22:00
        fixedCount: 0,
        flexibleCount: 5,
        bufferMinutes: 10,
        overflowStrategy: 'hybrid',
      });
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
      expect(schedule.blocks.filter((b) => b.type === 'fixed')).toHaveLength(0);
      // First flexible activity starts directly at wake time
      const firstFlex = schedule.blocks.find((b) => b.type === 'flexible');
      expect(firstFlex).toBeDefined();
      expect(firstFlex!.startMinute).toBe(480);
    });

    it('handles D3: 100% Packed Fixed Day (zero free gap space, all flexible deferred)', () => {
      const tmpl: RoutineTemplate = {
        id: 'cat-d-3',
        name: 'All Day Locked',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '20:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          {
            id: 'fix-full-day',
            title: 'Marathon Workshop',
            startTime: '08:00',
            endTime: '20:00',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flex-overflow-1',
            title: 'Gym Session',
            estimatedDuration: 60,
            minDuration: 30,
            priority: 'high',
            energyLevel: 'high',
          },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
      expect(schedule.blocks.filter((b) => b.type === 'flexible')).toHaveLength(0);
      expect(schedule.deferredActivities).toHaveLength(1);
      expect(schedule.totalFreeMinutes).toBe(0);
      expect(schedule.totalScheduledMinutes).toBe(720); // 12 hours
    });

    it('handles D4: Massive Overflow (500% capacity) under drop_low_priority', () => {
      const tmpl = generateValidTemplate('cat-d-4', {
        wakeMinute: 540, // 09:00
        bedtimeMinute: 720, // 12:00 (180 min window)
        fixedCount: 0,
        flexibleCount: 15, // 15 tasks averaging 60m = ~900m into 180m gap
        bufferMinutes: 5,
        overflowStrategy: 'drop_low_priority',
      });
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
      expect(schedule.deferredActivities.length).toBeGreaterThan(0);
    });

    it('handles D5: Massive Overflow under proportional_scale', () => {
      const tmpl = generateValidTemplate('cat-d-5', {
        wakeMinute: 540,
        bedtimeMinute: 780, // 240 min window
        fixedCount: 0,
        flexibleCount: 10,
        bufferMinutes: 0,
        overflowStrategy: 'proportional_scale',
      });
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
    });

    it('handles D6: Zero buffer minutes configuration (defaultBufferMinutes = 0)', () => {
      const tmpl = generateValidTemplate('cat-d-6', {
        wakeMinute: 420,
        bedtimeMinute: 1200,
        fixedCount: 2,
        flexibleCount: 6,
        bufferMinutes: 0,
        overflowStrategy: 'hybrid',
      });
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
      expect(schedule.blocks.filter((b) => b.type === 'buffer')).toHaveLength(0);
    });

    it('handles D7: Large buffer configuration (defaultBufferMinutes = 15)', () => {
      const tmpl = generateValidTemplate('cat-d-7', {
        wakeMinute: 420,
        bedtimeMinute: 1380,
        fixedCount: 2,
        flexibleCount: 4,
        bufferMinutes: 15,
        overflowStrategy: 'hybrid',
      });
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
      const buffers = schedule.blocks.filter((b) => b.type === 'buffer');
      for (const b of buffers) {
        expect(b.durationMinutes).toBeLessThanOrEqual(15);
      }
    });

    it('handles D8: Contiguous Back-to-Back Fixed Activities (gap = 0 minutes)', () => {
      const tmpl: RoutineTemplate = {
        id: 'cat-d-8',
        name: 'Contiguous Back to Back',
        assignedDays: ['tue'],
        wakeTime: '08:00',
        bedtime: '18:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          {
            id: 'fix-1',
            title: 'Meeting 1',
            startTime: '09:00',
            endTime: '11:00',
            isLocked: true,
          },
          {
            id: 'fix-2',
            title: 'Meeting 2 (Directly follows)',
            startTime: '11:00',
            endTime: '13:00',
            isLocked: true,
          },
          {
            id: 'fix-3',
            title: 'Meeting 3 (Directly follows)',
            startTime: '13:00',
            endTime: '15:00',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flex-morning',
            title: 'Morning Email',
            estimatedDuration: 45,
            minDuration: 30,
            priority: 'medium',
            energyLevel: 'medium',
          },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };
      const schedule = calculateSchedule(tmpl, TARGET_DATE);
      assertAllInvariants(schedule, tmpl);
      // Verify contiguous fixed blocks maintain non-overlap
      const f1 = schedule.blocks.find((b) => b.activityId === 'fix-1')!;
      const f2 = schedule.blocks.find((b) => b.activityId === 'fix-2')!;
      const f3 = schedule.blocks.find((b) => b.activityId === 'fix-3')!;
      expect(f1.endMinute).toBe(f2.startMinute);
      expect(f2.endMinute).toBe(f3.startMinute);
    });

    it('handles D9-D15: 7 additional varied stress edge-case templates', () => {
      for (let i = 9; i <= 15; i++) {
        const tmpl = generateValidTemplate(`cat-d-${i}`, {
          wakeMinute: randomInt(360, 540),
          bedtimeMinute: randomInt(1260, 1440),
          fixedCount: randomInt(1, 4),
          flexibleCount: randomInt(1, 10),
          bufferMinutes: randomChoice([0, 5, 10]),
          overflowStrategy: randomChoice(OVERFLOW_STRATEGIES),
          minGapSpacing: 10,
        });
        const schedule = calculateSchedule(tmpl, TARGET_DATE);
        assertAllInvariants(schedule, tmpl);
      }
    });
  });

  // ===========================================================================
  // CATEGORY E: Dynamic Mid-Day Re-scheduling Invariants (10 Templates)
  // Tests past block preservation and anchor boundaries
  // ===========================================================================
  describe('Category E: Dynamic Mid-Day Re-scheduling Invariants (10 templates)', () => {
    it('verifies non-overlap and barrier invariants across 10 dynamic mid-day anchor scenarios', () => {
      for (let i = 1; i <= 10; i++) {
        const wakeMinute = 420; // 07:00
        const bedtimeMinute = 1380; // 23:00

        const tmpl = generateValidTemplate(`cat-e-${i}`, {
          wakeMinute,
          bedtimeMinute,
          fixedCount: 2,
          flexibleCount: 5,
          bufferMinutes: 5,
          overflowStrategy: 'hybrid',
          minGapSpacing: 15,
        });

        // First initial full-day schedule
        const initialSchedule = calculateSchedule(tmpl, TARGET_DATE);

        // Pick an anchor point throughout the day (e.g. 10:00, 13:30, 16:00, 21:00)
        const anchorMinute = randomInt(540, 1300);

        // Mark blocks before anchor as completed
        const pastBlocks: ScheduledBlock[] = initialSchedule.blocks
          .filter((b) => b.endMinute <= anchorMinute && b.type !== 'bedtime')
          .map((b) => ({ ...b, isCompleted: true }));

        const rescheduled = calculateSchedule(tmpl, TARGET_DATE, {
          anchorMinute,
          existingBlocks: pastBlocks,
        });

        assertAllInvariants(rescheduled, tmpl, { anchorMinute });

        // Verify completed past blocks were preserved
        for (const past of pastBlocks) {
          const found = rescheduled.blocks.find(
            (b) => b.id === past.id || (b.activityId && b.activityId === past.activityId)
          );
          expect(found).toBeDefined();
          expect(found!.isCompleted).toBe(true);
        }

        // Verify no NEW flexible blocks were scheduled before anchorMinute
        const futureFlex = rescheduled.blocks.filter(
          (b) => b.type === 'flexible' && !b.isCompleted
        );
        for (const flex of futureFlex) {
          expect(flex.startMinute).toBeGreaterThanOrEqual(anchorMinute);
        }
      }
    });
  });

  // ===========================================================================
  // CATEGORY F: Pure Functional Determinism & Idempotency
  // ===========================================================================
  describe('Category F: Pure Functional Determinism & Idempotency', () => {
    it('guarantees identical schedule outputs across repeated independent invocations', () => {
      const tmpl = generateValidTemplate('cat-f-determinism', {
        wakeMinute: 450,
        bedtimeMinute: 1410,
        fixedCount: 3,
        flexibleCount: 6,
        bufferMinutes: 5,
        overflowStrategy: 'hybrid',
        minGapSpacing: 10,
      });

      const run1 = calculateSchedule(tmpl, TARGET_DATE);
      const run2 = calculateSchedule(tmpl, TARGET_DATE);

      expect(run1.totalScheduledMinutes).toBe(run2.totalScheduledMinutes);
      expect(run1.totalFreeMinutes).toBe(run2.totalFreeMinutes);
      expect(run1.blocks.length).toBe(run2.blocks.length);

      for (let i = 0; i < run1.blocks.length; i++) {
        const b1 = run1.blocks[i];
        const b2 = run2.blocks[i];
        expect(b1.startMinute).toBe(b2.startMinute);
        expect(b1.endMinute).toBe(b2.endMinute);
        expect(b1.type).toBe(b2.type);
        expect(b1.title).toBe(b2.title);
        expect(b1.durationMinutes).toBe(b2.durationMinutes);
      }
    });
  });

  // ===========================================================================
  // CATEGORY G: Adversarial Gap Boundary Probes (< 5 min gaps)
  // ===========================================================================
  describe('Category G: Adversarial Gap Boundary Probes (Sub-5-minute gaps)', () => {
    it('demonstrates behavior of sub-5-minute gaps under default threshold vs minGapThresholdMinutes: 1', () => {
      // Waking window 08:00 (480) to 12:00 (720) = 240m
      // Fixed 1: 08:00 - 09:00 (480 - 540)
      // Fixed 2: 09:03 - 10:00 (543 - 600) -> 3-minute gap between 540 and 543!
      // Fixed 3: 10:00 - 12:00 (600 - 720)
      const sub5mTemplate: RoutineTemplate = {
        id: 'cat-g-sub5m',
        name: 'Sub-5m Gap Template',
        assignedDays: ['mon'],
        wakeTime: '08:00',
        bedtime: '12:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          {
            id: 'fix-1',
            title: 'Meeting 1',
            startTime: '08:00',
            endTime: '09:00',
            isLocked: true,
          },
          {
            id: 'fix-2',
            title: 'Meeting 2',
            startTime: '09:03',
            endTime: '10:00',
            isLocked: true,
          },
          {
            id: 'fix-3',
            title: 'Meeting 3',
            startTime: '10:00',
            endTime: '12:00',
            isLocked: true,
          },
        ],
        flexibleActivities: [],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      // 1. Under default options: threshold is 5m, so 3m gap is dropped from available gaps
      const scheduleDefault = calculateSchedule(sub5mTemplate, TARGET_DATE);
      expect(validateDaySchedule(scheduleDefault).isValid).toBe(true);
      // Non-overlap holds
      for (let i = 0; i < scheduleDefault.blocks.length - 1; i++) {
        expect(scheduleDefault.blocks[i].endMinute).toBeLessThanOrEqual(
          scheduleDefault.blocks[i + 1].startMinute
        );
      }
      // With Defect 3 remediated, totalScheduled + totalFree conserves 100% of waking time (240m)
      expect(
        scheduleDefault.totalScheduledMinutes + scheduleDefault.totalFreeMinutes
      ).toBe(240);
      const free3mDefault = scheduleDefault.blocks.find(
        (b) => b.type === 'free' && b.startMinute === 540 && b.endMinute === 543
      );
      expect(free3mDefault).toBeDefined();
      expect(free3mDefault?.durationMinutes).toBe(3);

      // 2. Under minGapThresholdMinutes: 1, 100% time conservation holds!
      const scheduleWith1m = calculateSchedule(sub5mTemplate, TARGET_DATE, {
        minGapThresholdMinutes: 1,
      });
      expect(validateDaySchedule(scheduleWith1m).isValid).toBe(true);
      expect(
        scheduleWith1m.totalScheduledMinutes + scheduleWith1m.totalFreeMinutes
      ).toBe(240);
      const free3m = scheduleWith1m.blocks.find(
        (b) => b.type === 'free' && b.startMinute === 540 && b.endMinute === 543
      );
      expect(free3m).toBeDefined();
      expect(free3m?.durationMinutes).toBe(3);
    });
  });

  // ===========================================================================
  // CATEGORY H: Energy Level Direction & Bedtime Buffer Suppression
  // ===========================================================================
  describe('Category H: Energy Level Direction & Bedtime Buffer Suppression', () => {
    it('verifies high energy prefers morning gaps while low energy prefers evening gaps', () => {
      // Two gaps: Morning (08:00 - 09:30 = 90m) and Evening (20:00 - 21:30 = 90m)
      // Fixed block in middle: 09:30 - 20:00
      const energyTemplate: RoutineTemplate = {
        id: 'cat-h-energy',
        name: 'Energy Distribution Test',
        assignedDays: ['wed'],
        wakeTime: '08:00',
        bedtime: '21:30',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          {
            id: 'fix-midday',
            title: 'All Day Work',
            startTime: '09:30',
            endTime: '20:00',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flex-high-energy',
            title: 'Hard Deep Work',
            estimatedDuration: 60,
            minDuration: 30,
            priority: 'high',
            energyLevel: 'high',
          },
          {
            id: 'flex-low-energy',
            title: 'Evening Journaling',
            estimatedDuration: 60,
            minDuration: 30,
            priority: 'high',
            energyLevel: 'low',
          },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(energyTemplate, TARGET_DATE);
      assertAllInvariants(schedule, energyTemplate);

      const highBlock = schedule.blocks.find((b) => b.activityId === 'flex-high-energy')!;
      const lowBlock = schedule.blocks.find((b) => b.activityId === 'flex-low-energy')!;

      expect(highBlock).toBeDefined();
      expect(lowBlock).toBeDefined();
      // High energy task placed in morning gap (starts at 08:00 / 480)
      expect(highBlock.startMinute).toBe(480);
      // Low energy task placed in evening gap (starts at 20:00 / 1200)
      expect(lowBlock.startMinute).toBe(1200);
    });

    it('verifies that when flexible task ends exactly at bedtime, NO buffer is injected past bedtime', () => {
      const bedtimeFitTemplate: RoutineTemplate = {
        id: 'cat-h-bedtime-fit',
        name: 'Bedtime Fit Template',
        assignedDays: ['thu'],
        wakeTime: '08:00',
        bedtime: '22:00',
        defaultBufferMinutes: 10,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          {
            id: 'fix-until-21',
            title: 'Day Office',
            startTime: '08:00',
            endTime: '21:00',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flex-60m',
            title: 'Final 60m Read',
            estimatedDuration: 60, // Exactly consumes remaining 21:00 to 22:00 (60m)
            minDuration: 60,
            priority: 'high',
            energyLevel: 'low',
          },
        ],
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      };

      const schedule = calculateSchedule(bedtimeFitTemplate, TARGET_DATE);
      assertAllInvariants(schedule, bedtimeFitTemplate);

      const flexBlock = schedule.blocks.find((b) => b.activityId === 'flex-60m')!;
      expect(flexBlock.endMinute).toBe(1320); // Exactly 22:00 bedtime
      // There must be ZERO buffer blocks between 22:00 and beyond
      const invalidBuffers = schedule.blocks.filter(
        (b) => b.type === 'buffer' && b.startMinute >= 1320
      );
      expect(invalidBuffers).toHaveLength(0);
    });
  });

  // ===========================================================================
  // CATEGORY I: Rapid Multi-Template Stress Execution
  // ===========================================================================
  describe('Category I: Rapid Multi-Template Stress Execution', () => {
    it('executes 50 consecutive random schedule calculations rapidly with zero invariant leaks', () => {
      for (let iter = 1; iter <= 50; iter++) {
        const wakeMin = randomInt(300, 540); // 05:00 - 09:00
        const bedMin = randomInt(1260, 1500); // 21:00 - 01:00 rollover
        const tmpl = generateValidTemplate(`rapid-${iter}`, {
          wakeMinute: wakeMin,
          bedtimeMinute: bedMin,
          fixedCount: randomInt(0, 3),
          flexibleCount: randomInt(1, 6),
          bufferMinutes: randomChoice([0, 5, 10]),
          overflowStrategy: randomChoice(OVERFLOW_STRATEGIES),
          minGapSpacing: 10,
        });

        const sched = calculateSchedule(tmpl, TARGET_DATE);
        assertAllInvariants(sched, tmpl);
      }
    });
  });

  // ===========================================================================
  // CATEGORY J: Empirical Vulnerability Probe — Anchor Past Bedtime
  // ===========================================================================
  describe('Category J: Empirical Invariant Vulnerability Probe (Anchor Past Bedtime)', () => {
    it('probes anchorMinute >= bedtime when existingBlocks containing bedtimeBlock is provided', () => {
      const tmpl = generateValidTemplate('cat-j-probe', {
        wakeMinute: 420, // 07:00
        bedtimeMinute: 1380, // 23:00
        fixedCount: 2,
        flexibleCount: 4,
        bufferMinutes: 5,
        overflowStrategy: 'hybrid',
        minGapSpacing: 10,
      });

      const initialSchedule = calculateSchedule(tmpl, TARGET_DATE);
      expect(initialSchedule.blocks.filter((b) => b.type === 'bedtime')).toHaveLength(1);

      // Re-schedule when clock is past bedtime (e.g. 23:30 / minute 1410 >= 1380)
      const lateSchedule = calculateSchedule(tmpl, TARGET_DATE, {
        anchorMinute: 1410,
        existingBlocks: initialSchedule.blocks,
      });

      // Mathematical Invariant: Schedule must have exactly 1 bedtime block
      const bedtimeBlocks = lateSchedule.blocks.filter((b) => b.type === 'bedtime');
      expect(bedtimeBlocks).toHaveLength(1);

      // Mathematical Invariant: Must pass validateDaySchedule without block overlaps
      const validation = validateDaySchedule(lateSchedule);
      expect(validation.isValid).toBe(true);
    });
  });
});


