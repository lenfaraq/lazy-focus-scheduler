/**
 * Services Barrel Export
 * Milestone 3 & Milestone 5 Services: Notifications, Audio & iOS Live Activity
 */

export {
  scheduleNaggingAlerts,
  cancelNaggingAlerts,
  cancelAllScheduledNaggingAlerts,
  cancelAllNaggingAlerts,
  requestNotificationPermissions,
  hasNotificationPermissions,
  initNotificationService,
  getActiveNotificationIds,
  clearNotificationQueueRegistry,
  DEFAULT_NAGGING_CONFIG,
  TRANSITION_CHANNEL_ID,
  TRANSITION_CATEGORY_ID,
} from './notifications';
export type {
  NaggingBatchConfig,
  ScheduleNaggingOptions,
} from './notifications';

export {
  audioService,
  AudioService,
  triggerTickHaptic,
  triggerCompleteHaptic,
} from './audioService';
export type {
  AlarmPlaybackConfig,
  AudioServiceConfig,
} from './audioService';

export {
  isLiveActivitySupported,
  startLiveActivity,
  updateLiveActivity,
  endLiveActivity,
  endAllLiveActivities,
  getActiveLiveActivityState,
  getAllActiveLiveActivityIds,
} from './liveActivity';
export type { LiveActivityPayload } from './liveActivity';
