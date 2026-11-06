# Project: Lazy Focus & Smart Routine Scheduler

## Architecture
- **Framework**: React Native + Expo (TypeScript), targeting iOS (offline personal testing & EAS Cloud Build).
- **Offline Storage**: Local persistence using Zustand with an abstracted `StateStorage` adapter (`AsyncStorage` primary/Jest, `MMKV` native option, in-memory mock for tests). Zero external server dependencies.
- **Scheduling Engine**: Pure deterministic functional engine operating in linear minute coordinates ($0..1439+$) with midnight rollover, fixed-time locks, strict bedtime cutoff, gap detection, transition buffer padding (5-10m), and priority/overflow fitting.
- **Alert & Enforcer System**: 15-batch repeating local notifications (60s interval, sound + vibration) scheduled at activity expiration; un-dismissible in-app modal with zero snooze buttons and single CTA `"รับทราบแล้ว"`; 10-second countdown micro-action transition screen.
- **Core UI**: Three primary views ("Now" hero card with next-task preview, "Timeline" full-day schedule with overflow banner, "Routines" template manager).
- **iOS Live Activity**: ActivityKit SwiftUI countdown widget (Lock Screen & Dynamic Island) using offline native interval timers; integrated via Expo config plugin (`withLiveActivity`).
- **Dual Track Quality**: Parallel E2E Testing Track with 4-tier requirement-driven opaque-box tests, unit test suite (Jest), Forensic Integrity Audit (`teamwork_auditor`), and Adversarial Coverage Hardening (Tier 5).

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Expo & Toolchain Setup | Expo SDK 52 LTS, React Native 0.76.9, React 18.3.1, TypeScript 5.3 configuration | M1 | Survey 3, R1 |
| 2 | Offline-First Storage Architecture | 100% on-device data persistence with zero external server dependencies | M1 | Survey 1, R1 |
| 3 | Zustand Storage Adapter | Abstracted storage adapter for AsyncStorage, MMKV native option, and Jest mock | M1 | Survey 1, R1 |
| 4 | Routine Template Schema & Store | Template CRUD for recurring routines (assigned days, wake/bedtime, fixed/flexible pools) | M1 | Survey 1, R1, R4 |
| 5 | Fixed Activity Schema & Validation | Data model for locked activities with explicit start/end times and midnight rollover | M1 | Survey 1, R1, R2 |
| 6 | Flexible Activity Schema & Validation | Data model for adaptable tasks with durations, priorities, energy levels, min duration | M1 | Survey 1, R1, R2 |
| 7 | Scheduled Block & Day Schedule Schemas | Model for daily timeline blocks (fixed, flexible, buffer, bedtime, free) and daily state | M1 | Survey 1, R1, R2 |
| 8 | Active Runtime State Schema & Store | Live execution state (active block, remaining countdown, transition active flags) | M1 | Survey 1, R1, R4 |
| 9 | Time Normalization & Minute Coordinates | Linear minute math ($0..1439+$) for conflict detection and schedule calculations | M2 | Survey 1, R2 |
| 10 | Midnight Rollover & Night Shift Engine | Handles bedtimes and activities spanning past midnight as continuous linear intervals | M2 | Survey 1, R2 |
| 11 | Fixed Activity Anchoring & Conflict Check | Strict time-locking of fixed activities and detection/rejection of overlaps | M2 | Survey 1, R2 |
| 12 | Strict Bedtime Cutoff Guardian | Non-negotiable bedtime boundary barrier preventing flexible tasks past bedtime | M2 | Survey 1, R2 |
| 13 | Free Gap Calculation Engine | Scans waking intervals around fixed blocks to identify available free gaps $\ge 5$ min | M2 | Survey 1, R2 |
| 14 | Transition Buffer Padding Inserter | Automatically injects 5-10 min transition break blocks after tasks/before fixed blocks | M2 | Survey 1, R2 |
| 15 | Flexible Task Prioritization & Energy Match | Sorts flexible tasks by priority (High/Med/Low) and matches energy to gap times | M2 | Survey 1, R2 |
| 16 | Auto-Slot Gap Fitting Engine | Bin-packing slot allocation placing prioritized tasks into compatible gaps | M2 | Survey 1, R2 |
| 17 | Priority Deferral Overflow Handler | Automatically defers lowest-priority tasks to backlog when gaps are insufficient | M2 | Survey 1, R2 |
| 18 | Proportional Fitting Overflow Handler | Proportionally scales flexible task durations down to `minDuration` to fit gaps | M2 | Survey 1, R2 |
| 19 | Hybrid Overflow Strategy Engine | Drops low-priority first; proportionally compresses medium/high within 25% overflow | M2 | Survey 1, R2 |
| 20 | Dynamic Mid-Day Re-scheduling | Re-slots future gaps after `now` while preserving completed/past schedule blocks | M2 | Survey 1, R2 |
| 21 | Repeating 1-Min Local Notification Queue | Pre-schedules 15 repeating alerts spaced 60s apart with sound/vibe at task expiration | M3 | Survey 2, R3 |
| 22 | Notification Queue Cancellation | Cancels all pending transition notification batch items upon user acknowledgment | M3 | Survey 2, R3 |
| 23 | Un-dismissible In-App Transition Modal | Full-screen modal with NO snooze button, suppressed back/dismiss gestures | M3 | Survey 2, R3 |
| 24 | Single Primary CTA "รับทราบแล้ว" | Exclusive acknowledgment button stopping alarm, clearing queue, launching countdown | M3 | Survey 2, R3 |
| 25 | Looping Foreground Audio & Haptic Alarm | Plays loud looping audio alert (`expo-audio`/`expo-av`) and rhythmic haptic feedback | M3 | Survey 2, R3 |
| 26 | 10-Second Countdown Micro-Action Screen | 10s visual countdown ring commanding user to put down phone and stand up | M3 | Survey 2, R3 |
| 27 | Transition Screen Per-Second Haptics | Light haptics on each second tick and success haptic chime at 0s with bypass | M3 | Survey 2, R3 |
| 28 | "Now" View: Hero Active Card | Dominant card showing active task, category emoji, countdown timer, and progress bar | M4 | Survey 2, R4 |
| 29 | "Now" View: Next-Task Preview Peek | Compact card showing upcoming scheduled task, start time, and buffer badge | M4 | Survey 2, R4 |
| 30 | "Now" View: Quick Controls | "เสร็จก่อนเวลา" (Finish Early) and "ข้าม" (Skip) controls with live recalculation | M4 | Survey 2, R4 |
| 31 | "Now" View: Bedtime Wind-Down Mode | Visual palette shift to deep indigo/night mode within 30-60m of bedtime cutoff | M4 | Survey 2, R4 |
| 32 | "Now" View: Idle / Free Time State | Friendly status card when current clock falls in unscheduled free time | M4 | Survey 2, R4 |
| 33 | "Timeline" View: Full-Day Schedule | Scrollable 24-hr visual timeline with current time indicator line | M4 | Survey 2, R4 |
| 34 | "Timeline" View: Fixed vs Flexible Styling | Clear visual differentiation (locked borders vs accent cards vs dashed buffer pills) | M4 | Survey 2, R4 |
| 35 | "Timeline" View: Deferred Tasks Banner | Summary banner listing flexible tasks deferred due to insufficient gap time | M4 | Survey 2, R4 |
| 36 | "Routines" View: Template Selector | List and switcher for recurring templates (Weekday, Weekend, Custom) | M4 | Survey 2, R4 |
| 37 | "Routines" View: Fixed Activity Editor | Time pickers and recurring day selectors for locked fixed activities & bedtime | M4 | Survey 2, R4 |
| 38 | "Routines" View: Flexible Task Pool Editor | Duration, priority (P1-P3), energy level, and minimum duration editor | M4 | Survey 2, R4 |
| 39 | "Routines" View: Buffer Settings | Global transition buffer padding configuration (5m, 10m, 15m) | M4 | Survey 2, R4 |
| 40 | iOS Live Activity: ActivityKit Bridge | Local TurboModule / native bridge dispatching ActivityKit lifecycle offline | M5 | Survey 2, R5 |
| 41 | iOS Live Activity: SwiftUI Lock Screen Widget | Native Lock Screen banner with category emoji, title, and live offline countdown timer | M5 | Survey 2, R5 |
| 42 | iOS Live Activity: Dynamic Island Layouts | SwiftUI Compact Leading/Trailing, Minimal, and Expanded layouts with next-task peek | M5 | Survey 2, R5 |
| 43 | iOS Live Activity: Expo Config Plugin | Config plugin (`withLiveActivity`) configuring Widget Extension, App Groups, Info.plist | M5 | Survey 2, Survey 3, R5 |
| 44 | EAS Build & iOS Config Validation | `npx eas-cli config:view` validation for iOS development builds | M5 | Survey 3, Acceptance Criteria |
| 45 | E2E Test Suite Execution & Acceptance | Pass 100% of Tiers 1-4 tests covering all 44 inventoried features | M6 | ORIGINAL_REQUEST, Dual Track |
| 46 | Forensic Integrity Audit | Systematic audit for genuine logic, zero cheating/hardcoded mock facades | M6 | ORIGINAL_REQUEST, Integrity Rules |
| 47 | Adversarial Coverage Hardening | Tier 5 adversarial stress testing with challenger agents | M6 | Dual Track Phase 2 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Project Setup & Offline Storage | Manifests, toolchain, Zustand stores, storage adapters, schema validation, unit tests | none | DONE |
| M2 | Routine & Auto-Slot Scheduling Engine | Pure scheduling pipeline, minute math, rollover, gap detection, buffers, overflow fitting, unit tests | M1 | DONE |
| M3 | Nagging Alert & Transition Enforcer | Local notification batching, queue cancellation, un-dismissible modal, 10s countdown screen, audio/haptics | M1, M2 | DONE |
| M4 | Core Application UI | "Now" view, "Timeline" view, "Routines" view, components, navigation, wind-down mode | M1, M2, M3 | DONE |
| M5 | iOS Live Activity & Config Plugin | ActivityKit bridge, SwiftUI widget sources, Expo config plugin, EAS build validation | M1, M2 | DONE |
| M6 | Final Verification, Audit & Hardening | Pass 100% E2E test suite (Tiers 1-4), Forensic Audit (CLEAN), Adversarial Hardening (Tier 5) | M1, M2, M3, M4, M5 | DONE |

