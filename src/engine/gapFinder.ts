/**
 * Lazy Focus & Smart Routine Scheduler
 * Free Gap Calculation Engine
 *
 * Scans waking intervals around anchored locked fixed activities to identify
 * all available free time intervals, strictly enforcing bedtime cutoff boundaries
 * and filtering out negligible gaps smaller than the configured threshold.
 */

import { Interval, minutesToTime } from './timeUtils';
import { ScheduledBlock } from '../types';

export interface GapInterval {
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  startTime?: string; // "HH:mm" 24-hr formatted string
  endTime?: string;   // "HH:mm" 24-hr formatted string
}

export const DEFAULT_MIN_GAP_THRESHOLD = 5; // Negligible gap threshold in minutes

/**
 * Extracts all available free time intervals within a waking window that are not
 * occupied by locked fixed activities.
 *
 * Behavior:
 * 1. Validates that wakingInterval is non-empty (startMinute < endMinute).
 * 2. Clamps all fixed blocks to the waking interval boundaries [wakingStart, wakingEnd].
 * 3. Sorts and merges overlapping/contiguous fixed obstacles to guarantee monotonic cursor scanning.
 * 4. Extracts intervals between cursor and fixed obstacles.
 * 5. Extracts final trailing gap up to strict bedtime cutoff.
 * 6. Filters out any gaps smaller than minGapThreshold (default 5 min).
 */
export function findGaps(
  wakingInterval: Interval,
  fixedBlocks: ScheduledBlock[],
  minGapThreshold: number = DEFAULT_MIN_GAP_THRESHOLD
): GapInterval[] {
  if (wakingInterval.startMinute >= wakingInterval.endMinute) {
    throw new Error(
      `Invalid waking interval: startMinute (${wakingInterval.startMinute}) must be strictly less than endMinute (${wakingInterval.endMinute}).`
    );
  }

  const threshold = Math.max(1, minGapThreshold);

  // 1. Filter and clamp blocks to waking interval boundaries
  const clampedIntervals: Interval[] = [];
  for (const block of fixedBlocks) {
    // Ignore blocks entirely outside the waking window
    if (block.endMinute <= wakingInterval.startMinute || block.startMinute >= wakingInterval.endMinute) {
      continue;
    }

    const start = Math.max(wakingInterval.startMinute, block.startMinute);
    const end = Math.min(wakingInterval.endMinute, block.endMinute);

    if (end > start) {
      clampedIntervals.push({ startMinute: start, endMinute: end });
    }
  }

  // 2. Sort intervals chronologically
  clampedIntervals.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  // 3. Merge overlapping or contiguous occupied intervals
  const mergedOccupied: Interval[] = [];
  for (const interval of clampedIntervals) {
    if (mergedOccupied.length === 0) {
      mergedOccupied.push({ ...interval });
    } else {
      const last = mergedOccupied[mergedOccupied.length - 1];
      if (interval.startMinute <= last.endMinute) {
        last.endMinute = Math.max(last.endMinute, interval.endMinute);
      } else {
        mergedOccupied.push({ ...interval });
      }
    }
  }

  // 4. Extract free gaps between waking start, occupied intervals, and bedtime cutoff
  const gaps: GapInterval[] = [];
  let cursor = wakingInterval.startMinute;

  for (const occupied of mergedOccupied) {
    if (occupied.startMinute > cursor) {
      const duration = occupied.startMinute - cursor;
      if (duration >= threshold) {
        gaps.push({
          startMinute: cursor,
          endMinute: occupied.startMinute,
          durationMinutes: duration,
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(occupied.startMinute),
        });
      }
    }
    cursor = Math.max(cursor, occupied.endMinute);
  }

  // 5. Final gap to bedtime cutoff
  if (wakingInterval.endMinute > cursor) {
    const trailingDuration = wakingInterval.endMinute - cursor;
    if (trailingDuration >= threshold) {
      gaps.push({
        startMinute: cursor,
        endMinute: wakingInterval.endMinute,
        durationMinutes: trailingDuration,
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(wakingInterval.endMinute),
      });
    }
  }

  return gaps;
}

/**
 * Calculates total available free time across an array of gaps.
 */
export function calculateTotalGapMinutes(gaps: GapInterval[]): number {
  return gaps.reduce((acc, gap) => acc + gap.durationMinutes, 0);
}

/**
 * Returns the gap with the maximum duration, or null if no gaps exist.
 */
export function findLargestGap(gaps: GapInterval[]): GapInterval | null {
  if (gaps.length === 0) return null;
  return gaps.reduce((max, g) => (g.durationMinutes > max.durationMinutes ? g : max), gaps[0]);
}

/**
 * Returns the gap with the minimum duration, or null if no gaps exist.
 */
export function findSmallestGap(gaps: GapInterval[]): GapInterval | null {
  if (gaps.length === 0) return null;
  return gaps.reduce((min, g) => (g.durationMinutes < min.durationMinutes ? g : min), gaps[0]);
}

/**
 * First-Fit gap locator: finds the first gap capable of accommodating neededMinutes.
 */
export function findGapForDuration(gaps: GapInterval[], neededMinutes: number): GapInterval | null {
  return gaps.find((g) => g.durationMinutes >= neededMinutes) || null;
}
