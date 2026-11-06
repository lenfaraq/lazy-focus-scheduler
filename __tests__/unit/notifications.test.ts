/**
 * Milestone 3 Unit Test Suite: Nagging Notification Queue Service
 * 
 * Validates 15-batch repeating local notification generation at 60s offsets,
 * cancellation of all scheduled notification IDs, 100% offline isolation,
 * permission resilience, and midnight rollover handling.
 */

import * as Notifications from 'expo-notifications';
import {
  scheduleNaggingAlerts,
  cancelNaggingAlerts,
  cancelAllScheduledNaggingAlerts,
  requestNotificationPermissions,
  calculateBatchTriggerSeconds,
} from '../../src/services/notifications';
import { useActiveStateStore } from '../../src/store/activeStateStore';
import { ScheduledBlock } from '../../src/types';

// Mock expo-notifications
jest.mock('expo-notifications', () => {
  const scheduledMap = new Map<string, any>();
  return {
    scheduleNotificationAsync: jest.fn().mockImplementation(async (request) => {
      const id = `notif-${Math.random().toString(36).substring(2, 9)}`;
      scheduledMap.set(id, request);
      return id;
    }),
    cancelScheduledNotificationAsync: jest.fn().mockImplementation(async (id) => {
      scheduledMap.delete(id);
      return undefined;
    }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
      scheduledMap.clear();
      return undefined;
    }),
    dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    getAllScheduledNotificationsAsync: jest.fn().mockImplementation(async () => {
      return Array.from(scheduledMap.entries()).map(([identifier, content]) => ({
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

describe('Milestone 3 — Nagging Notification Queue Service Suite', () => {
  let networkCallCount = 0;
  const originalFetch = global.fetch;

  beforeAll(() => {
    // Network barrier ensuring 100% offline compliance
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
    useActiveStateStore.getState().resetActiveState();
    networkCallCount = 0;
  });

  const mockBlock: ScheduledBlock = {
    id: 'block-gaming-session',
    title: 'เล่นเกม / โซเชียล',
    categoryEmoji: '🎮',
    type: 'flexible',
    startTime: '14:00',
    endTime: '15:00',
    startMinute: 840,
    endMinute: 900,
    durationMinutes: 60,
    isLocked: false,
    isCompleted: false,
  };

  // =========================================================================
  // 1. 15-Batch Notification Generation & Interval Offsets
  // =========================================================================
  describe('1. 15-Batch Notification Generation', () => {
    it('schedules exactly 15 repeating alerts spaced 60s apart on activity expiration', async () => {
      const notificationIds = await scheduleNaggingAlerts(mockBlock);

      expect(notificationIds).toHaveLength(15);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(15);

      // Verify each call was spaced by 60s (1s for iOS safety, 60s, 120s, ... 840s)
      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      for (let i = 0; i < 15; i++) {
        const req = calls[i][0];
        const expectedSecondsOffset = i === 0 ? 1 : i * 60;

        expect(req.content.title).toContain('หมดเวลา');
        expect(req.content.title).toContain(mockBlock.title);
        expect(req.content.body).toContain('ยืนยัน');
        expect(req.content.sound).toBeTruthy();
        expect(req.content.priority).toBe(Notifications.AndroidNotificationPriority.MAX);
        expect(req.content.data).toEqual(
          expect.objectContaining({
            blockId: mockBlock.id,
            batchIndex: i,
            isNaggingAlert: true,
          })
        );
        expect(req.trigger.seconds).toBe(expectedSecondsOffset);
      }
    });

    it('respects custom batch config overrides (e.g. 5 alerts at 30s intervals)', async () => {
      const notificationIds = await scheduleNaggingAlerts(mockBlock, {
        maxRepeatingAlerts: 5,
        intervalSeconds: 30,
      });

      expect(notificationIds).toHaveLength(5);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(5);

      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      expect(calls[0][0].trigger.seconds).toBe(1);
      expect(calls[1][0].trigger.seconds).toBe(30);
      expect(calls[4][0].trigger.seconds).toBe(120);
    });

    it('handles empty block title gracefully with default fallback text', async () => {
      const emptyTitleBlock: ScheduledBlock = {
        ...mockBlock,
        id: 'block-empty-title',
        title: '',
        categoryEmoji: undefined,
      };

      const notificationIds = await scheduleNaggingAlerts(emptyTitleBlock, {
        maxRepeatingAlerts: 1,
      });

      expect(notificationIds).toHaveLength(1);
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.title).toContain('ทำกิจกรรม');
    });

    it('calculates midnight rollover triggers (+1 day) when endMinute >= 1440', () => {
      const rolloverBlock: ScheduledBlock = {
        ...mockBlock,
        id: 'block-rollover',
        startTime: '23:30',
        endTime: '01:00',
        startMinute: 1410,
        endMinute: 1500, // 01:00 AM next day
      };

      // Base date: 2026-11-06 23:45:00
      const baseDate = new Date(2026, 10, 6, 23, 45, 0, 0);
      const triggerSecs = calculateBatchTriggerSeconds(rolloverBlock, 0, 60, {
        scheduleDate: '2026-11-06',
        baseDate,
      });

      // Target is 2026-11-07 01:00:00 (75 minutes later = 4500 seconds)
      expect(triggerSecs).toBe(4500);
    });
  });

  // =========================================================================
  // 2. Queue Cancellation
  // =========================================================================
  describe('2. Queue Cancellation', () => {
    it('cancels all 15 scheduled notifications upon acknowledgment', async () => {
      const notificationIds = await scheduleNaggingAlerts(mockBlock);
      useActiveStateStore.getState().triggerTransition(mockBlock, notificationIds);

      expect(useActiveStateStore.getState().activeNotificationIds).toHaveLength(15);

      // User acknowledges transition
      await cancelNaggingAlerts(mockBlock.id);

      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(15);
      for (const id of notificationIds) {
        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(id);
      }
    });

    it('cancelAllScheduledNaggingAlerts cancels entire system queue cleanly', async () => {
      await scheduleNaggingAlerts(mockBlock);
      await cancelAllScheduledNaggingAlerts();

      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    });

    it('handles cancellation safely if queue is already empty or invalid activityId', async () => {
      await expect(cancelNaggingAlerts('non-existent-block-id')).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // 3. Offline Isolation & Resilience
  // =========================================================================
  describe('3. Offline Isolation & Resilience', () => {
    it('operates with ZERO network or remote push server calls', async () => {
      await scheduleNaggingAlerts(mockBlock);
      await cancelNaggingAlerts(mockBlock.id);

      expect(networkCallCount).toBe(0);
    });

    it('handles permission denial gracefully without unhandled crashes', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

      const granted = await requestNotificationPermissions();
      expect(granted).toBe(false);

      // Scheduling should gracefully degrade to empty array
      const ids = await scheduleNaggingAlerts(mockBlock);
      expect(ids).toEqual([]);

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    });
  });
});
