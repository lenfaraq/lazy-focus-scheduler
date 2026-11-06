/**
 * Lazy Focus & Smart Routine Scheduler
 * Core Type Definitions & Interface Contracts
 */

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ActivityPriority = 'high' | 'medium' | 'low';

export type EnergyLevel = 'high' | 'medium' | 'low';

export type OverflowStrategy = 'hybrid' | 'drop_low_priority' | 'proportional_scale';

export type BlockType = 'fixed' | 'flexible' | 'buffer' | 'bedtime' | 'free';

/**
 * Fixed Activity: Unmovable activity with explicit locked start/end times.
 */
export interface FixedActivity {
  id: string;
  title: string;
  startTime: string; // "HH:mm" 24-hr format (e.g. "09:00")
  endTime: string;   // "HH:mm" 24-hr format (e.g. "17:00")
  categoryEmoji?: string;
  bufferMinutes?: number; // Optional custom transition buffer after this block
  isLocked: boolean; // Always true for fixed activities
}

/**
 * Flexible Activity: Adaptable task dynamically slotted into available gaps.
 */
export interface FlexibleActivity {
  id: string;
  title: string;
  estimatedDuration: number; // Duration in minutes (> 0)
  minDuration: number;       // Lower bound for proportional scaling (> 0, <= estimatedDuration)
  priority: ActivityPriority;
  energyLevel: EnergyLevel;
  categoryEmoji?: string;
  canSplit?: boolean;        // Whether task can be divided across gaps (default false)
  preferredTimeWindow?: 'morning' | 'afternoon' | 'evening' | 'any';
}

/**
 * Routine Template: Recurring day preset (e.g. Weekday vs Weekend).
 */
export interface RoutineTemplate {
  id: string;
  name: string;
  assignedDays: DayOfWeek[];
  wakeTime: string;          // "HH:mm"
  bedtime: string;           // "HH:mm" (supports midnight rollover, e.g. "01:30")
  fixedActivities: FixedActivity[];
  flexibleActivities: FlexibleActivity[];
  defaultBufferMinutes: number; // Transition break duration (e.g. 5, 10, 15 min)
  overflowStrategy: OverflowStrategy;
  isDefault?: boolean;
  createdAt: string;         // ISO string
  updatedAt: string;         // ISO string
}

/**
 * Scheduled Block: Concrete timeline slot calculated for a day.
 */
export interface ScheduledBlock {
  id: string;
  activityId?: string;       // References source FixedActivity.id or FlexibleActivity.id
  title: string;
  categoryEmoji?: string;
  type: BlockType;
  startTime: string;         // "HH:mm"
  endTime: string;           // "HH:mm"
  startMinute: number;       // Linear minutes from midnight (0..1439+)
  endMinute: number;         // Linear minutes (can exceed 1440 for rollover)
  durationMinutes: number;
  isLocked: boolean;         // Locked against auto-slot movement (fixed, bedtime)
  isCompleted: boolean;      // User checked off or completed
  originalDurationMinutes?: number; // Pre-scaled duration if proportionally compressed
  scaleFactor?: number;      // Scaling ratio (e.g. 0.75)
  notes?: string;
}

/**
 * Day Schedule: The complete persisted plan for a calendar date.
 */
export interface DaySchedule {
  date: string;              // "YYYY-MM-DD"
  templateId?: string;       // Template used to generate schedule
  wakeTime: string;
  bedtime: string;
  blocks: ScheduledBlock[];
  deferredActivities: FlexibleActivity[]; // Activities omitted due to lack of time
  totalScheduledMinutes: number;
  totalFreeMinutes: number;
  generatedAt: string;       // ISO string
  lastUpdatedAt?: string;    // ISO string
}

/**
 * Active Schedule State: Runtime execution state for live countdowns and nagging alerts.
 */
export interface ActiveScheduleState {
  currentBlock: ScheduledBlock | null;
  nextBlock: ScheduledBlock | null;
  remainingSeconds: number;
  elapsedSeconds: number;
  progress: number;          // 0.0 to 1.0
  isTransitionActive: boolean; // True when activity ended and nagging alert is firing
  transitionBlock: ScheduledBlock | null; // The activity that just ended
  isCountdownActive: boolean;  // True during 10-second micro-action transition screen
  countdownSecondsLeft: number; // 10..0
  activeNotificationIds: string[]; // Scheduled repeating notification IDs
  isBedtimeWindDown: boolean;  // True when within 30-60 min of bedtime
  lastTickTimestamp: number;   // Epoch ms of last timer tick
}

/**
 * Validation Error model.
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
