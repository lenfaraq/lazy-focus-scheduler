# Design Document: Lazy Focus & Smart Routine Scheduler (iOS)

**Date:** 2026-11-06  
**Status:** In Review  
**Target Platform:** iOS (React Native + Expo, compiled via EAS Cloud Build)  
**Author:** Antigravity & User  

---

## 1. Intent & The "Why"
The target user identifies as "lazy" and struggles with spontaneous time management, suffering from severe **Time Blindness** (getting sucked into gaming and TikTok for extended periods) and **Transition Friction** (habitual procrastination with a "just a few more minutes" mindset). Standard calendar and to-do apps fail because they require heavy daily management, allow easy snoozing/dismissal of notifications, and do not proactively prevent bedtime procrastination.

This app eliminates manual day planning by using **Routine Presets** and **Auto-Slotting**, combined with an **Aggressive Nagging Alert & Zero-Snooze Policy** to enforce behavioral transitions and protect sleep.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Zero Daily Planning Friction:** Users don't need to manually create new schedules each day; recurring routines automatically generate the day's timeline.
- **Smart Auto-Slotting:** Fixed-time activities (e.g. work, classes, scheduled appointments) are locked in time. Flexible tasks (e.g. chores, reading, workout) are automatically scheduled into available gaps.
- **Strict Bedtime Guardian:** Hard cutoff and wind-down routine to ensure adequate sleep.
- **Unignorable Transitions (Nagging Loop):** When an activity expires or a transition starts, the app sends persistent, repeating audio/alerts until the user actively opens the app.
- **Zero-Snooze Enforcement:** The only dismiss button is "รับทราบ" (Acknowledge). No "snooze for 5/10/15 minutes" allowed.
- **Friction-Breaking Transition Screen:** Upon acknowledgment, display a quick micro-action prompt (e.g. a 10-second countdown to put down the phone and stand up).
- **iOS Live Activity / Dynamic Island:** Persistent lock screen / Dynamic Island countdown widget showing remaining time for current activity.
- **No-Mac Windows Development:** Developed using React Native + Expo, built and packaged using Expo Application Services (EAS Build) in cloud macOS runners.

### Non-Goals
- Complex enterprise team collaboration, calendar sharing, or multi-user sync.
- Heavy manual time tracking / stopwatch timesheets (Toggl style).
- Full native device-level hard app blocking (Apple Screen Time API `FamilyControls` requires Apple individual/enterprise entitlement approval from Apple review; not required for v1).

### Anti-Goals
- **No "Snooze" Button:** Providing an easy snooze mechanism defeats the core purpose for this specific user persona.
- **No Overwhelming Daily Setup:** If the user has to spend 10 minutes typing their schedule every morning, they will abandon the app.
- **No Silent / Single-Chime Passive Notifications:** Ordinary notifications that get dismissed without opening the app are strictly prohibited for transition alarms.

---

## 3. Constraints & Target Audience
- **Target Audience:** Personal use on single physical iPhone for validation and testing (Internal/Ad-Hoc/TestFlight build via EAS). Not targeting immediate public App Store distribution, allowing maximum practical utility and battery/notification flexibility.
- **Development Environment:** Windows OS machine.
- **Target Device:** iOS (iPhone).
- **Build Infrastructure:** No local Mac hardware available; all native iOS builds and signing run via Expo Application Services (EAS Build) in cloud macOS runners.
- **Language/Framework:** React Native + Expo (TypeScript).
- **Backend Architecture:** 100% Offline-first. Zero external server requirement.

---

## 4. Evaluated Approaches & Selection

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| **1. React Native + Expo (EAS Cloud Build)** | Develop on Windows; builds iOS native artifacts on Expo macOS cloud; supports Live Activities / Dynamic Island via config plugins; fast UI iteration. | Custom native modules require EAS Cloud Build rather than standard Expo Go. | **Selected (Winner)** |
| **2. Native iOS (Swift / SwiftUI)** | 100% native iOS API access (ActivityKit, UserNotifications, Screen Time API). | Cannot be compiled, tested, or built on Windows without a Mac. | Rejected (Blocked by hardware constraint) |
| **3. Flutter (with Codemagic / GitHub Actions)** | High performance, cross-platform. | iOS Live Activity support requires more boilerplate Swift bridging; cloud build setup is heavier than Expo EAS. | Rejected |

---

## 5. System Architecture & Core Modules

### 5.1 Routine & Schedule Engine
- **Fixed Activities:** Have explicit start/end times (e.g., Job 09:00 - 18:00, Class 13:00 - 15:00, Bedtime 23:30 - 07:00).
- **Flexible Activities:** Have estimated duration and energy level (e.g., Workout 45m, Homework 60m).
- **Auto-Slot Algorithm:**
  1. Populate all Fixed Activities and Bedtime for the day.
  2. Identify free gaps.
  3. Insert Flexible Activities into compatible time blocks with buffer padding (e.g., 5-10 min transition breaks).
  4. *Overflow Handling (Builder Call):* If flexible activities exceed available gap time, the engine automatically fits them proportionally or defers lower-priority items, notifying user on the summary card.

### 5.2 Nagging Alert System (Transition Enforcer)
- When a time block ends (e.g., "Gaming time over" or "TikTok time over"):
  - App queues a pre-scheduled batch of high-priority local notifications repeating every minute with sound and vibration.
  - Notification payload instructs user to open the app.
  - In-app modal pops up with loud sound: single primary CTA **"รับทราบแล้ว" (Acknowledge)**.
  - No "Snooze" button is present.
  - Tapping "รับทราบแล้ว" cancels the audio loop/remaining notification queue and launches the **Transition Screen** (10-second countdown to put down the phone).

### 5.3 iOS Live Activities & Dynamic Island
- Leverages Expo config plugin (`expo-widgets` or ActivityKit native bridge).
- *Lifecycle Policy (Builder Call):* 100% Offline-first. Does not require a push notification server. Live Activity is started and updated locally whenever user launches app, checks schedule, or acknowledges a transition.
- Displays remaining time for current activity on Lock Screen and Dynamic Island.

### 5.4 UI / UX Flow for Lazy Users
- **Main Screen (The "Now" View):**
  - Shows only ONE big card: What you are doing **NOW** and time remaining.
  - Below it: Small peek of the **NEXT** activity.
  - Avoids overwhelming timeline graphs by default.
- **Timeline Tab:** Shows full day breakdown for users who want the big picture.
- **Routines Tab:** Edit recurring templates (e.g., Weekday Routine vs Weekend Routine).

---

## 6. Architecture & Implementation Decisions (Builder Calls)
1. **Target Distribution:** Personal test build via EAS Development Build / Ad-Hoc provisioning directly to user's iPhone.
2. **Offline Architecture:** Zero server dependencies. All scheduling and data stored locally with `zustand` + `mmkv` (or `AsyncStorage`).
3. **Notification Engine:** Pre-scheduled repeating local notifications via `expo-notifications`.
4. **Live Activities:** Local ActivityKit timeline configuration via Expo config plugins.
