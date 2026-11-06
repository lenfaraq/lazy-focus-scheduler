/**
 * Schema Validation Utilities
 * Zero server dependencies, pure functional deterministic validation.
 */

import {
  FixedActivity,
  FlexibleActivity,
  RoutineTemplate,
  DaySchedule,
  ValidationResult,
  ValidationError,
} from '../types';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates 24-hr time format "HH:mm".
 */
export function validateTimeFormat(time: string): boolean {
  return typeof time === 'string' && TIME_REGEX.test(time);
}

/**
 * Converts "HH:mm" time string to linear minutes from midnight (0..1439).
 */
export function timeToMinutes(time: string): number {
  if (!validateTimeFormat(time)) {
    throw new Error(`Invalid time format: "${time}". Expected "HH:mm".`);
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
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
    const intervals: { start: number; end: number }[] = [{ start: s, end: 1440 }];
    if (e > 0) {
      intervals.push({ start: 0, end: e });
    }
    return intervals;
  } else {
    // s === e: 24-hour continuous interval
    return [{ start: 0, end: 1440 }];
  }
}

/**
 * Validates a FixedActivity model.
 */
export function validateFixedActivity(activity: FixedActivity): ValidationResult {
  const errors: ValidationError[] = [];

  if (!activity.title || activity.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Activity title cannot be empty', code: 'EMPTY_TITLE' });
  }

  if (!validateTimeFormat(activity.startTime)) {
    errors.push({ field: 'startTime', message: 'Invalid start time format (expected HH:mm)', code: 'INVALID_START_TIME' });
  }

  if (!validateTimeFormat(activity.endTime)) {
    errors.push({ field: 'endTime', message: 'Invalid end time format (expected HH:mm)', code: 'INVALID_END_TIME' });
  }

  if (
    activity.bufferMinutes !== undefined &&
    (typeof activity.bufferMinutes !== 'number' ||
      !Number.isInteger(activity.bufferMinutes) ||
      activity.bufferMinutes < 0 ||
      activity.bufferMinutes >= 1440)
  ) {
    errors.push({
      field: 'bufferMinutes',
      message: 'Buffer minutes must be a non-negative integer less than 1440',
      code: 'INVALID_BUFFER',
    });
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validates a FlexibleActivity model.
 */
export function validateFlexibleActivity(activity: FlexibleActivity): ValidationResult {
  const errors: ValidationError[] = [];

  if (!activity.title || activity.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Activity title cannot be empty', code: 'EMPTY_TITLE' });
  }

  if (!Number.isInteger(activity.estimatedDuration) || activity.estimatedDuration <= 0) {
    errors.push({ field: 'estimatedDuration', message: 'Estimated duration must be positive minutes', code: 'INVALID_ESTIMATED_DURATION' });
  }

  if (!Number.isInteger(activity.minDuration) || activity.minDuration <= 0) {
    errors.push({ field: 'minDuration', message: 'Minimum duration must be positive minutes', code: 'INVALID_MIN_DURATION' });
  }

  if (activity.minDuration > activity.estimatedDuration) {
    errors.push({ field: 'minDuration', message: 'Minimum duration cannot exceed estimated duration', code: 'MIN_DURATION_EXCEEDS_ESTIMATED' });
  }

  if (!['high', 'medium', 'low'].includes(activity.priority)) {
    errors.push({ field: 'priority', message: 'Priority must be high, medium, or low', code: 'INVALID_PRIORITY' });
  }

  if (!['high', 'medium', 'low'].includes(activity.energyLevel)) {
    errors.push({ field: 'energyLevel', message: 'Energy level must be high, medium, or low', code: 'INVALID_ENERGY' });
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validates a RoutineTemplate model.
 */
export function validateRoutineTemplate(template: RoutineTemplate): ValidationResult {
  const errors: ValidationError[] = [];

  if (!template.name || template.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Template name cannot be empty', code: 'EMPTY_NAME' });
  }

  if (!validateTimeFormat(template.wakeTime)) {
    errors.push({ field: 'wakeTime', message: 'Invalid wake time format (expected HH:mm)', code: 'INVALID_WAKE_TIME' });
  }

  if (!validateTimeFormat(template.bedtime)) {
    errors.push({ field: 'bedtime', message: 'Invalid bedtime format (expected HH:mm)', code: 'INVALID_BEDTIME' });
  }

  if (validateTimeFormat(template.wakeTime) && validateTimeFormat(template.bedtime)) {
    if (template.wakeTime === template.bedtime) {
      errors.push({ field: 'bedtime', message: 'Bedtime cannot equal wake time (zero waking window)', code: 'ZERO_WAKING_WINDOW' });
    }
  }

  // Validate defaultBufferMinutes
  if (
    typeof template.defaultBufferMinutes !== 'number' ||
    !Number.isInteger(template.defaultBufferMinutes) ||
    template.defaultBufferMinutes < 0 ||
    template.defaultBufferMinutes >= 1440
  ) {
    errors.push({
      field: 'defaultBufferMinutes',
      message: 'Default buffer minutes must be a non-negative integer less than 1440',
      code: 'INVALID_BUFFER',
    });
  }

  // Validate overflowStrategy
  const VALID_OVERFLOW_STRATEGIES = ['hybrid', 'drop_low_priority', 'proportional_scale'];
  if (!template.overflowStrategy || !VALID_OVERFLOW_STRATEGIES.includes(template.overflowStrategy)) {
    errors.push({
      field: 'overflowStrategy',
      message: 'Overflow strategy must be hybrid, drop_low_priority, or proportional_scale',
      code: 'INVALID_OVERFLOW_STRATEGY',
    });
  }

  // Validate assignedDays
  const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  if (!Array.isArray(template.assignedDays)) {
    errors.push({
      field: 'assignedDays',
      message: 'Assigned days must be an array',
      code: 'INVALID_ASSIGNED_DAYS',
    });
  } else {
    const invalidDays = template.assignedDays.filter((d) => !VALID_DAYS.includes(d));
    if (invalidDays.length > 0) {
      errors.push({
        field: 'assignedDays',
        message: `Invalid day(s) of week: ${invalidDays.join(', ')}`,
        code: 'INVALID_DAY_OF_WEEK',
      });
    }
  }

  // Validate fixed activities
  if (!Array.isArray(template.fixedActivities)) {
    errors.push({
      field: 'fixedActivities',
      message: 'Fixed activities must be an array',
      code: 'INVALID_FIXED_ACTIVITIES',
    });
  } else {
    template.fixedActivities.forEach((fixed, index) => {
      const res = validateFixedActivity(fixed);
      if (!res.isValid) {
        errors.push(...res.errors.map(err => ({ ...err, field: `fixedActivities[${index}].${err.field}` })));
      }
    });

    // Check for overlapping fixed activities across circular 24-hour cycle
    const n = template.fixedActivities.length;
    for (let i = 0; i < n; i++) {
      const actA = template.fixedActivities[i];
      if (!validateTimeFormat(actA.startTime) || !validateTimeFormat(actA.endTime)) continue;
      const intervalsA = getFixedActivityIntervals(actA.startTime, actA.endTime);

      for (let j = i + 1; j < n; j++) {
        const actB = template.fixedActivities[j];
        if (!validateTimeFormat(actB.startTime) || !validateTimeFormat(actB.endTime)) continue;
        const intervalsB = getFixedActivityIntervals(actB.startTime, actB.endTime);

        let overlaps = false;
        for (const intA of intervalsA) {
          for (const intB of intervalsB) {
            if (Math.max(intA.start, intB.start) < Math.min(intA.end, intB.end)) {
              overlaps = true;
              break;
            }
          }
          if (overlaps) break;
        }

        if (overlaps) {
          errors.push({
            field: 'fixedActivities',
            message: `Overlapping fixed activities: "${actA.title}" conflicts with "${actB.title}"`,
            code: 'OVERLAPPING_FIXED_ACTIVITIES',
          });
        }
      }
    }
  }

  // Validate flexible activities
  if (!Array.isArray(template.flexibleActivities)) {
    errors.push({
      field: 'flexibleActivities',
      message: 'Flexible activities must be an array',
      code: 'INVALID_FLEXIBLE_ACTIVITIES',
    });
  } else {
    template.flexibleActivities.forEach((flex, index) => {
      const res = validateFlexibleActivity(flex);
      if (!res.isValid) {
        errors.push(...res.errors.map(err => ({ ...err, field: `flexibleActivities[${index}].${err.field}` })));
      }
    });
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validates a DaySchedule model.
 */
export function validateDaySchedule(schedule: DaySchedule): ValidationResult {
  const errors: ValidationError[] = [];

  if (!schedule.date || !DATE_REGEX.test(schedule.date)) {
    errors.push({ field: 'date', message: 'Invalid date format (expected YYYY-MM-DD)', code: 'INVALID_DATE' });
  }

  if (!validateTimeFormat(schedule.wakeTime)) {
    errors.push({ field: 'wakeTime', message: 'Invalid wake time format', code: 'INVALID_WAKE_TIME' });
  }

  if (!validateTimeFormat(schedule.bedtime)) {
    errors.push({ field: 'bedtime', message: 'Invalid bedtime format', code: 'INVALID_BEDTIME' });
  }

  // Verify chronological ordering of blocks
  if (Array.isArray(schedule.blocks)) {
    for (let i = 0; i < schedule.blocks.length - 1; i++) {
      const curr = schedule.blocks[i];
      const next = schedule.blocks[i + 1];
      if (curr.endMinute > next.startMinute) {
        errors.push({
          field: 'blocks',
          message: `Overlapping schedule blocks: "${curr.title}" (${curr.endMinute}) overlaps with "${next.title}" (${next.startMinute})`,
          code: 'OVERLAPPING_SCHEDULE_BLOCKS',
        });
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