---

## Interface Contracts

### Storage Layer ↔ Scheduling Engine (`src/types/index.ts`)
```typescript
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type ActivityPriority = 'high' | 'medium' | 'low';
export type EnergyLevel = 'high' | 'medium' | 'low';
export type OverflowStrategy = 'hybrid' | 'drop_low_priority' | 'proportional_scale';

export interface FixedActivity {
  id: string;
  title: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  categoryEmoji?: string;
  bufferMinutes?: number;
}

export interface FlexibleActivity {
  id: string;
  title: string;
  estimatedDuration: number; // minutes
  minDuration: number;       // minutes (lower bound for scaling)
  priority: ActivityPriority;
  energyLevel: EnergyLevel;
  categoryEmoji?: string;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  assignedDays: DayOfWeek[];
  wakeTime: string; // "HH:mm"
  bedtime: string;  // "HH:mm"
  fixedActivities: FixedActivity[];
  flexibleActivities: FlexibleActivity[];
  defaultBufferMinutes: number;
  overflowStrategy: OverflowStrategy;
}

export interface ScheduledBlock {
  id: string;
  activityId?: string;
  title: string;
  categoryEmoji?: string;
  type: 'fixed' | 'flexible' | 'buffer' | 'bedtime' | 'free';
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  startMinute: number; // linear minutes from midnight
  endMinute: number;   // linear minutes (can exceed 1440 for rollover)
  durationMinutes: number;
  isLocked: boolean;
  isCompleted: boolean;
  originalDurationMinutes?: number;
  scaleFactor?: number;
}

export interface DaySchedule {
  date: string; // "YYYY-MM-DD"
  templateId?: string;
  wakeTime: string;
  bedtime: string;
  blocks: ScheduledBlock[];
  deferredActivities: FlexibleActivity[];
  totalScheduledMinutes: number;
  totalFreeMinutes: number;
  generatedAt: string;
}
```

