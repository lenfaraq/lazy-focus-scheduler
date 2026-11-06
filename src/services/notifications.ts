/**
 * Nagging Alert Notification Queue Service
 * 
 * Schedules 15-batch local repeating notifications (60s intervals) upon activity expiration.
 * 100% offline-first: Zero push servers, zero network calls, pure local device scheduling.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ScheduledBlock } from '../types';
import { useActiveStateStore } from '../store/activeStateStore';

export interface NaggingBatchConfig {
  maxRepeatingAlerts: number; // default: 15
  intervalSeconds: number;    // default: 60 (seconds)
}

export interface ScheduleNaggingOptions {
  scheduleDate?: string; // "YYYY-MM-DD"
  baseDate?: Date;       // Anchor reference for testing/calculation
}

export const DEFAULT_NAGGING_CONFIG: NaggingBatchConfig = {
  maxRepeatingAlerts: 15,
  intervalSeconds: 60,
};

export const TRANSITION_CHANNEL_ID = 'transition-alerts';
export const TRANSITION_CATEGORY_ID = 'TRANSITION_ALERT';

// In-memory registry tracking scheduled notification IDs by activityId / blockId
const notificationQueueRegistry = new Map<string, string[]>();

/**
 * Configure global foreground notification behavior and Android notification channels.
 */
