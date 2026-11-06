import { Platform } from 'react-native';
import {
  endAllLiveActivities,
  endLiveActivity,
  getActiveLiveActivityState,
  getAllActiveLiveActivityIds,
  isLiveActivitySupported,
  LiveActivityPayload,
  startLiveActivity,
  updateLiveActivity,
} from '../../src/services/liveActivity';

const withLiveActivity = require('../../plugins/withLiveActivity');

describe('Milestone 5 — iOS Live Activity & Config Plugin Suite', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  beforeEach(async () => {
    Platform.OS = 'ios';
    Object.defineProperty(Platform, 'Version', {
      value: '17.2',
      configurable: true,
    });
    await endAllLiveActivities();
  });

  afterAll(async () => {
    Platform.OS = originalOS;
    Object.defineProperty(Platform, 'Version', {
      value: originalVersion,
      configurable: true,
    });
    await endAllLiveActivities();
  });

  const samplePayload: LiveActivityPayload = {
    routineId: 'block-work-1',
    activityName: 'Work / Study',
    emoji: '💼',
    isFixed: true,
    startDate: new Date('2026-11-06T09:00:00.000Z'),
    endDate: new Date('2026-11-06T10:00:00.000Z'),
    nextActivityName: 'Morning Workout',
    nextActivityStartDate: new Date('2026-11-06T10:10:00.000Z'),
    isTransitionAlert: false,
  };

  test('detects Live Activity support on iOS 16.1+ and rejects older iOS or Android', () => {
    expect(isLiveActivitySupported()).toBe(true);

    Object.defineProperty(Platform, 'Version', {
      value: '15.4',
      configurable: true,
    });
    expect(isLiveActivitySupported()).toBe(false);

    Platform.OS = 'android';
    expect(isLiveActivitySupported()).toBe(false);
  });

  test('starts, updates, and ends offline Live Activity lifecycle without remote push calls', async () => {
    const id = await startLiveActivity(samplePayload);
    expect(id).toBeTruthy();
    expect(getAllActiveLiveActivityIds()).toContain(id!);

    const initialState = getActiveLiveActivityState(id!);
    expect(initialState?.activityName).toBe('Work / Study');
    expect(initialState?.isTransitionAlert).toBe(false);

    await updateLiveActivity(id!, {
      activityName: 'Updated Focus Block',
      isTransitionAlert: true,
    });

    const updatedState = getActiveLiveActivityState(id!);
    expect(updatedState?.activityName).toBe('Updated Focus Block');
    expect(updatedState?.isTransitionAlert).toBe(true);

    await endLiveActivity(id!);
    expect(getActiveLiveActivityState(id!)).toBeNull();
  });

  test('withLiveActivity config plugin injects Info.plist Live Activity flags', () => {
    const baseConfig = {
      name: 'LazyFocus',
      slug: 'lazy-focus-scheduler',
      ios: {
        bundleIdentifier: 'com.lazyfocus.scheduler',
      },
    };

    const configured = withLiveActivity(baseConfig, {
      appGroup: 'group.com.lazyfocus.scheduler',
    });

    expect(configured.ios.infoPlist.NSSupportsLiveActivities).toBe(true);
    expect(
      configured.ios.infoPlist.NSSupportsLiveActivitiesFrequentUpdates
    ).toBe(true);
  });
});
