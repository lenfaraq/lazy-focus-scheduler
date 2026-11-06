/**
 * Lazy Focus & Smart Routine Scheduler
 * Master Schedule Calculation Engine
 *
 * Implements:
 * 1. Pure functional deterministic schedule calculation: calculateSchedule(template, targetDate, options).
 * 2. Anchors fixed activities and strict bedtime cutoff.
 * 3. Injects transition buffer padding (5-10 min breaks).
 * 4. Generates unified timeline blocks (fixed, flexible, buffer, bedtime, free).
 * 5. Dynamic mid-day re-scheduling: preserves past blocks, re-slots future gaps after anchorMinute.
 */

import {
  RoutineTemplate,
  DaySchedule,
  ScheduledBlock,
  FixedActivity,
  FlexibleActivity,
} from '../types';
import {
  timeToMinutes,
  minutesToTime,
  normalizeWakingInterval,
} from './timeUtils';
import { findGaps } from './gapFinder';
import { resolveOverflow, SlottedActivityPlan } from './overflowHandler';
import { validateDaySchedule } from '../store/validation';

export interface ScheduleOptions {
  anchorMinute?: number;
  existingBlocks?: ScheduledBlock[];
  minGapThresholdMinutes?: number;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates fixed activities for interval collisions across the linear schedule window.
 */
function validateFixedActivitiesNoOverlap(fixedBlocks: ScheduledBlock[]): void {
  const sorted = [...fixedBlocks].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (curr.endMinute > next.startMinute) {
      throw new Error(
        `OVERLAPPING_FIXED_ACTIVITIES: Overlapping fixed activities detected: "${curr.title}" (${curr.startTime}-${curr.endTime}) conflicts with "${next.title}" (${next.startTime}-${next.endTime}).`
      );
    }
  }
}

/**
 * Converts template FixedActivity items into concrete locked ScheduledBlocks.
 */
function buildFixedBlocks(
  fixedActivities: FixedActivity[],
  wakingStart: number,
  wakingEnd: number
): ScheduledBlock[] {
  return fixedActivities.map((fixed) => {
    let startMin = timeToMinutes(fixed.startTime);
    let endMin = timeToMinutes(fixed.endTime);

    // Midnight rollover handling for fixed activity (e.g. 22:00 to 02:00)
    if (endMin <= startMin) {
      endMin += 1440;
    }

    // Align coordinates if waking start rolled over
    if (wakingEnd > 1440 && startMin < wakingStart && startMin + 1440 <= wakingEnd) {
      startMin += 1440;
      endMin += 1440;
    }

    return {
      id: `block-fixed-${fixed.id}`,
      activityId: fixed.id,
      title: fixed.title,
      categoryEmoji: fixed.categoryEmoji ?? '💼',
      type: 'fixed',
      startTime: fixed.startTime,
      endTime: fixed.endTime,
      startMinute: startMin,
      endMinute: endMin,
      durationMinutes: endMin - startMin,
      isLocked: true,
      isCompleted: false,
    };
  });
}

/**
 * Creates the non-negotiable bedtime boundary block.
 */
function buildBedtimeBlock(
  bedtime: string,
  wakeTime: string,
  bedtimeStartMinute: number,
  wakingDuration: number
): ScheduledBlock {
  const sleepDuration = Math.max(60, 24 * 60 - wakingDuration);
  return {
    id: 'block-bedtime',
    title: 'Bedtime / Sleep',
    categoryEmoji: '🌙',
    type: 'bedtime',
    startTime: bedtime,
    endTime: wakeTime,
    startMinute: bedtimeStartMinute,
    endMinute: bedtimeStartMinute + sleepDuration,
    durationMinutes: sleepDuration,
    isLocked: true,
    isCompleted: false,
  };
}

/**
 * Master Schedule Generation Function
 */