export async function initNotificationService(): Promise<void> {
  try {
    if (Notifications?.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }

    if (Platform.OS === 'android' && Notifications?.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync(TRANSITION_CHANNEL_ID, {
        name: 'ช่วงเวลาปรับเปลี่ยนกิจกรรม (Transition Alerts)',
        importance: Notifications.AndroidImportance?.MAX ?? 5,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
  } catch (error) {
    // Safe degradation for simulator or headless test environments
    console.warn('[NotificationService] Initialization error (non-fatal):', error);
  }
}

/**
 * Check and request notification permissions locally (offline-only).
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (!Notifications?.getPermissionsAsync || !Notifications?.requestPermissionsAsync) {
      return true;
    }

    const currentStatus = await Notifications.getPermissionsAsync();
    if (currentStatus.status === 'granted') {
      return true;
    }

    if (currentStatus.canAskAgain || currentStatus.status === 'undetermined') {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      return requested.status === 'granted';
    }

    return false;
  } catch {
    return true; // Fallback to optimistic true in mock/test environments
  }
}

/**
 * Check if notifications are granted.
 */
export async function hasNotificationPermissions(): Promise<boolean> {
  try {
    if (!Notifications?.getPermissionsAsync) return true;
    const permissions = await Notifications.getPermissionsAsync();
    return permissions.status === 'granted';
  } catch {
    return true;
  }
}

/**
 * Compute trigger seconds offset or date taking midnight rollover into account.
 */
export function calculateBatchTriggerSeconds(
  block: ScheduledBlock,
  batchIndex: number,
  intervalSeconds: number,
  options?: ScheduleNaggingOptions
): number {
  if (options?.scheduleDate && typeof block.endMinute === 'number') {
    const baseNow = options.baseDate ? options.baseDate.getTime() : Date.now();
    const [year, month, day] = options.scheduleDate.split('-').map(Number);
    const rolloverDays = Math.floor(block.endMinute / 1440);
    const minuteInDay = block.endMinute % 1440;
    const hours = Math.floor(minuteInDay / 60);
    const minutes = minuteInDay % 60;

    const targetDate = new Date(year, month - 1, day + rolloverDays, hours, minutes, 0, 0);

    // If target is in the past or right now, anchor at baseNow:
    // Batch 0 triggers at 1s (iOS UNTimeIntervalNotificationTrigger requires > 0),
    // and subsequent batches trigger at i * intervalSeconds from baseNow.
    if (targetDate.getTime() <= baseNow) {
      return batchIndex === 0 ? 1 : batchIndex * intervalSeconds;
    }

    // Future scheduled block: calculate offset from baseNow
    const targetTimestamp = targetDate.getTime() + batchIndex * intervalSeconds * 1000;
    return Math.max(1, Math.round((targetTimestamp - baseNow) / 1000));
  }

  // If expired or expiring now (no scheduleDate options): 1s for first alert, then intervalSeconds for subsequent
  return batchIndex === 0 ? 1 : batchIndex * intervalSeconds;
}

/**
 * Schedule a 15-batch repeating local notification queue spaced 60s apart upon activity expiration.
 */
export async function scheduleNaggingAlerts(
  block: ScheduledBlock,
  config?: Partial<NaggingBatchConfig>,
  options?: ScheduleNaggingOptions
): Promise<string[]> {
  const maxRepeatingAlerts = config?.maxRepeatingAlerts ?? DEFAULT_NAGGING_CONFIG.maxRepeatingAlerts;
  const intervalSeconds = config?.intervalSeconds ?? DEFAULT_NAGGING_CONFIG.intervalSeconds;

  // Check permissions first
  try {
    if (Notifications?.getPermissionsAsync) {
      const perms = await Notifications.getPermissionsAsync();
      if (perms.status === 'denied') {
        return [];
      }
    }
  } catch {
    // Continue in test environments
  }

  const activityKey = block.activityId || block.id;
  const scheduledIds: string[] = [];

  const rawTitle = (block.title || '').trim();
  const emojiPrefix = block.categoryEmoji ? `${block.categoryEmoji} ` : '';
  const displayTitle = rawTitle ? `${emojiPrefix}${rawTitle}` : 'ทำกิจกรรม';

  const priorityMax = Notifications?.AndroidNotificationPriority?.MAX ?? 'max';

  for (let i = 0; i < maxRepeatingAlerts; i++) {
    const rawTriggerSeconds = calculateBatchTriggerSeconds(block, i, intervalSeconds, options);
    // iOS UNTimeIntervalNotificationTrigger strictly requires seconds > 0.
    // Clamping to Math.max(1, ...) guarantees immunity against NSInvalidArgumentException crash.
    const triggerSeconds = Math.max(1, rawTriggerSeconds);

    const notificationContent: Notifications.NotificationContentInput = {
      title: `🚨 หมดเวลา: ${displayTitle}!`,
      body: `ถึงเวลาเปลี่ยนกิจกรรมแล้ว! กรุณาเปิดแอปและกดยืนยัน "รับทราบแล้ว" ทันที (แจ้งเตือนครั้งที่ ${i + 1}/${maxRepeatingAlerts})`,
      sound: true,
      priority: priorityMax as any,
      vibrate: [0, 500, 250, 500, 250, 500],
      data: {
        activityId: activityKey,
        blockId: block.id,
        batchIndex: i,
        totalBatches: maxRepeatingAlerts,
        isNaggingAlert: true,
      },
      categoryIdentifier: TRANSITION_CATEGORY_ID,
      interruptionLevel: 'timeSensitive',
      badge: 1,
    };

    const triggerInput: Notifications.NotificationTriggerInput = {
      seconds: triggerSeconds,
      channelId: TRANSITION_CHANNEL_ID,
      repeats: false,
    } as any;

    try {
      if (Notifications?.scheduleNotificationAsync) {
        const id = await Notifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger: triggerInput,
        });
        scheduledIds.push(id);
      } else {
        // Fallback mock ID for test environments without native bridge
        const mockId = `mock-notif-${activityKey}-${i}`;
        scheduledIds.push(mockId);
      }
    } catch (err) {
      console.warn(`[NotificationService] Failed to schedule notification batch #${i}:`, err);
    }
  }

  // Register IDs in local queue registry
  if (scheduledIds.length > 0) {
    notificationQueueRegistry.set(activityKey, scheduledIds);
    // Also track by block.id if different
    if (block.id && block.id !== activityKey) {
      notificationQueueRegistry.set(block.id, scheduledIds);
    }
  }

  return scheduledIds;
}

/**
 * Cancel all 15 scheduled nagging notifications for a given activity upon user acknowledgment.
 */
export async function cancelNaggingAlerts(activityId: string): Promise<void> {
  if (!activityId) return;

  const registryIds = notificationQueueRegistry.get(activityId) ?? [];

  // Queue isolation: Only touch activeNotificationIds from store if activityId
  // is the active transition block ('active-transition', matching block id, or matching activityId).
  // If activityId belongs to a different block, never touch activeNotificationIds.
  const store = useActiveStateStore.getState();
  const isMatchingActiveTransition =
    activityId === 'active-transition' ||
    (store.transitionBlock != null &&
      (activityId === store.transitionBlock.id || activityId === store.transitionBlock.activityId));

  const storeIds = isMatchingActiveTransition ? (store.activeNotificationIds ?? []) : [];

  // Deduplicate IDs
  const combinedIds = Array.from(new Set([...registryIds, ...storeIds]));

  if (Notifications?.cancelScheduledNotificationAsync) {
    await Promise.allSettled(
      combinedIds.map((id) => Notifications.cancelScheduledNotificationAsync(id))
    );
  }

  try {
    if (Notifications?.dismissAllNotificationsAsync) {
      await Notifications.dismissAllNotificationsAsync();
    }
  } catch {
    // Ignore dismiss tray error
  }

  // Clean registry for this activityId and any aliases on the active transition block
  notificationQueueRegistry.delete(activityId);
  if (isMatchingActiveTransition && store.transitionBlock) {
    if (store.transitionBlock.id) notificationQueueRegistry.delete(store.transitionBlock.id);
    if (store.transitionBlock.activityId) notificationQueueRegistry.delete(store.transitionBlock.activityId);
  }
}

/**
 * Cancel all scheduled nagging alerts across all activities.
 */
export async function cancelAllScheduledNaggingAlerts(): Promise<void> {
  notificationQueueRegistry.clear();

  try {
    if (Notifications?.cancelAllScheduledNotificationsAsync) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  } catch (err) {
    console.warn('[NotificationService] Error cancelling all scheduled notifications:', err);
  }

  try {
    if (Notifications?.dismissAllNotificationsAsync) {
      await Notifications.dismissAllNotificationsAsync();
    }
  } catch {
    // Ignore
  }
}

// Alias for flexibility
export const cancelAllNaggingAlerts = cancelAllScheduledNaggingAlerts;

/**
 * Inspect in-memory queue registry (for testing or debugging).
 */
export function getActiveNotificationIds(activityId: string): string[] {
  return notificationQueueRegistry.get(activityId) ?? [];
}

/**
 * Clear in-memory queue registry (for test isolation).
 */
export function clearNotificationQueueRegistry(): void {
  notificationQueueRegistry.clear();
}
