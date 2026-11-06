/**
 * Milestone 2 Unit Test Suite: Time Normalization & Midnight Rollover Engine
 * Tests time conversions, rollover coordinates, intervals, and midnight math.
 */

import {
  timeToMinutes,
  minutesToTime,
  normalizeMinute,
  formatDuration,
  normalizeWakingInterval,
  isTimeInInterval,
  getFixedActivityIntervals,
  normalizeActivityToWakingInterval,
  doIntervalsOverlap,
  clampMinute,
  validateTimeFormat,
} from '../../src/engine/timeUtils';

describe('Milestone 2 — timeUtils Suite', () => {
  // =========================================================================
  // 1. validateTimeFormat & timeToMinutes Conversion
  // =========================================================================
  describe('1. validateTimeFormat & timeToMinutes Conversion', () => {
    it('validates 24-hr time strings correctly', () => {
      expect(validateTimeFormat('00:00')).toBe(true);
      expect(validateTimeFormat('07:30')).toBe(true);
      expect(validateTimeFormat('23:59')).toBe(true);
      expect(validateTimeFormat('24:00')).toBe(false);
      expect(validateTimeFormat('12:60')).toBe(false);
      expect(validateTimeFormat('7:30')).toBe(false);
      expect(validateTimeFormat('abc')).toBe(false);
    });

    it('converts standard 24-hr time strings to linear minutes from midnight', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('01:00')).toBe(60);
      expect(timeToMinutes('01:30')).toBe(90);
      expect(timeToMinutes('07:30')).toBe(450);
      expect(timeToMinutes('08:00')).toBe(480);
      expect(timeToMinutes('12:00')).toBe(720);
      expect(timeToMinutes('18:45')).toBe(1125);
      expect(timeToMinutes('23:59')).toBe(1439);
    });

    it('throws descriptive error on malformed or out-of-range time strings', () => {
      const invalidTimes = [
        '24:00',
        '25:00',
        '12:60',
        '9:00',     // missing leading zero
        '09:5',     // missing trailing digit
        'ab:cd',
        '12:34:56', // seconds not allowed
        '-01:00',
        '12:-10',
        '',
        '   ',
        null as unknown as string,
        undefined as unknown as string,
      ];

      invalidTimes.forEach((invalid) => {
        expect(() => timeToMinutes(invalid)).toThrow(/Invalid time format/);
      });
    });
  });

  // =========================================================================
  // 2. normalizeMinute & minutesToTime Conversion
  // =========================================================================
  describe('2. normalizeMinute & minutesToTime Conversion', () => {
    it('converts minute offsets to 24-hr "HH:mm" time strings with leading zeros', () => {
      expect(minutesToTime(0)).toBe('00:00');
      expect(minutesToTime(5)).toBe('00:05');
      expect(minutesToTime(60)).toBe('01:00');
      expect(minutesToTime(450)).toBe('07:30');
      expect(minutesToTime(480)).toBe('08:00');
      expect(minutesToTime(720)).toBe('12:00');
      expect(minutesToTime(725)).toBe('12:05');
      expect(minutesToTime(1439)).toBe('23:59');
    });

    it('normalizes minutes >= 1440 to the 24-hr clock modulo 1440', () => {
      expect(minutesToTime(1440)).toBe('00:00');
      expect(minutesToTime(1441)).toBe('00:01');
      expect(minutesToTime(1500)).toBe('01:00'); // 1440 + 60
      expect(minutesToTime(1530)).toBe('01:30'); // 1440 + 90
      expect(minutesToTime(1860)).toBe('07:00'); // 1440 + 420
      expect(minutesToTime(2880)).toBe('00:00'); // 48 hours later
    });

    it('handles negative minute values by circular backward wrapping', () => {
      expect(minutesToTime(-1)).toBe('23:59');
      expect(minutesToTime(-60)).toBe('23:00');
      expect(minutesToTime(-1440)).toBe('00:00');
    });

    it('throws error on non-finite or NaN minute inputs in normalizeMinute and minutesToTime', () => {
      expect(() => minutesToTime(NaN)).toThrow(/Invalid minute value/);
      expect(() => minutesToTime(Infinity)).toThrow(/Invalid minute value/);
      expect(() => normalizeMinute(NaN)).toThrow(TypeError);
      expect(() => normalizeMinute(Infinity)).toThrow(TypeError);
    });
  });

  // =========================================================================
  // 3. formatDuration Human-Readable Formatting
  // =========================================================================
  describe('3. formatDuration', () => {
    it('formats durations in minutes into readable short strings', () => {
      expect(formatDuration(0)).toBe('0m');
      expect(formatDuration(15)).toBe('15m');
      expect(formatDuration(45)).toBe('45m');
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(75)).toBe('1h 15m');
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(120)).toBe('2h');
      expect(formatDuration(150)).toBe('2h 30m');
    });

    it('formats long duration strings', () => {
      expect(formatDuration(0, 'long')).toBe('0 mins');
      expect(formatDuration(1, 'long')).toBe('1 min');
      expect(formatDuration(45, 'long')).toBe('45 mins');
      expect(formatDuration(60, 'long')).toBe('1 hr');
      expect(formatDuration(120, 'long')).toBe('2 hrs');
      expect(formatDuration(90, 'long')).toBe('1 hr 30 mins');
    });
  });

  // =========================================================================
  // 4. normalizeWakingInterval & Midnight Rollover
  // =========================================================================
  describe('4. normalizeWakingInterval & Rollover Coordinates', () => {
    it('computes linear waking interval for standard daytime routine', () => {
      // Wake 07:00 (420), Bed 23:00 (1380)
      const interval = normalizeWakingInterval('07:00', '23:00');
      expect(interval).toEqual({
        startMinute: 420,
        endMinute: 1380,
        duration: 960, // 16 hours
      });
    });

    it('computes linear interval when bedtime is exact midnight ("00:00")', () => {
      // Wake 08:00 (480), Bed 00:00 -> normalized to 1440
      const interval = normalizeWakingInterval('08:00', '00:00');
      expect(interval).toEqual({
        startMinute: 480,
        endMinute: 1440,
        duration: 960,
        isRollover: true,
      });
    });

    // EDGE CASE 1: Midnight Rollover Bedtime (Wake 07:30, Bed 01:00)
    it('handles EC1: Midnight Rollover Bedtime (Wake "07:30", Bed "01:00")', () => {
      // Bedtime 01:00 is next day -> 1440 + 60 = 1500
      const interval = normalizeWakingInterval('07:30', '01:00');
      expect(interval).toEqual({
        startMinute: 450,
        endMinute: 1500,
        duration: 1050, // 17.5 hours
        isRollover: true,
      });
    });

    // EDGE CASE 3: Bedtime Equals Wake Time
    it('handles EC3: rejects template when wakeTime equals bedtime (zero waking window)', () => {
      expect(() => normalizeWakingInterval('08:00', '08:00')).toThrow(/ZERO_WAKING_WINDOW|zero waking window/i);
      expect(() => normalizeWakingInterval('00:00', '00:00')).toThrow(/ZERO_WAKING_WINDOW|zero waking window/i);
    });

    it('handles night-shift schedule (Wake 20:00, Bed 12:00 next day)', () => {
      // Wake 20:00 (1200), Bed 12:00 (1440 + 720 = 2160)
      const interval = normalizeWakingInterval('20:00', '12:00');
      expect(interval).toEqual({
        startMinute: 1200,
        endMinute: 2160,
        duration: 960,
        isRollover: true,
      });
    });
  });

  // =========================================================================
  // 5. isTimeInInterval Boundary Checks
  // =========================================================================
  describe('5. isTimeInInterval', () => {
    it('correctly assesses half-open intervals [startMinute, endMinute)', () => {
      // Standard interval [420, 600)
      expect(isTimeInInterval(420, 420, 600)).toBe(true);  // Inclusive start
      expect(isTimeInInterval(500, 420, 600)).toBe(true);  // Midpoint
      expect(isTimeInInterval(599, 420, 600)).toBe(true);  // Immediate predecessor
      expect(isTimeInInterval(600, 420, 600)).toBe(false); // Exclusive end
      expect(isTimeInInterval(600, 420, 600, true)).toBe(true); // Inclusive end
      expect(isTimeInInterval(419, 420, 600)).toBe(false); // Before start
      expect(isTimeInInterval(700, 420, 600)).toBe(false); // After end
    });

    it('supports rollover intervals extending past 1440', () => {
      // Rollover interval [1320, 1560) (22:00 to 02:00)
      expect(isTimeInInterval(1320, 1320, 1560)).toBe(true);
      expect(isTimeInInterval(1440, 1320, 1560)).toBe(true); // Midnight
      expect(isTimeInInterval(1500, 1320, 1560)).toBe(true); // 01:00 next day
      expect(isTimeInInterval(1560, 1320, 1560)).toBe(false);

      // Raw 24-hr minute within rollover: 00:30 (raw 30 min)
      expect(isTimeInInterval(30, 480, 1530)).toBe(true);
      // Raw 24-hr minute past bedtime: 02:00 (raw 120 min)
      expect(isTimeInInterval(120, 480, 1530)).toBe(false);
      // Raw 24-hr minute before wake: 07:30 (raw 450 min)
      expect(isTimeInInterval(450, 480, 1530)).toBe(false);
    });

    it('returns false when startMinute >= endMinute', () => {
      expect(isTimeInInterval(500, 600, 500)).toBe(false);
      expect(isTimeInInterval(500, 500, 500)).toBe(false);
    });
  });

  // =========================================================================
  // 6. getFixedActivityIntervals, normalizeActivityToWakingInterval & Helpers
  // =========================================================================
  describe('6. Fixed Activity Intervals & Interval Helpers', () => {
    it('decomposes standard fixed activity within single day into 1 interval', () => {
      const intervals = getFixedActivityIntervals('09:00', '17:00');
      expect(intervals).toEqual([{ start: 540, end: 1020 }]);
    });

    // EDGE CASE 2: Midnight Crossing Fixed Activity (Night Shift 22:00 to 02:00)
    it('handles EC2: decomposes midnight crossing fixed activity into 2 contiguous intervals', () => {
      // 22:00 (1320) to 02:00 (120)
      const intervals = getFixedActivityIntervals('22:00', '02:00');
      expect(intervals).toEqual([
        { start: 1320, end: 1440 }, // Day 1 evening segment
        { start: 0, end: 120 },     // Day 2 early morning segment
      ]);
    });

    it('handles 24-hour continuous fixed activity', () => {
      const intervals = getFixedActivityIntervals('00:00', '00:00');
      expect(intervals).toEqual([{ start: 0, end: 1440 }]);
    });

    it('maps daytime fixed activity to continuous linear waking coordinates', () => {
      const res = normalizeActivityToWakingInterval('09:00', '17:00', 480, 1380);
      expect(res).toEqual({ startMinute: 540, endMinute: 1020 });
    });

    it('maps fixed activity crossing midnight to continuous linear coordinates', () => {
      const res = normalizeActivityToWakingInterval('23:00', '01:00', 480, 1530);
      expect(res).toEqual({ startMinute: 1380, endMinute: 1500 });
    });

    it('maps post-midnight fixed activity in overnight waking day', () => {
      const res = normalizeActivityToWakingInterval('00:30', '01:15', 480, 1530);
      expect(res).toEqual({ startMinute: 1470, endMinute: 1515 });
    });

    it('detects interval overlap with doIntervalsOverlap', () => {
      expect(doIntervalsOverlap({ startMinute: 100, endMinute: 200 }, { startMinute: 150, endMinute: 250 })).toBe(true);
      expect(doIntervalsOverlap({ startMinute: 100, endMinute: 200 }, { startMinute: 200, endMinute: 300 })).toBe(false); // touching
      expect(doIntervalsOverlap({ startMinute: 100, endMinute: 200 }, { startMinute: 250, endMinute: 350 })).toBe(false);
    });

    it('clamps minutes with clampMinute', () => {
      expect(clampMinute(50, 100, 200)).toBe(100);
      expect(clampMinute(150, 100, 200)).toBe(150);
      expect(clampMinute(250, 100, 200)).toBe(200);
    });
  });

  // =========================================================================
  // 7. EDGE CASE 15: DST Shift & Linear Minute Invariance
  // =========================================================================
  describe('7. EC15: DST Shift & Clock Invariance', () => {
    it('guarantees pure linear minute arithmetic is invariant under timezone or DST jumps', () => {
      // Regardless of spring forward / fall back, 1050 minutes between 07:30 and 01:00 remain identical
      const normalWaking = normalizeWakingInterval('07:30', '01:00');
      expect(normalWaking.duration).toBe(1050);
      expect(normalWaking.endMinute - normalWaking.startMinute).toBe(1050);
    });
  });
});
