/**
 * Offline iOS Live Activity & Dynamic Island Service (Milestone 5)
 *
 * Bridges the application's active routine countdown state to iOS ActivityKit
 * (Lock Screen widget and Dynamic Island) operating 100% offline with zero
 * remote push notification servers.
 */

import { NativeModules, Platform } from 'react-native';

export interface LiveActivityPayload {
  routineId: string;
  activityName: string;
  emoji: string;
  isFixed: boolean;
  startDate: Date;
  endDate: Date;
  nextActivityName: string;
  nextActivityStartDate: Date;
  isTransitionAlert: boolean;
}

interface SerializedLiveActivityPayload {
  routineId: string;
  activityName: string;
  emoji: string;
  isFixed: boolean;
  startDateIso: string;
  endDateIso: string;
  nextActivityName: string;
  nextActivityStartDateIso: string;
  isTransitionAlert: boolean;
}

interface NativeRoutineLiveActivityModule {
  isSupported?: () => boolean;
  startActivity?: (payload: SerializedLiveActivityPayload) => Promise<string | null>;
  updateActivity?: (
    activityId: string,
    payload: Partial<SerializedLiveActivityPayload>
  ) => Promise<void>;
  endActivity?: (activityId: string) => Promise<void>;
  endAllActivities?: () => Promise<void>;
}

const activeActivitiesRegistry = new Map<string, LiveActivityPayload>();
let activitySequence = 0;

function getNativeModule(): NativeRoutineLiveActivityModule | null {
  if (NativeModules && NativeModules.RoutineLiveActivityModule) {
    return NativeModules.RoutineLiveActivityModule as NativeRoutineLiveActivityModule;
  }
  return null;
}

function parseIosMajorMinorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  const version = Platform.Version;
  if (typeof version === 'number') return version;
  if (typeof version === 'string') {
    const parsed = parseFloat(version);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Checks if iOS Live Activities (ActivityKit, iOS 16.1+) are supported.
 */
export function isLiveActivitySupported(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }
  const nativeMod = getNativeModule();
  if (nativeMod && typeof nativeMod.isSupported === 'function') {
    try {
      return Boolean(nativeMod.isSupported());
    } catch {
      return false;
    }
  }
  return parseIosMajorMinorVersion() >= 16.1;
}

function serializePayload(
  payload: LiveActivityPayload
): SerializedLiveActivityPayload {
  return {
    routineId: payload.routineId,
    activityName: payload.activityName,
    emoji: payload.emoji,
    isFixed: payload.isFixed,
    startDateIso: payload.startDate.toISOString(),
    endDateIso: payload.endDate.toISOString(),
    nextActivityName: payload.nextActivityName,
    nextActivityStartDateIso: payload.nextActivityStartDate.toISOString(),
    isTransitionAlert: payload.isTransitionAlert,
  };
}

/**
 * Starts a local offline iOS Live Activity for the current routine block.
 */
export async function startLiveActivity(
  payload: LiveActivityPayload
): Promise<string | null> {
  if (!payload || !payload.routineId || !payload.activityName) {
    return null;
  }

  if (!isLiveActivitySupported()) {
    return null;
  }

  const nativeMod = getNativeModule();
  let activityId: string | null = null;

  if (nativeMod && typeof nativeMod.startActivity === 'function') {
    try {
      activityId = await nativeMod.startActivity(serializePayload(payload));
    } catch {
      activityId = null;
    }
  }

  if (!activityId) {
    activitySequence += 1;
    activityId = `live-activity-${payload.routineId}-${activitySequence}`;
  }

  activeActivitiesRegistry.set(activityId, { ...payload });
  return activityId;
}

/**
 * Updates an active offline Live Activity on the Lock Screen and Dynamic Island.
 */
export async function updateLiveActivity(
  activityId: string,
  payload: Partial<LiveActivityPayload>
): Promise<void> {
  if (!activityId || !activeActivitiesRegistry.has(activityId)) {
    return;
  }

  const existing = activeActivitiesRegistry.get(activityId)!;
  const merged: LiveActivityPayload = {
    ...existing,
    ...payload,
  };
  activeActivitiesRegistry.set(activityId, merged);

  const nativeMod = getNativeModule();
  if (nativeMod && typeof nativeMod.updateActivity === 'function') {
    try {
      await nativeMod.updateActivity(activityId, serializePayload(merged));
    } catch {
      // Offline resilient fallback
    }
  }
}

/**
 * Ends a specific Live Activity by ID.
 */
export async function endLiveActivity(activityId: string): Promise<void> {
  if (!activityId) return;
  activeActivitiesRegistry.delete(activityId);

  const nativeMod = getNativeModule();
  if (nativeMod && typeof nativeMod.endActivity === 'function') {
    try {
      await nativeMod.endActivity(activityId);
    } catch {
      // Ignore native teardown error
    }
  }
}

/**
 * Ends all active Live Activities cleanly.
 */
export async function endAllLiveActivities(): Promise<void> {
  activeActivitiesRegistry.clear();

  const nativeMod = getNativeModule();
  if (nativeMod && typeof nativeMod.endAllActivities === 'function') {
    try {
      await nativeMod.endAllActivities();
    } catch {
      // Ignore native teardown error
    }
  }
}

/**
 * Inspects current in-memory Live Activity state (used for state sync and verification).
 */
export function getActiveLiveActivityState(
  activityId: string
): LiveActivityPayload | null {
  return activeActivitiesRegistry.get(activityId) ?? null;
}

export function getAllActiveLiveActivityIds(): string[] {
  return Array.from(activeActivitiesRegistry.keys());
}