### Scheduling Engine Signature (`src/engine/scheduler.ts`)
```typescript
export function calculateSchedule(
  template: RoutineTemplate,
  targetDate: string,
  options?: { anchorMinute?: number; existingBlocks?: ScheduledBlock[] }
): DaySchedule;
```

### Nagging Notification Service Signature (`src/services/notifications.ts`)
```typescript
export interface NaggingBatchConfig {
  maxRepeatingAlerts: number; // default: 15
  intervalSeconds: number;    // default: 60
}

export async function scheduleNaggingAlerts(
  block: ScheduledBlock,
  config?: Partial<NaggingBatchConfig>
): Promise<string[]>;

export async function cancelNaggingAlerts(
  activityId: string
): Promise<void>;
```

### iOS Live Activity Service Signature (`src/services/liveActivity.ts`)
```typescript
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

export function isLiveActivitySupported(): boolean;
export async function startLiveActivity(payload: LiveActivityPayload): Promise<string | null>;
export async function updateLiveActivity(activityId: string, payload: Partial<LiveActivityPayload>): Promise<void>;
export async function endLiveActivity(activityId: string): Promise<void>;
```

---

## Code Layout

```
c:\Users\tfkr7\Desktop\โปรแกรม\Moblie Projact\
├── app.json
├── package.json
├── tsconfig.json
├── babel.config.js
├── App.tsx
├── index.ts
├── assets/
│   ├── icon.png
│   ├── splash.png
│   └── sounds/
│       └── alarm.wav
├── plugins/
│   └── withLiveActivity.js
├── ios-widgets/
│   ├── RoutineActivityAttributes.swift
│   └── RoutineLiveActivityWidget.swift
├── src/
│   ├── types/
│   │   └── index.ts
│   ├── store/
│   │   ├── storageAdapter.ts
│   │   ├── routineStore.ts
│   │   ├── scheduleStore.ts
│   │   └── activeStateStore.ts
│   ├── engine/
│   │   ├── timeUtils.ts
│   │   ├── gapFinder.ts
│   │   ├── overflowHandler.ts
│   │   └── scheduler.ts
│   ├── services/
│   │   ├── notifications.ts
│   │   ├── audioService.ts
│   │   └── liveActivity.ts
│   ├── components/
│   │   ├── TransitionModal.tsx
│   │   ├── CountdownScreen.tsx
│   │   ├── HeroCard.tsx
│   │   ├── PeekCard.tsx
│   │   ├── TimelineBlockCard.tsx
│   │   └── TemplateEditor.tsx
│   ├── screens/
│   │   ├── NowScreen.tsx
│   │   ├── TimelineScreen.tsx
│   │   └── RoutinesScreen.tsx
│   └── navigation/
│       └── AppNavigator.tsx
├── __tests__/
│   ├── unit/
│   │   ├── storage.test.ts
│   │   ├── timeUtils.test.ts
│   │   ├── scheduler.test.ts
│   │   ├── overflow.test.ts
│   │   └── notifications.test.ts
│   └── e2e/
│       ├── runner.ts
│       ├── tier1_features.test.ts
│       ├── tier2_boundaries.test.ts
│       ├── tier3_combinations.test.ts
│       └── tier4_scenarios.test.ts
```
