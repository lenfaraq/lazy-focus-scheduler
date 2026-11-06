/**
 * Lazy Focus & Smart Routine Scheduler
 * Time Normalization & Coordinate Utilities
 *
 * Deterministic integer minute arithmetic (0..1439+), 24-hr bidirectional
 * time string conversion, midnight rollover normalization, interval containment,
 * and duration formatting.
 */

export interface Interval {
  startMinute: number;
  endMinute: number;
}

export interface WakingInterval extends Interval {
  duration: number;
  isRollover?: boolean;
}

export const MINUTES_IN_DAY = 1440;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validates whether a string conforms strictly to 24-hr "HH:mm" format (00:00 to 23:59).
 */
export function validateTimeFormat(time: string): boolean {
  return typeof time === 'string' && TIME_REGEX.test(time);
}

/**
 * Converts a 24-hr "HH:mm" string to linear minutes from midnight (0..1439).
 * Throws a descriptive Error if the format is invalid.
 */
export function timeToMinutes(time: string): number {
  if (!validateTimeFormat(time)) {
    throw new Error(`Invalid time format: "${time}". Expected "HH:mm" (00:00 - 23:59).`);
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Normalizes any integer minute value into standard circular 24-hr range [0, 1439].
 * Correctly resolves minutes >= 1440 (rollover) and negative minutes using circular modulo.
 */
export function normalizeMinute(minute: number): number {
  if (typeof minute !== 'number' || !Number.isFinite(minute)) {
    throw new TypeError(`Invalid minute value: must be a finite number, received: ${minute}`);
  }
  return ((Math.floor(minute) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
}

/**
 * Converts linear minutes into a zero-padded 24-hr "HH:mm" string.
 * Supports minutes >= 1440 (normalized to 24-hr clock modulo 1440) and negative minutes.
 */
export function minutesToTime(minutes: number): string {
  const normalized = normalizeMinute(minutes);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Normalizes wake time and bedtime into a continuous linear interval [startMinute, endMinute].
 * If bedtime is less than or equal to wake time:
 * - If wakeTime === bedtime, throws Error('ZERO_WAKING_WINDOW: Bedtime cannot equal wake time (zero waking window).')
 * - If bedtime < wakeTime, it spans past midnight (rollover) and endMinute is normalized to (1440 + bedtimeMinutes).
 *
 * Example:
 *   normalizeWakingInterval("08:00", "01:30") => { startMinute: 480, endMinute: 1530, duration: 1050 }
 */
export function normalizeWakingInterval(wakeTime: string, bedtime: string): WakingInterval {
  const startMinute = timeToMinutes(wakeTime);
  const rawBedMinute = timeToMinutes(bedtime);

  if (startMinute === rawBedMinute) {
    throw new Error('ZERO_WAKING_WINDOW: Bedtime cannot equal wake time (zero waking window).');
  }

  let endMinute: number;
  let isRollover = false;

  if (rawBedMinute > startMinute) {
    // Normal waking interval within same calendar day
    endMinute = rawBedMinute;
  } else {
    // Bedtime extends past midnight into next calendar day
    endMinute = MINUTES_IN_DAY + rawBedMinute;
    isRollover = true;
  }

  const duration = endMinute - startMinute;

  return {
    startMinute,
    endMinute,
    duration,
    ...(isRollover ? { isRollover: true } : {}),
  };
}

/**
 * Tests whether timeMinute falls within [startMinute, endMinute).
 * Handles both linear coordinates and 24-hr circular wrap-around when interval spans midnight (endMinute > 1440).
 */
export function isTimeInInterval(
  timeMinute: number,
  startMinute: number,
  endMinute: number,
  inclusiveEnd: boolean = false
): boolean {
  if (startMinute >= endMinute) {
    return false;
  }

  // 1. Direct check in linear coordinates
  const inDirect = inclusiveEnd
    ? timeMinute >= startMinute && timeMinute <= endMinute
    : timeMinute >= startMinute && timeMinute < endMinute;

  if (inDirect) {
    return true;
  }

  // 2. Rollover check: if interval extends past midnight and timeMinute is provided as raw 24-hr minute
  if (endMinute > MINUTES_IN_DAY && timeMinute < startMinute) {
    const shiftedMinute = timeMinute + MINUTES_IN_DAY;
    return inclusiveEnd
      ? shiftedMinute >= startMinute && shiftedMinute <= endMinute
      : shiftedMinute >= startMinute && shiftedMinute < endMinute;
  }

  return false;
}

/**
 * Decomposes a fixed activity's 24-hr time span into 1 or 2 linear minute intervals on [0, 1440).
 */
export function getFixedActivityIntervals(
  startTime: string,
  endTime: string
): { start: number; end: number }[] {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (s < e) {
    return [{ start: s, end: e }];
  } else if (s > e) {
    const intervals: { start: number; end: number }[] = [{ start: s, end: MINUTES_IN_DAY }];
    if (e > 0) {
      intervals.push({ start: 0, end: e });
    }
    return intervals;
  } else {
    // s === e: 24-hour continuous interval
    return [{ start: 0, end: MINUTES_IN_DAY }];
  }
}

/**
 * Maps a 24-hr fixed activity's start and end times into continuous linear waking coordinates [wakingStart, wakingEnd].
 */
export function normalizeActivityToWakingInterval(
  startTime: string,
  endTime: string,
  wakingStart: number,
  wakingEnd: number
): Interval {
  const rawStart = timeToMinutes(startTime);
  const rawEnd = timeToMinutes(endTime);

  let startMinute = rawStart;
  let endMinute = rawEnd;

  // If activity starts after midnight in an overnight waking day (e.g. wakingStart = 480, rawStart = 60, wakingEnd = 1530)
  if (wakingEnd > MINUTES_IN_DAY && rawStart < wakingStart) {
    startMinute += MINUTES_IN_DAY;
    endMinute += MINUTES_IN_DAY;
  } else if (rawEnd < rawStart) {
    // Activity itself crosses midnight (e.g. 23:00 to 01:00)
    endMinute += MINUTES_IN_DAY;
  } else if (rawEnd === rawStart) {
    // 24-hr continuous block
    endMinute = startMinute + MINUTES_IN_DAY;
  }

  return { startMinute, endMinute };
}

/**
 * Checks whether two half-open intervals [a.start, a.end) and [b.start, b.end) overlap.
 */
export function doIntervalsOverlap(a: Interval, b: Interval): boolean {
  return Math.max(a.startMinute, b.startMinute) < Math.min(a.endMinute, b.endMinute);
}

/**
 * Clamps minute value between min and max bounds.
 */
export function clampMinute(minute: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, minute));
}

/**
 * Formats duration in minutes into a human-readable string.
 * Format 'short': "0m", "45m", "1h", "1h 15m", "1h 30m" (default)
 * Format 'long':  "0 mins", "1 min", "45 mins", "1 hr", "2 hrs", "1 hr 30 mins"
 */
export function formatDuration(minutes: number, format: 'short' | 'long' = 'short'): string {
  const nonNeg = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(nonNeg / 60);
  const mins = nonNeg % 60;

  if (format === 'long') {
    if (hours === 0) {
      return `${mins} min${mins === 1 ? '' : 's'}`;
    }
    const hrPart = `${hours} hr${hours === 1 ? '' : 's'}`;
    if (mins === 0) {
      return hrPart;
    }
    return `${hrPart} ${mins} min${mins === 1 ? '' : 's'}`;
  }

  // Short format
  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}
