/**
 * CHALLENGER STRESS SUITE — Milestone 3 Nagging Alert & Transition Enforcer
 * 
 * Adversarial Verification & Stress Testing:
 * 1. Midnight rollover calculations (endMinute >= 1440, e.g. 01:00 AM next morning)
 * 2. Immediate expiration & monotonicity of batch triggers under past/expired tasks
 * 3. Rapid repeated cancellation & idempotency under concurrency
 * 4. Multi-activity queue isolation & registry leakage
 * 5. 100% offline isolation barrier
 * 6. Zero-Snooze invariant & Modal dismiss lock
 * 7. 10-Second Countdown Screen state cycle & haptics
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import {
  scheduleNaggingAlerts,
  cancelNaggingAlerts,
  cancelAllScheduledNaggingAlerts,
  calculateBatchTriggerSeconds,
  getActiveNotificationIds,
  clearNotificationQueueRegistry,
} from '../../src/services/notifications';
import { audioService } from '../../src/services/audioService';
import { TransitionModal } from '../../src/components/TransitionModal';
import { CountdownScreen } from '../../src/components/CountdownScreen';
import { useActiveStateStore } from '../../src/store/activeStateStore';
import { ScheduledBlock } from '../../src/types';

// Mock expo-notifications with an in-memory active scheduled map
const mockScheduledNotificationsMap = new Map<string, any>();

jest.mock('expo-notifications', () => {
  return {
    scheduleNotificationAsync: jest.fn().mockImplementation(async (request) => {
      const id = `notif-${Math.random().toString(36).substring(2, 9)}`;
      mockScheduledNotificationsMap.set(id, request);
      return id;
    }),
    cancelScheduledNotificationAsync: jest.fn().mockImplementation(async (id) => {
      mockScheduledNotificationsMap.delete(id);
      return undefined;
    }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
      mockScheduledNotificationsMap.clear();
      return undefined;
    }),
    dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    getAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
      return Array.from(mockScheduledNotificationsMap.entries()).map(([identifier, content]) => ({
        identifier,
        content,
      }));
    }),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    AndroidNotificationPriority: {
      MAX: 'max',
      HIGH: 'high',
      DEFAULT: 'default',
      LOW: 'low',
      MIN: 'min',
    },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

describe('CHALLENGER STRESS SUITE — Milestone 3 Nagging Alert & Transition Enforcer', () => {
  let networkCallCount = 0;
  const originalFetch = global.fetch;

  beforeAll(() => {
    (global as any).fetch = jest.fn(() => {
      networkCallCount++;
      throw new Error('[OFFLINE VIOLATION] Remote fetch detected in notifications service');
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduledNotificationsMap.clear();
    clearNotificationQueueRegistry();
    useActiveStateStore.getState().resetActiveState();
    networkCallCount = 0;
  });

  const baseBlock: ScheduledBlock = {
    id: 'block-standard',
    activityId: 'activity-standard',
    title: 'Focus Deep Work',
    categoryEmoji: '💻',
    type: 'flexible',
    startTime: '10:00',
    endTime: '11:00',
    startMinute: 600,
    endMinute: 660,
    durationMinutes: 60,
    isLocked: false,
    isCompleted: false,
  };

  // =========================================================================
  // 1. Midnight Rollover Math & Boundary Invariants
  // =========================================================================
  describe('1. Midnight Rollover Math & Boundary Invariants', () => {
    it('schedules notification when activity ends at 01:00 next morning (endMinute: 1500) resolving to tomorrow', () => {
      const rolloverBlock: ScheduledBlock = {
        ...baseBlock,
        id: 'block-midnight-shift',
        startTime: '23:30',
        endTime: '01:00',
        startMinute: 1410,
        endMinute: 1500, // 24 * 60 + 60 = 1500 (01:00 AM next day)
      };

      // Base now: 2026-11-06 23:45:00 (75 minutes before 01:00 AM)
      const baseDate = new Date(2026, 10, 6, 23, 45, 0, 0);
      const triggerSecs = calculateBatchTriggerSeconds(rolloverBlock, 0, 60, {
        scheduleDate: '2026-11-06',
        baseDate,
      });

      // 75 minutes = 4500 seconds into the future
      expect(triggerSecs).toBe(4500);
      expect(triggerSecs).toBeGreaterThan(0);
    });

    it('verifies exact midnight boundary (endMinute: 1440, 24:00/00:00 next day)', () => {
      const midnightBlock: ScheduledBlock = {
        ...baseBlock,
        id: 'block-exact-midnight',
        startTime: '23:00',
        endTime: '00:00',
        startMinute: 1380,
        endMinute: 1440,
      };

      const baseDate = new Date(2026, 10, 6, 23, 50, 0, 0); // 10m before midnight
      const triggerSecs = calculateBatchTriggerSeconds(midnightBlock, 0, 60, {
        scheduleDate: '2026-11-06',
        baseDate,
      });

      expect(triggerSecs).toBe(600); // exactly 10 minutes = 600 seconds
    });

    it('handles multi-day rollover (endMinute: 2880+ for extreme long shift)', () => {
      const extremeBlock: ScheduledBlock = {
        ...baseBlock,
        id: 'block-48h-shift',
        startMinute: 1440,
        endMinute: 2940, // 2 days + 1 hour (49 hours from start)
      };

      const baseDate = new Date(2026, 10, 6, 0, 0, 0, 0);
      const triggerSecs = calculateBatchTriggerSeconds(extremeBlock, 0, 60, {
        scheduleDate: '2026-11-06',
        baseDate,
      });

      // 49 hours = 176400 seconds
      expect(triggerSecs).toBe(176400);
    });
  });

  // =========================================================================
  // 2. Immediate Expiration & Spacing Behavior
  // =========================================================================
  describe('2. Immediate Expiration & Spacing Behavior', () => {
    it('schedules already-expired task without scheduleDate options without crashing', async () => {
      const expiredBlock: ScheduledBlock = {
        ...baseBlock,
        id: 'block-expired',
        startMinute: 400,
        endMinute: 460, // already in the past
      };

      const ids = await scheduleNaggingAlerts(expiredBlock);
      expect(ids).toHaveLength(15);

      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      expect(calls[0][0].trigger.seconds).toBe(1);
      expect(calls[1][0].trigger.seconds).toBe(60);
      expect(calls[14][0].trigger.seconds).toBe(840);
    });

    it('adversarial check: verifies batch triggers are strictly monotonic for past-expired tasks', () => {
      // Activity ended at 10:00:00 (endMinute = 600)
      const expiredBlock: ScheduledBlock = {
        ...baseBlock,
        startMinute: 540,
        endMinute: 600,
      };

      // Current time is 10:05:00 (expired 5 minutes ago)
      const baseDate = new Date(2026, 10, 6, 10, 5, 0, 0);

      const triggers = Array.from({ length: 15 }, (_, i) =>
        calculateBatchTriggerSeconds(expiredBlock, i, 60, {
          scheduleDate: '2026-11-06',
          baseDate,
        })
      );

      console.log('CHALLENGER PROBE triggers for 5m-expired task:', triggers);
      // Each trigger must be strictly after the previous trigger
      for (let i = 0; i < triggers.length - 1; i++) {
        expect(triggers[i]).toBeLessThan(triggers[i + 1]);
      }
    });
  });

  // =========================================================================
  // 3. Rapid Repeated Cancellation & Idempotency
  // =========================================================================
  describe('3. Rapid Repeated Cancellation & Idempotency', () => {
    it('survives rapid concurrent cancellations of the same activityId', async () => {
      const ids = await scheduleNaggingAlerts(baseBlock);
      expect(ids).toHaveLength(15);
      expect(getActiveNotificationIds(baseBlock.id)).toHaveLength(15);

      // Fire 10 concurrent cancellations
      await Promise.all(
        Array.from({ length: 10 }, () => cancelNaggingAlerts(baseBlock.id))
      );

      // All scheduled notifications must be cancelled
      expect(mockScheduledNotificationsMap.size).toBe(0);
      expect(getActiveNotificationIds(baseBlock.id)).toHaveLength(0);
    });

    it('survives sequential cancellations on non-existent or null targets', async () => {
      await expect(cancelNaggingAlerts('')).resolves.not.toThrow();
      await expect(cancelNaggingAlerts('non-existent-id-123')).resolves.not.toThrow();
      await expect(cancelNaggingAlerts('another-id')).resolves.not.toThrow();
      expect(mockScheduledNotificationsMap.size).toBe(0);
    });

    it('cancelAllScheduledNaggingAlerts clears both registry and native queue', async () => {
      await scheduleNaggingAlerts({ ...baseBlock, id: 'block-1' });
      await scheduleNaggingAlerts({ ...baseBlock, id: 'block-2' });

      expect(getActiveNotificationIds('block-1')).toHaveLength(15);
      expect(getActiveNotificationIds('block-2')).toHaveLength(15);

      await cancelAllScheduledNaggingAlerts();

      expect(getActiveNotificationIds('block-1')).toHaveLength(0);
      expect(getActiveNotificationIds('block-2')).toHaveLength(0);
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Concurrency & Queue Isolation
  // =========================================================================
  describe('4. Concurrency & Queue Isolation', () => {
    it('isolates notification queues across distinct activity IDs', async () => {
      const blockA: ScheduledBlock = { ...baseBlock, id: 'block-A', activityId: 'activity-A' };
      const blockB: ScheduledBlock = { ...baseBlock, id: 'block-B', activityId: 'activity-B' };

      const idsA = await scheduleNaggingAlerts(blockA);
      const idsB = await scheduleNaggingAlerts(blockB);

      expect(idsA).toHaveLength(15);
      expect(idsB).toHaveLength(15);
      // Both queues are distinct
      expect(idsA).not.toEqual(idsB);

      expect(getActiveNotificationIds('activity-A')).toEqual(idsA);
      expect(getActiveNotificationIds('activity-B')).toEqual(idsB);

      // Cancel only activity A
      await cancelNaggingAlerts('activity-A');

      expect(getActiveNotificationIds('activity-A')).toHaveLength(0);
      // Activity B's registry must still have its 15 notifications!
      expect(getActiveNotificationIds('activity-B')).toEqual(idsB);
    });

    it('probes queue isolation when activeStateStore contains active transition for activity A and cancelNaggingAlerts is called for activity B', async () => {
      const blockA: ScheduledBlock = { ...baseBlock, id: 'block-A', activityId: 'activity-A' };
      const blockB: ScheduledBlock = { ...baseBlock, id: 'block-B', activityId: 'activity-B' };

      const idsA = await scheduleNaggingAlerts(blockA);
      const idsB = await scheduleNaggingAlerts(blockB);

      // Active state store has transition triggered for blockA
      useActiveStateStore.getState().triggerTransition(blockA, idsA);

      // Now cancel activity-B
      await cancelNaggingAlerts('activity-B');

      // Check registry isolation
      expect(getActiveNotificationIds('activity-B')).toHaveLength(0);
      expect(getActiveNotificationIds('activity-A')).toEqual(idsA);

      // Probe native queue: Did cancelNaggingAlerts('activity-B') inadvertently delete activity-A from native queue?
      const idsAInNativeQueue = idsA.filter((id) => mockScheduledNotificationsMap.has(id));
      // In a completely isolated queue, activity A notifications should NOT be cancelled by cancelling activity B
      // If storeIds was included unconditionally, idsAInNativeQueue will be 0 instead of 15!
      console.log('CHALLENGER PROBE: idsA remaining in native queue:', idsAInNativeQueue.length);
      expect(idsAInNativeQueue.length).toBe(15);
    });

    it('tracks block.id in registry when block.id is different from block.activityId', async () => {
      const diffBlock: ScheduledBlock = {
        ...baseBlock,
        id: 'unique-block-uuid-999',
        activityId: 'flexible-activity-parent-111',
      };

      const ids = await scheduleNaggingAlerts(diffBlock);
      expect(ids).toHaveLength(15);

      // Both keys can look up the queue in the registry
      expect(getActiveNotificationIds('unique-block-uuid-999')).toEqual(ids);
      expect(getActiveNotificationIds('flexible-activity-parent-111')).toEqual(ids);
    });
  });

  // =========================================================================
  // 5. 100% Offline Isolation Barrier
  // =========================================================================
  describe('5. 100% Offline Isolation Barrier', () => {
    it('executes full schedule, alert, and cancel cycles with zero network calls', async () => {
      const ids = await scheduleNaggingAlerts(baseBlock);
      await audioService.startAlarm();
      await audioService.stopAlarm();
      await cancelNaggingAlerts(baseBlock.id);

      expect(networkCallCount).toBe(0);
    });
  });

  // =========================================================================
  // 6. Zero-Snooze Invariant & Modal Lockdown
  // =========================================================================
  describe('6. Zero-Snooze Invariant & Modal Lockdown', () => {
    it('confirms ZERO snooze, postpone, or delay elements exist in TransitionModal', () => {
      const { queryByText } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: baseBlock,
        })
      );

      const forbidden = [
        'snooze', 'Snooze', 'SNOOZE',
        'เลื่อน', 'เตือนอีกครั้ง', '5 นาที', '10 นาที', 'ภายหลัง', 'ข้ามการเตือน'
      ];
      for (const f of forbidden) {
        expect(queryByText(new RegExp(f, 'i'))).toBeNull();
      }
      expect(queryByText('รับทราบแล้ว')).toBeTruthy();
    });

    it('asserts onRequestClose is a strict no-op', () => {
      const { getByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: baseBlock,
        })
      );

      const modal = getByTestId('transition-modal');
      expect(modal.props.onRequestClose).toBeDefined();
      act(() => {
        modal.props.onRequestClose();
      });
      // Remains visible
      expect(modal.props.visible).toBe(true);
    });
  });

  // =========================================================================
  // 7. 10-Second Countdown Screen & Audio Service
  // =========================================================================
  describe('7. 10-Second Countdown Screen & Audio Service', () => {
    it('audioService starts and stops cleanly without dangling state', async () => {
      await audioService.initialize();
      await audioService.startAlarm({ enableHaptics: true, hapticIntervalMs: 500 });
      expect(audioService.isAlarmPlaying()).toBe(true);
      expect(audioService.isHapticActive()).toBe(true);

      await audioService.stopAlarm();
      expect(audioService.isAlarmPlaying()).toBe(false);
      expect(audioService.isHapticActive()).toBe(false);
    });

    it('CountdownScreen completes on skip button click', () => {
      const onSkip = jest.fn();
      const { getByTestId } = render(
        React.createElement(CountdownScreen, {
          visible: true,
          onSkip,
        })
      );

      const skipBtn = getByTestId('countdown-skip-button');
      act(() => {
        fireEvent.press(skipBtn);
      });

      expect(onSkip).toHaveBeenCalledTimes(1);
    });

    it('probes CountdownScreen haptic pulses when initialSeconds is passed: exactly 2 after 1s, exactly 1 on completion', () => {
      jest.useFakeTimers();
      const Haptics = require('expo-haptics');
      (Haptics.impactAsync as jest.Mock).mockClear();
      (Haptics.notificationAsync as jest.Mock).mockClear();

      const onComplete = jest.fn();

      render(
        React.createElement(CountdownScreen, {
          visible: true,
          initialSeconds: 3,
          onComplete,
        })
      );

      // Initial mount: exactly 1 haptic
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);

      // Advance 1 second -> tick 1: exactly 2 haptics total (1 mount + 1 tick)
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);

      // Advance 1 second -> tick 2: exactly 3 haptics total
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(3);

      // Advance 1 second -> tick 3 (0s reached): completion chime triggered exactly once
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);

      // Advance another 5 seconds: timer must NOT restart or spam callbacks
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });
});
