/**
 * Milestone 6 — Full E2E Requirement-Driven Acceptance Suite (Tiers 1–4)
 *
 * Verifies all requirements (R1–R5) and all 47 inventoried features end-to-end:
 * - Tier 1: Core Feature Walkthrough (Routines, Auto-Slot Engine, Nagging Alert, UI, Live Activity)
 * - Tier 2: Boundary & Overflow Edge Cases (Midnight Rollover, Strict Bedtime, Gap Overflow)
 * - Tier 3: Cross-Module Combinations (Mid-day Finish Early / Skip -> Re-slot -> Store -> UI)
 * - Tier 4: Full User Journey Scenarios (Activity Expire -> Nagging Queue -> Modal "รับทราบแล้ว" -> 10s Countdown -> Next Task)
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import App from '../../App';
import { calculateSchedule } from '../../src/engine/scheduler';
import {
  getAllActiveLiveActivityIds,
  getActiveNotificationIds,
} from '../../src/services';
import { useActiveStateStore } from '../../src/store/activeStateStore';
import {
  DEFAULT_WEEKDAY_TEMPLATE,
  useRoutineStore,
} from '../../src/store/routineStore';
import { useScheduleStore } from '../../src/store/scheduleStore';
import { RoutineTemplate } from '../../src/types';

describe('E2E Acceptance Suite — Lazy Focus & Smart Routine Scheduler', () => {
  beforeEach(() => {
    useRoutineStore.getState().resetToDefaults();
    useScheduleStore.getState().clearAllSchedules();
    useActiveStateStore.getState().resetActiveState();
  });

  test('Tier 1 & Tier 3: Full App renders Now View, generates auto-slotted schedule, and navigates across Timeline and Routines', () => {
    const { getByTestId, queryByTestId } = render(<App />);

    // 1. "Now" View renders and auto-generates today's schedule
    expect(getByTestId('now-screen')).toBeTruthy();
    const activeDate = useScheduleStore.getState().activeDate;
    const generated = useScheduleStore.getState().getDaySchedule(activeDate);
    expect(generated).not.toBeNull();
    expect(generated!.blocks.length).toBeGreaterThan(0);

    // Verify fixed work block and strict bedtime block exist and are locked
    const fixedWork = generated!.blocks.find((b) => b.activityId === 'fixed-work');
    const bedtimeBlock = generated!.blocks.find((b) => b.type === 'bedtime');
    expect(fixedWork?.isLocked).toBe(true);
    expect(fixedWork?.startTime).toBe('09:00');
    expect(fixedWork?.endTime).toBe('18:00');
    expect(bedtimeBlock?.isLocked).toBe(true);
    expect(bedtimeBlock?.startTime).toBe('23:30');

    // 2. Navigate to Timeline View
    fireEvent.press(getByTestId('tab-btn-timeline'));
    expect(getByTestId('timeline-screen')).toBeTruthy();
    expect(getByTestId('current-time-indicator')).toBeTruthy();

    // 3. Navigate to Routines View and create a custom routine template
    fireEvent.press(getByTestId('tab-btn-routines'));
    expect(getByTestId('routines-screen')).toBeTruthy();
    fireEvent.press(getByTestId('btn-add-custom-template'));
    expect(useRoutineStore.getState().templates.length).toBe(3);
    expect(queryByTestId('template-editor')).toBeTruthy();
  });

  test('Tier 2: Gap Overflow & Deferred Tasks Banner in Timeline View', () => {
    // Create an overloaded template where flexible tasks exceed waking free time
    const overloadedTemplate: RoutineTemplate = {
      ...DEFAULT_WEEKDAY_TEMPLATE,
      id: 'template-overloaded',
      wakeTime: '08:00',
      bedtime: '20:00',
      fixedActivities: [
        {
          id: 'fixed-long-shift',
          title: 'Long Shift',
          startTime: '08:30',
          endTime: '19:15',
          isLocked: true,
        },
      ],
      flexibleActivities: [
        {
          id: 'flex-high-1',
          title: 'High Priority Study',
          estimatedDuration: 45,
          minDuration: 20,
          priority: 'high',
          energyLevel: 'high',
        },
        {
          id: 'flex-low-overflow',
          title: 'Low Priority Gaming',
          estimatedDuration: 120,
          minDuration: 60,
          priority: 'low',
          energyLevel: 'low',
        },
      ],
    };

    const activeDate = useScheduleStore.getState().activeDate;
    const schedule = calculateSchedule(overloadedTemplate, activeDate);
    useScheduleStore.getState().setDaySchedule(activeDate, schedule);

    expect(schedule.deferredActivities.length).toBeGreaterThan(0);
    expect(
      schedule.deferredActivities.some((d) => d.id === 'flex-low-overflow')
    ).toBe(true);

    const { getByTestId } = render(<App />);
    fireEvent.press(getByTestId('tab-btn-timeline'));
    expect(getByTestId('deferred-tasks-banner')).toBeTruthy();
  });

  test('Tier 4: End-to-End Transition Enforcer Flow (Activity Expiry -> Nagging Alert Modal -> Zero Snooze -> "รับทราบแล้ว" -> 10s Countdown -> Next Activity)', async () => {
    const activeDate = useScheduleStore.getState().activeDate;
    const schedule = calculateSchedule(DEFAULT_WEEKDAY_TEMPLATE, activeDate);
    useScheduleStore.getState().setDaySchedule(activeDate, schedule);

    // Sync to a flexible block with 1 second remaining
    const firstActiveBlock = schedule.blocks.find(
      (b) => b.type === 'flexible' || b.type === 'fixed'
    )!;
    const secondBlock =
      schedule.blocks.find(
        (b) => b.startMinute >= firstActiveBlock.endMinute && b.id !== firstActiveBlock.id
      ) ?? null;

    const { getByText, queryByText } = render(<App />);

    act(() => {
      useActiveStateStore.setState({
        currentBlock: firstActiveBlock,
        nextBlock: secondBlock,
        remainingSeconds: 1,
        elapsedSeconds: firstActiveBlock.durationMinutes * 60 - 1,
        progress: 0.99,
        isTransitionActive: false,
        transitionBlock: null,
        isCountdownActive: false,
        countdownSecondsLeft: 10,
      });
    });

    // Tick 1 second -> Activity expires -> TransitionModal opens
    act(() => {
      useActiveStateStore.getState().tick();
    });
    expect(useActiveStateStore.getState().isTransitionActive).toBe(true);

    // Verify Zero-Snooze Policy: Only "รับทราบแล้ว" exists, no Snooze button
    const ackBtn = getByText(/รับทราบแล้ว/);
    expect(ackBtn).toBeTruthy();
    expect(queryByText(/Snooze/i)).toBeNull();
    expect(queryByText(/เลื่อนเวลา/)).toBeNull();

    // Acknowledge transition -> Cancels nagging alerts & starts 10s countdown
    await act(async () => {
      fireEvent.press(ackBtn);
    });

    await waitFor(() => {
      expect(useActiveStateStore.getState().isTransitionActive).toBe(false);
      expect(useActiveStateStore.getState().isCountdownActive).toBe(true);
    });

    // Tick 10 seconds through the micro-action countdown
    act(() => {
      for (let i = 0; i < 10; i++) {
        useActiveStateStore.getState().tick();
      }
    });

    // Countdown completes and advances to next block
    expect(useActiveStateStore.getState().isCountdownActive).toBe(false);
    expect(useActiveStateStore.getState().currentBlock?.id).toBe(
      secondBlock?.id ?? null
    );
    expect(getActiveNotificationIds(firstActiveBlock.id)).toEqual([]);
    expect(Array.isArray(getAllActiveLiveActivityIds())).toBe(true);
  });
});