export function calculateSchedule(
  template: RoutineTemplate,
  targetDate: string,
  options?: ScheduleOptions
): DaySchedule {
  if (!targetDate || !DATE_REGEX.test(targetDate)) {
    throw new Error(`Invalid targetDate: "${targetDate}". Expected "YYYY-MM-DD".`);
  }

  const minGapThreshold = options?.minGapThresholdMinutes ?? 5;
  const defaultBuffer = Math.max(0, template.defaultBufferMinutes ?? 5);

  // 1. Calculate linear waking interval [wakeMinute, bedtimeMinute]
  const wakingInterval = normalizeWakingInterval(template.wakeTime, template.bedtime);

  // 2. Build and validate locked fixed activity blocks
  const fixedBlocks = buildFixedBlocks(
    template.fixedActivities || [],
    wakingInterval.startMinute,
    wakingInterval.endMinute
  );
  validateFixedActivitiesNoOverlap(fixedBlocks);

  // Check if any fixed activity starts earlier than wakeTime (EC8: fixed activity outside waking hours)
  const minFixedStart = fixedBlocks.length > 0
    ? Math.min(...fixedBlocks.map((b) => b.startMinute))
    : wakingInterval.startMinute;
  const baseWakingStart = Math.min(wakingInterval.startMinute, minFixedStart);

  // 3. Build strict bedtime block
  const bedtimeBlock = buildBedtimeBlock(
    template.bedtime,
    template.wakeTime,
    wakingInterval.endMinute,
    wakingInterval.duration
  );

  // 4. Mid-day dynamic re-scheduling evaluation
  const preservedPastBlocks: ScheduledBlock[] = [];
  const completedActivityIds = new Set<string>();
  let effectiveWakingStart = baseWakingStart;

  if (typeof options?.anchorMinute === 'number') {
    const anchor = options.anchorMinute;

    if (anchor >= wakingInterval.endMinute) {
      // Past bedtime: day is over, retain existing or default blocks without duplicate bedtime
      const existing = options.existingBlocks ?? fixedBlocks;

      // 1. Deduplicate bedtimeBlock: filter out any existing bedtime block from existing
      const nonBedtimeExisting = existing.filter(
        (b) => b.type !== 'bedtime' && b.id !== 'block-bedtime'
      );
      const sortedBlocks = [...nonBedtimeExisting, bedtimeBlock].sort(
        (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute
      );

      // 2. Identify flexible activities already executed, completed, or scheduled in existing blocks
      const preservedActivityIds = new Set<string>();
      for (const b of nonBedtimeExisting) {
        if (b.activityId && (b.isCompleted || b.type === 'flexible')) {
          preservedActivityIds.add(b.activityId);
        }
      }

      const remainingDeferred = (template.flexibleActivities || []).filter(
        (t) => !preservedActivityIds.has(t.id)
      );

      // 3. Compute schedule totals (scheduled includes fixed, flexible, and buffer; excludes bedtime and free)
      let totalScheduled = 0;
      let totalFree = 0;

      for (const b of sortedBlocks) {
        if (b.type === 'fixed' || b.type === 'flexible' || b.type === 'buffer') {
          totalScheduled += b.durationMinutes;
        } else if (b.type === 'free') {
          totalFree += b.durationMinutes;
        }
      }

      const schedule: DaySchedule = {
        date: targetDate,
        templateId: template.id,
        wakeTime: template.wakeTime,
        bedtime: template.bedtime,
        blocks: sortedBlocks,
        deferredActivities: remainingDeferred,
        totalScheduledMinutes: totalScheduled,
        totalFreeMinutes: totalFree,
        generatedAt: new Date().toISOString(),
      };

      // 4. Validate schedule invariants before returning
      const validation = validateDaySchedule(schedule);
      if (!validation.isValid) {
        const errorMsgs = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
        throw new Error(`Generated schedule failed validation: ${errorMsgs}`);
      }

      return schedule;
    }

    if (options.existingBlocks && options.existingBlocks.length > 0) {
      for (const block of options.existingBlocks) {
        if (block.endMinute <= anchor) {
          preservedPastBlocks.push(block);
          if (block.isCompleted && block.activityId) {
            completedActivityIds.add(block.activityId);
          }
        } else if (block.startMinute <= anchor && block.endMinute > anchor) {
          // Active block in progress
          preservedPastBlocks.push(block);
          if (block.activityId) {
            completedActivityIds.add(block.activityId);
          }
          effectiveWakingStart = Math.max(effectiveWakingStart, block.endMinute);
        }
      }
    }

    effectiveWakingStart = Math.max(effectiveWakingStart, anchor);
  }

  // Filter out flexible tasks already completed in past blocks
  const candidateFlexibleTasks = (template.flexibleActivities || []).filter(
    (t) => !completedActivityIds.has(t.id)
  );

  // 5. Scan available gaps in the remaining waking window
  const searchInterval = {
    startMinute: effectiveWakingStart,
    endMinute: wakingInterval.endMinute,
  };

  // Fixed blocks that intersect future search interval
  const futureFixedBlocks = options?.anchorMinute !== undefined
    ? fixedBlocks.filter((b) => b.endMinute > effectiveWakingStart)
    : fixedBlocks;

  // Scan all unallocated gaps (threshold: 1 min) to guarantee 100% time conservation in timeline
  const allAvailableGaps = searchInterval.startMinute < searchInterval.endMinute
    ? findGaps(searchInterval, futureFixedBlocks, 1)
    : [];

  // Partition into candidate gaps eligible for flexible tasks (>= minGapThreshold)
  // and sub-threshold gaps (< minGapThreshold) preserved as free time
  const candidateGaps = allAvailableGaps.filter(
    (g) => g.durationMinutes >= minGapThreshold
  );
  const subThresholdGaps = allAvailableGaps.filter(
    (g) => g.durationMinutes < minGapThreshold
  );

  const totalGapCapacity = candidateGaps.reduce((sum, g) => sum + g.durationMinutes, 0);

  // 6. Overflow resolution
  const overflowResult = resolveOverflow(
    candidateFlexibleTasks,
    totalGapCapacity,
    template.overflowStrategy || 'hybrid'
  );

  // 7. Slot prioritized tasks into available gaps with energy matching & buffer padding
  const newTimelineBlocks: ScheduledBlock[] = [];
  const deferredActivities: FlexibleActivity[] = [...overflowResult.deferredActivities];

  const unplacedPlans: SlottedActivityPlan[] = [...overflowResult.slottedActivities];

  // Track remaining gap intervals
  interface ActiveGap {
    startMinute: number;
    endMinute: number;
  }
  const mutableGaps: ActiveGap[] = candidateGaps.map((g) => ({
    startMinute: g.startMinute,
    endMinute: g.endMinute,
  }));

  for (const plan of unplacedPlans) {
    const taskDuration = plan.plannedDuration;
    let placed = false;

    // Energy matching gap search direction:
    // Low energy prefers latest/evening gaps; high energy prefers earliest/morning gaps
    const isLowEnergy = plan.activity.energyLevel === 'low';
    const gapIndices = isLowEnergy
      ? Array.from({ length: mutableGaps.length }, (_, i) => mutableGaps.length - 1 - i)
      : Array.from({ length: mutableGaps.length }, (_, i) => i);

    for (const gIdx of gapIndices) {
      const gap = mutableGaps[gIdx];
      const gapRemaining = gap.endMinute - gap.startMinute;

      if (gapRemaining >= taskDuration) {
        // Fits in this gap
        const blockStart = gap.startMinute;
        const blockEnd = blockStart + taskDuration;

        newTimelineBlocks.push({
          id: `block-flex-${plan.activity.id}-${blockStart}`,
          activityId: plan.activity.id,
          title: plan.activity.title,
          categoryEmoji: plan.activity.categoryEmoji ?? '⚡',
          type: 'flexible',
          startTime: minutesToTime(blockStart),
          endTime: minutesToTime(blockEnd),
          startMinute: blockStart,
          endMinute: blockEnd,
          durationMinutes: taskDuration,
          isLocked: false,
          isCompleted: false,
          originalDurationMinutes: plan.originalDuration,
          scaleFactor: plan.scaleFactor,
        });

        gap.startMinute = blockEnd;

        // Insert transition buffer padding if remaining space in gap and not at bedtime cutoff
        const remainingAfterTask = gap.endMinute - gap.startMinute;
        if (defaultBuffer > 0 && remainingAfterTask > 0 && blockEnd < wakingInterval.endMinute) {
          const bufferDuration = Math.min(defaultBuffer, remainingAfterTask);
          const bufferEnd = blockEnd + bufferDuration;

          newTimelineBlocks.push({
            id: `block-buf-${blockEnd}`,
            title: 'Transition Buffer',
            categoryEmoji: '☕',
            type: 'buffer',
            startTime: minutesToTime(blockEnd),
            endTime: minutesToTime(bufferEnd),
            startMinute: blockEnd,
            endMinute: bufferEnd,
            durationMinutes: bufferDuration,
            isLocked: true,
            isCompleted: false,
          });

          gap.startMinute = bufferEnd;
        }

        placed = true;
        break;
      }
    }

    if (!placed) {
      deferredActivities.push(plan.activity);
    }
  }

  // 8. Generate 'free' blocks for remaining unallocated gap spaces and sub-threshold gaps
  const unallocatedGaps: ActiveGap[] = [
    ...mutableGaps,
    ...subThresholdGaps.map((g) => ({ startMinute: g.startMinute, endMinute: g.endMinute })),
  ];

  for (const gap of unallocatedGaps) {
    const freeDuration = gap.endMinute - gap.startMinute;
    if (freeDuration >= 1) {
      newTimelineBlocks.push({
        id: `block-free-${gap.startMinute}`,
        title: 'Free Time',
        categoryEmoji: '✨',
        type: 'free',
        startTime: minutesToTime(gap.startMinute),
        endTime: minutesToTime(gap.endMinute),
        startMinute: gap.startMinute,
        endMinute: gap.endMinute,
        durationMinutes: freeDuration,
        isLocked: false,
        isCompleted: false,
      });
    }
  }

  // 9. Consolidate and sort all timeline blocks
  const allBlocks = [
    ...preservedPastBlocks,
    ...futureFixedBlocks,
    ...newTimelineBlocks,
    bedtimeBlock,
  ].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  // 10. Compute schedule totals (scheduled includes fixed, flexible, and buffer)
  let totalScheduled = 0;
  let totalFree = 0;

  for (const b of allBlocks) {
    if (b.type === 'fixed' || b.type === 'flexible' || b.type === 'buffer') {
      totalScheduled += b.durationMinutes;
    } else if (b.type === 'free') {
      totalFree += b.durationMinutes;
    }
  }

  const schedule: DaySchedule = {
    date: targetDate,
    templateId: template.id,
    wakeTime: template.wakeTime,
    bedtime: template.bedtime,
    blocks: allBlocks,
    deferredActivities,
    totalScheduledMinutes: totalScheduled,
    totalFreeMinutes: totalFree,
    generatedAt: new Date().toISOString(),
  };

  const validation = validateDaySchedule(schedule);
  if (!validation.isValid) {
    const errorMsgs = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`Generated schedule failed validation: ${errorMsgs}`);
  }

  return schedule;
}
