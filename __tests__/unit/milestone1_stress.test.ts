/**
 * Milestone 1 Empirical Challenger Stress Test Suite
 * Validates activeStateStore runtime behaviors, countdown transitions,
 * zero-snooze acknowledgment invariants, bedtime wind-down triggers,
 * and 100% offline isolation across all store operations.
 */

import http from 'http';
import https from 'https';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveStateStore } from '../../src/store/activeStateStore';
import { useRoutineStore } from '../../src/store/routineStore';
import { useScheduleStore } from '../../src/store/scheduleStore';
import {
  InMemoryStorage,
  SafeJSONStorage,
  createAppJSONStorage,
} from '../../src/store/storageAdapter';
import {
  validateRoutineTemplate,
  validateFixedActivity,
  validateFlexibleActivity,
  validateDaySchedule,
} from '../../src/store/validation';
import { ScheduledBlock, DaySchedule } from '../../src/types';

describe('Milestone 1 — Challenger Stress & Empirical Hardening Suite', () => {
  let networkCallCount = 0;
  const originalFetch = global.fetch;
  const originalXHR = (global as any).XMLHttpRequest;
  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;

  beforeAll(() => {
    // Install global network spy / barrier across all standard network interfaces
    const networkTrap = (target: string) => {
      networkCallCount++;
      throw new Error(`[CRITICAL OFFLINE VIOLATION] Network request intercepted to: ${target}`);
    };

    (global as any).fetch = jest.fn(() => networkTrap('global.fetch'));
    (global as any).XMLHttpRequest = jest.fn(() => {
      networkTrap('global.XMLHttpRequest');
      return {} as any;
    });

    http.request = jest.fn(() => networkTrap('http.request')) as any;
    http.get = jest.fn(() => networkTrap('http.get')) as any;
    https.request = jest.fn(() => networkTrap('https.request')) as any;
    https.get = jest.fn(() => networkTrap('https.get')) as any;
  });

  afterAll(() => {
    // Restore global network references
    global.fetch = originalFetch;
    (global as any).XMLHttpRequest = originalXHR;
    http.request = originalHttpRequest;
    http.get = originalHttpGet;
    https.request = originalHttpsRequest;
    https.get = originalHttpsGet;
  });

  beforeEach(async () => {
    networkCallCount = 0;
    await AsyncStorage.clear();
    useRoutineStore.getState().resetToDefaults();
    useScheduleStore.getState().clearSchedules();
    useActiveStateStore.getState().resetActiveState();
    jest.clearAllMocks();
  });

  // =========================================================================
  // Section 1: 100% Offline Isolation Verification
  // =========================================================================
  describe('1. 100% Offline Isolation Verification', () => {
    it('executes comprehensive lifecycle operations across all stores without any network invocation', async () => {
      // 1. routineStore operations
      const template = useRoutineStore.getState().addTemplate({
        name: 'Stress Test Routine',
        assignedDays: ['mon'],
        wakeTime: '06:00',
        bedtime: '22:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        fixedActivities: [
          {
            id: 'fix-1',
            title: 'Morning Class',
            startTime: '08:00',
            endTime: '10:00',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flx-1',
            title: 'Study Session',
            estimatedDuration: 45,
            minDuration: 20,
            priority: 'high',
            energyLevel: 'high',
          },
        ],
      });

      useRoutineStore.getState().updateTemplate(template.id, { wakeTime: '06:15' });
      useRoutineStore.getState().getTemplateById(template.id);
      useRoutineStore.getState().getTemplateForDay('mon');
      await useRoutineStore.persist.rehydrate();

      // 2. scheduleStore operations
      const sampleSchedule: DaySchedule = {
        date: '2026-11-06',
        wakeTime: '06:15',
        bedtime: '22:00',
        blocks: [
          {
            id: 'b-1',
            title: 'Morning Class',
            type: 'fixed',
            startTime: '08:00',
            endTime: '10:00',
            startMinute: 480,
            endMinute: 600,
            durationMinutes: 120,
            isLocked: true,
            isCompleted: false,
          },
        ],
        deferredActivities: [],
        totalScheduledMinutes: 120,
        totalFreeMinutes: 825,
        generatedAt: new Date().toISOString(),
      };

      useScheduleStore.getState().saveSchedule(sampleSchedule);
      useScheduleStore.getState().toggleBlockCompletion('2026-11-06', 'b-1');
      useScheduleStore.getState().completeBlockEarly('2026-11-06', 'b-1', 540);
      useScheduleStore.getState().skipBlock('2026-11-06', 'b-1');
      useScheduleStore.getState().clearOldSchedules(7);
      await useScheduleStore.persist.rehydrate();

      // 3. activeStateStore operations
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', sampleSchedule, 480, 0);
      for (let i = 0; i < 50; i++) {
        useActiveStateStore.getState().tick();
      }
      useActiveStateStore.getState().triggerTransition(sampleSchedule.blocks[0], ['id-1']);
      useActiveStateStore.getState().acknowledgeTransition();
      for (let i = 0; i < 10; i++) {
        useActiveStateStore.getState().tickCountdown();
      }
      await useActiveStateStore.persist.rehydrate();

      // 4. storage adapters and validation
      const mem = new InMemoryStorage();
      mem.setItem('k', 'v');
      mem.getItem('k');
      mem.removeItem('k');
      const safe = new SafeJSONStorage(mem);
      await safe.getItem('nonexistent');
      createAppJSONStorage();

      validateRoutineTemplate(template);
      validateFixedActivity(template.fixedActivities[0]);
      validateFlexibleActivity(template.flexibleActivities[0]);
      validateDaySchedule(sampleSchedule);

      // Verify zero network calls were attempted
      expect(networkCallCount).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
      expect((global as any).XMLHttpRequest).not.toHaveBeenCalled();
      expect(http.request).not.toHaveBeenCalled();
      expect(https.request).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Section 2: activeStateStore Live Clock Ticker & Monotonic Decrement
  // =========================================================================
  describe('2. activeStateStore Live Clock Ticker & Countdown Decrement', () => {
    const mockBlock: ScheduledBlock = {
      id: 'active-stress-block',
      title: 'Adversarial Coding Marathon',
      type: 'flexible',
      startTime: '10:00',
      endTime: '11:00',
      startMinute: 600,
      endMinute: 660,
      durationMinutes: 60,
      isLocked: false,
      isCompleted: false,
    };

    it('decrements remainingSeconds by exactly 1 per tick monotonically over 1,000 continuous ticks', () => {
      useActiveStateStore.setState({
        currentBlock: mockBlock,
        remainingSeconds: 3600,
        elapsedSeconds: 0,
        progress: 0,
        isTransitionActive: false,
        isCountdownActive: false,
      });

      let prevRemaining = 3600;
      let prevElapsed = 0;
      let prevProgress = 0;

      for (let i = 1; i <= 1000; i++) {
        useActiveStateStore.getState().tick();
        const current = useActiveStateStore.getState();

        expect(current.remainingSeconds).toBe(prevRemaining - 1);
        expect(current.elapsedSeconds).toBe(prevElapsed + 1);
        expect(current.progress).toBeGreaterThanOrEqual(prevProgress);
        expect(current.progress).toBeLessThanOrEqual(1.0);

        prevRemaining = current.remainingSeconds;
        prevElapsed = current.elapsedSeconds;
        prevProgress = current.progress;
      }

      expect(useActiveStateStore.getState().remainingSeconds).toBe(2600);
      expect(useActiveStateStore.getState().elapsedSeconds).toBe(1000);
    });

    it('safely handles rapid batch ticking down to expiration (remainingSeconds 1 -> 0)', () => {
      useActiveStateStore.setState({
        currentBlock: mockBlock,
        remainingSeconds: 5,
        elapsedSeconds: 3595,
        progress: 3595 / 3600,
        isTransitionActive: false,
        isCountdownActive: false,
      });

      // Tick from 5 down to 1
      for (let i = 0; i < 4; i++) {
        useActiveStateStore.getState().tick();
        expect(useActiveStateStore.getState().isTransitionActive).toBe(false);
      }
      expect(useActiveStateStore.getState().remainingSeconds).toBe(1);

      // Final tick at remainingSeconds = 1: triggers transition modal
      useActiveStateStore.getState().tick();

      const finalState = useActiveStateStore.getState();
      expect(finalState.remainingSeconds).toBe(0);
      expect(finalState.progress).toBe(1.0);
      expect(finalState.isTransitionActive).toBe(true);
      expect(finalState.transitionBlock?.id).toBe('active-stress-block');
    });

    it('locks in transition state and prevents underflow (remains 0) on subsequent ticks while transition modal is active', () => {
      useActiveStateStore.setState({
        currentBlock: mockBlock,
        remainingSeconds: 0,
        progress: 1.0,
        isTransitionActive: true,
        transitionBlock: mockBlock,
      });

      // Hammer the store with 100 ticks while modal is up
      for (let i = 0; i < 100; i++) {
        useActiveStateStore.getState().tick();
      }

      const state = useActiveStateStore.getState();
      expect(state.remainingSeconds).toBe(0); // Never underflows to negative
      expect(state.isTransitionActive).toBe(true); // Never automatically dismisses
      expect(state.transitionBlock?.id).toBe('active-stress-block');
    });

    it('is a safe no-op when currentBlock is null', () => {
      useActiveStateStore.setState({
        currentBlock: null,
        remainingSeconds: 0,
        elapsedSeconds: 0,
        progress: 0,
        isTransitionActive: false,
      });

      for (let i = 0; i < 50; i++) {
        useActiveStateStore.getState().tick();
      }

      const state = useActiveStateStore.getState();
      expect(state.currentBlock).toBeNull();
      expect(state.remainingSeconds).toBe(0);
      expect(state.isTransitionActive).toBe(false);
    });
  });

  // =========================================================================
  // Section 3: Transition Modal Trigger & Zero-Snooze Invariant
  // =========================================================================
  describe('3. Transition Modal Trigger & Zero-Snooze Invariant', () => {
    const mockBlock: ScheduledBlock = {
      id: 'block-transition-test',
      title: 'High Focus Sprint',
      type: 'fixed',
      startTime: '14:00',
      endTime: '15:00',
      startMinute: 840,
      endMinute: 900,
      durationMinutes: 60,
      isLocked: true,
      isCompleted: false,
    };

    it('triggerTransition immediately engages modal state and records notification batch IDs', () => {
      const notifIds = ['notif-uuid-1', 'notif-uuid-2', 'notif-uuid-3'];
      useActiveStateStore.getState().triggerTransition(mockBlock, notifIds);

      const state = useActiveStateStore.getState();
      expect(state.isTransitionActive).toBe(true);
      expect(state.transitionBlock?.id).toBe('block-transition-test');
      expect(state.activeNotificationIds).toEqual(notifIds);
      expect(state.isCountdownActive).toBe(false);
    });

    it('enforces zero-snooze invariant: no snooze or postpone actions exist on activeStateStore', () => {
      const storeInstance = useActiveStateStore.getState();
      const forbiddenActionPatterns = [
        'snooze',
        'postpone',
        'delay',
        'dismissModal',
        'silenceAlert',
        'deferTransition',
      ];

      const existingKeys = Object.keys(storeInstance);
      for (const pattern of forbiddenActionPatterns) {
        const found = existingKeys.find((k) => k.toLowerCase().includes(pattern.toLowerCase()));
        expect(found).toBeUndefined();
      }

      // Assert that acknowledgeTransition is the only valid route out of the modal
      expect(typeof storeInstance.acknowledgeTransition).toBe('function');
    });

    it('acknowledgeTransition exits transition modal and initiates 10s micro-action countdown', () => {
      useActiveStateStore.setState({
        isTransitionActive: true,
        transitionBlock: mockBlock,
        isCountdownActive: false,
        countdownSecondsLeft: 0,
      });

      useActiveStateStore.getState().acknowledgeTransition();

      const state = useActiveStateStore.getState();
      expect(state.isTransitionActive).toBe(false);
      expect(state.isCountdownActive).toBe(true);
      expect(state.countdownSecondsLeft).toBe(10);
    });
  });

  // =========================================================================
  // Section 4: 10-Second Micro-Action Countdown Ticker & Auto-Completion at 0s
  // =========================================================================
  describe('4. 10-Second Micro-Action Countdown Ticker & Auto-Completion', () => {
    it('tickCountdown executes exact 10-second countdown cycle and auto-completes at 0s', () => {
      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 10,
        transitionBlock: { id: 'sample' } as any,
        activeNotificationIds: ['notif-1'],
      });

      // Seconds 10 -> 9 -> 8 -> 7 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1
      for (let sec = 9; sec >= 1; sec--) {
        useActiveStateStore.getState().tickCountdown();
        const state = useActiveStateStore.getState();
        expect(state.countdownSecondsLeft).toBe(sec);
        expect(state.isCountdownActive).toBe(true);
      }

      // 10th tick: transitions from 1s to 0s, auto-completing countdown
      useActiveStateStore.getState().tickCountdown();

      const completedState = useActiveStateStore.getState();
      expect(completedState.isCountdownActive).toBe(false);
      expect(completedState.countdownSecondsLeft).toBe(10); // Resets to initial
      expect(completedState.transitionBlock).toBeNull();
      expect(completedState.activeNotificationIds).toEqual([]);
    });

    it('tick() also decrements countdown when isCountdownActive is true and auto-completes at 0s', () => {
      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 10,
        transitionBlock: { id: 'sample-2' } as any,
      });

      // Tick 10 times via standard tick() method
      for (let i = 0; i < 10; i++) {
        useActiveStateStore.getState().tick();
      }

      const state = useActiveStateStore.getState();
      expect(state.isCountdownActive).toBe(false);
      expect(state.countdownSecondsLeft).toBe(10);
      expect(state.transitionBlock).toBeNull();
    });

    it('tickCountdown does nothing when isCountdownActive is false', () => {
      useActiveStateStore.setState({
        isCountdownActive: false,
        countdownSecondsLeft: 10,
      });

      for (let i = 0; i < 20; i++) {
        useActiveStateStore.getState().tickCountdown();
      }

      expect(useActiveStateStore.getState().countdownSecondsLeft).toBe(10);
      expect(useActiveStateStore.getState().isCountdownActive).toBe(false);
    });

    it('completeCountdown allows immediate manual bypass', () => {
      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 7,
        transitionBlock: { id: 'block-bypass' } as any,
        activeNotificationIds: ['notif-old'],
      });

      useActiveStateStore.getState().completeCountdown();

      const state = useActiveStateStore.getState();
      expect(state.isCountdownActive).toBe(false);
      expect(state.countdownSecondsLeft).toBe(10);
      expect(state.transitionBlock).toBeNull();
      expect(state.activeNotificationIds).toEqual([]);
    });
  });

  // =========================================================================
  // Section 5: Bedtime Wind-Down Trigger Under Varied Simulated Clock Times
  // =========================================================================
  describe('5. Bedtime Wind-Down Trigger Under Varied Simulated Clock Times', () => {
    const testBlocksWithBedtime: ScheduledBlock[] = [
      {
        id: 'block-day',
        title: 'Day Work',
        type: 'fixed',
        startTime: '09:00',
        endTime: '18:00',
        startMinute: 540,
        endMinute: 1080,
        durationMinutes: 540,
        isLocked: true,
        isCompleted: false,
      },
      {
        id: 'block-evening',
        title: 'Evening Relax',
        type: 'flexible',
        startTime: '18:00',
        endTime: '22:00',
        startMinute: 1080,
        endMinute: 1320,
        durationMinutes: 240,
        isLocked: false,
        isCompleted: false,
      },
      {
        id: 'block-bedtime-2300',
        title: 'Sleep',
        type: 'bedtime',
        startTime: '23:00',
        endTime: '07:00',
        startMinute: 1380, // 23:00 = 1380 minutes
        endMinute: 1860,
        durationMinutes: 480,
        isLocked: true,
        isCompleted: false,
      },
    ];

    const testScheduleBedtime: DaySchedule = {
      date: '2026-11-06',
      wakeTime: '07:00',
      bedtime: '23:00',
      blocks: testBlocksWithBedtime,
      deferredActivities: [],
      totalScheduledMinutes: 1260,
      totalFreeMinutes: 180,
      generatedAt: '2026-11-06T07:00:00.000Z',
    };

    const simulatedTimesMatrix = [
      { minute: 420, label: '07:00 (Wake time, 660m before bedtime)', expectedWindDown: false },
      { minute: 720, label: '12:00 (Mid-day, 660m before bedtime)', expectedWindDown: false },
      { minute: 1200, label: '20:00 (Evening, 180m before bedtime)', expectedWindDown: false },
      { minute: 1319, label: '21:59 (61m before bedtime - boundary - 1)', expectedWindDown: false },
      { minute: 1320, label: '22:00 (60m before bedtime - EXACT entry boundary)', expectedWindDown: true },
      { minute: 1321, label: '22:01 (59m before bedtime)', expectedWindDown: true },
      { minute: 1350, label: '22:30 (30m before bedtime - mid wind-down)', expectedWindDown: true },
      { minute: 1379, label: '22:59 (1m before bedtime - final wind-down minute)', expectedWindDown: true },
      { minute: 1380, label: '23:00 (Exact bedtime start - wind-down ends, sleep begins)', expectedWindDown: false },
      { minute: 1410, label: '23:30 (During sleep)', expectedWindDown: false },
      { minute: 60, label: '01:00 (Post midnight sleep)', expectedWindDown: false },
    ];

    simulatedTimesMatrix.forEach(({ minute, label, expectedWindDown }) => {
      it(`verifies isBedtimeWindDown === ${expectedWindDown} at ${label}`, () => {
        useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', testScheduleBedtime, minute, 0);
        expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(expectedWindDown);
      });
    });

    it('verifies midnight rollover bedtime (bedtime at 00:00 / minute 1440)', () => {
      const midnightBedtimeBlocks: ScheduledBlock[] = [
        {
          id: 'block-bedtime-midnight',
          title: 'Sleep',
          type: 'bedtime',
          startTime: '00:00',
          endTime: '08:00',
          startMinute: 1440,
          endMinute: 1920,
          durationMinutes: 480,
          isLocked: true,
          isCompleted: false,
        },
      ];
      const midnightSchedule: DaySchedule = {
        ...testScheduleBedtime,
        bedtime: '00:00',
        blocks: midnightBedtimeBlocks,
      };

      // 22:59 (minute 1379, 61m before 1440) -> false
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', midnightSchedule, 1379, 0);
      expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(false);

      // 23:00 (minute 1380, 60m before 1440) -> true
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', midnightSchedule, 1380, 0);
      expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(true);

      // 23:45 (minute 1425, 15m before 1440) -> true
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', midnightSchedule, 1425, 0);
      expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(true);

      // 00:00 (minute 1440, bedtime begins) -> false
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', midnightSchedule, 1440, 0);
      expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(false);
    });

    it('returns false without crashing when schedule contains no bedtime block', () => {
      const noBedtimeSchedule: DaySchedule = {
        ...testScheduleBedtime,
        blocks: [testBlocksWithBedtime[0]], // only work block
      };

      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', noBedtimeSchedule, 1350, 0);
      expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(false);
    });

    it('allows manual override via setBedtimeWindDown', () => {
      useActiveStateStore.getState().setBedtimeWindDown(true);
      expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(true);

      useActiveStateStore.getState().setBedtimeWindDown(false);
      expect(useActiveStateStore.getState().isBedtimeWindDown).toBe(false);
    });
  });
});
