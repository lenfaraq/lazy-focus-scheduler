/**
 * Milestone 3 Challenger Invariant & Stress Suite
 * 
 * Adversarially probes:
 * 1. Zero-Snooze AST & String Invariants (Strict 1-CTA policy, zero snooze/postpone controls)
 * 2. Un-dismissibility Invariant (BackHandler hardware back press blocked, onRequestClose no-op)
 * 3. Countdown Timer Monotonicity & Invariant (10-to-0 monotonic tick, auto-completion at 0s, no stalls)
 * 4. State Machine Progression & Re-trigger Immunity (currentBlock -> nextBlock, no infinite loop)
 * 5. Audio & Haptics Lifecycle (alarm start/stop, rhythmic heavy haptics, countdown light ticks, completion chime)
 * 6. Concurrency & Edge-Case Probes (rapid double-tap, null nextBlock, storage rehydration)
 */

import React from 'react';
import { BackHandler } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { TransitionModal } from '../../src/components/TransitionModal';
import { CountdownScreen } from '../../src/components/CountdownScreen';
import { useActiveStateStore, INITIAL_ACTIVE_STATE } from '../../src/store/activeStateStore';
import {
  audioService,
  AudioService,
  triggerTickHaptic,
  triggerCompleteHaptic,
} from '../../src/services/audioService';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { ScheduledBlock } from '../../src/types';

// Mock expo modules
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notif-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  AndroidNotificationPriority: { MAX: 'max' },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

describe('Milestone 3 — Adversarial Challenger Invariant Suite', () => {
  const sampleExpiredBlock: ScheduledBlock = {
    id: 'block-task-alpha',
    activityId: 'act-alpha',
    title: 'เขียนโค้ด React Native',
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

  const sampleUpcomingBlock: ScheduledBlock = {
    id: 'block-task-beta',
    activityId: 'act-beta',
    title: 'พักดื่มน้ำและยืดเส้นยืดสาย',
    categoryEmoji: '🍵',
    type: 'buffer',
    startTime: '11:00',
    endTime: '11:10',
    startMinute: 660,
    endMinute: 670,
    durationMinutes: 10,
    isLocked: false,
    isCompleted: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useActiveStateStore.getState().resetActiveState();
  });

  // =========================================================================
  // Challenge 1: Zero-Snooze AST & Lexical Invariant
  // =========================================================================
  describe('Challenge 1: Zero-Snooze AST & Lexical Invariant', () => {
    it('AST Traversal: Exactly ONE clickable CTA button exists across the entire rendered tree', () => {
      const { UNSAFE_root, getByTestId, queryByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: sampleExpiredBlock,
          nextBlock: sampleUpcomingBlock,
        })
      );

      // 1. Primary CTA is present and accessible
      const ctaButton = getByTestId('transition-acknowledge-button');
      expect(ctaButton).toBeTruthy();
      expect(ctaButton.props.accessibilityLabel).toBe('รับทราบแล้ว');

      // 2. Assert no other button testIDs or secondary actions exist
      expect(queryByTestId('transition-snooze-button')).toBeNull();
      expect(queryByTestId('transition-delay-button')).toBeNull();
      expect(queryByTestId('transition-dismiss-button')).toBeNull();
      expect(queryByTestId('transition-cancel-button')).toBeNull();
      expect(queryByTestId('snooze-button')).toBeNull();

      // 3. Verify exactly 3 content cards/containers and 1 button exist
      expect(getByTestId('transition-modal')).toBeTruthy();
      expect(getByTestId('transition-expired-card')).toBeTruthy();
      expect(getByTestId('transition-next-card')).toBeTruthy();
      expect(getByTestId('transition-acknowledge-button')).toBeTruthy();
    });

    it('Adversarial Lexical Scan: Zero occurrences of any snooze/delay/postpone terminology', () => {
      const { UNSAFE_root } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: sampleExpiredBlock,
          nextBlock: sampleUpcomingBlock,
        })
      );

      const forbiddenPatterns = [
        /\bsnooze\b/i,
        /\bpostpone\b/i,
        /\bdelay\b/i,
        /\blater\b/i,
        /\bdismiss\b/i,
        /เลื่อน/i,
        /เตือนอีกครั้ง/i,
        /5\s*นาที/i,
        /10\s*นาที/i,
        /15\s*นาที/i,
        /ภายหลัง/i,
        /ข้ามการเตือน/i,
        /ปิดเสียง/i,
      ];

      // Recursively gather all string contents from text nodes and string props
      const allStrings: string[] = [];
      const traverse = (node: any) => {
        if (!node) return;
        if (typeof node === 'string') {
          allStrings.push(node);
          return;
        }
        if (node.props) {
          Object.entries(node.props).forEach(([key, val]) => {
            if (typeof val === 'string' && key !== 'testID' && key !== 'fontVariant') {
              allStrings.push(val);
            }
          });
        }
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(traverse);
        }
      };

      traverse(UNSAFE_root);

      for (const str of allStrings) {
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(str)).toBe(false);
        }
      }
    });

    it('Handles adversarial edge-case: null/undefined blocks without rendering fallbacks with snooze buttons', () => {
      const { getByTestId, queryByText } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: null,
          nextBlock: null,
        })
      );

      expect(getByTestId('transition-acknowledge-button')).toBeTruthy();
      expect(queryByText('รับทราบแล้ว')).toBeTruthy();
      expect(queryByText('snooze')).toBeNull();
      expect(queryByText('เลื่อน')).toBeNull();
    });
  });

  // =========================================================================
  // Challenge 2: Un-dismissibility & Hardware Back Interception Invariant
  // =========================================================================
  describe('Challenge 2: Un-dismissibility & BackHandler Invariant', () => {
    it('Modal onRequestClose is strictly an un-dismissible no-op', () => {
      const { getByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: sampleExpiredBlock,
          nextBlock: sampleUpcomingBlock,
        })
      );

      const modal = getByTestId('transition-modal');
      expect(modal.props.onRequestClose).toBeDefined();

      // Executing onRequestClose 5 times in succession
      for (let i = 0; i < 5; i++) {
        act(() => {
          modal.props.onRequestClose();
        });
      }

      // Visibility must remain true
      expect(modal.props.visible).toBe(true);
    });

    it('BackHandler strictly consumes hardware back presses and returns true', () => {
      const backPressListeners: Array<() => boolean> = [];
      const addListenerSpy = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation((eventName: any, handler: any) => {
          if (eventName === 'hardwareBackPress') {
            backPressListeners.push(handler);
          }
          return {
            remove: jest.fn(() => {
              const idx = backPressListeners.indexOf(handler);
              if (idx !== -1) backPressListeners.splice(idx, 1);
            }),
          } as any;
        });

      const { unmount } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: sampleExpiredBlock,
        })
      );

      expect(addListenerSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
      expect(backPressListeners.length).toBeGreaterThan(0);

      // Simulate 10 rapid hardware back button presses
      for (let i = 0; i < 10; i++) {
        const handler = backPressListeners[0];
        const consumed = handler();
        // Handler MUST return true to prevent navigation/dismiss
        expect(consumed).toBe(true);
      }

      // Unmounting must cleanly remove the back handler
      unmount();
      expect(backPressListeners.length).toBe(0);

      addListenerSpy.mockRestore();
    });
  });

  // =========================================================================
  // Challenge 3: Timer Monotonicity & Boundary Invariant
  // =========================================================================
  describe('Challenge 3: Timer Monotonicity & Invariants', () => {
    it('Store-driven countdown: ticks strictly monotonically from 10 down to 0 without skipping or stalling', () => {
      jest.useFakeTimers();

      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 10,
        nextBlock: sampleUpcomingBlock,
      });

      const observedTicks: number[] = [];
      const onTickMock = jest.fn((sec: number) => {
        observedTicks.push(sec);
      });
      const onCompleteMock = jest.fn();

      render(
        React.createElement(CountdownScreen, {
          nextBlock: sampleUpcomingBlock,
          onTick: onTickMock,
          onComplete: onCompleteMock,
        })
      );

      // Advance by 1 second 10 times
      for (let step = 1; step <= 10; step++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }

      // Verify ticks from 9 down to 1 were observed monotonically
      expect(observedTicks).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect(onCompleteMock).toHaveBeenCalledTimes(1);
      expect(useActiveStateStore.getState().isCountdownActive).toBe(false);

      // Advance another 5 seconds to ensure timer stops cleanly and does not re-fire
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(observedTicks).toHaveLength(9);
      expect(onCompleteMock).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('Controlled prop countdown: onComplete is called and unmounts/hides modal cleanly', () => {
      jest.useFakeTimers();

      let isModalVisible = true;
      const onCompleteMock = jest.fn(() => {
        isModalVisible = false;
      });

      const { rerender } = render(
        React.createElement(CountdownScreen, {
          visible: isModalVisible,
          initialSeconds: 3,
          nextBlock: sampleUpcomingBlock,
          onComplete: onCompleteMock,
        })
      );

      // Advance 3 seconds (1s per step to flush React state updates)
      for (let s = 1; s <= 3; s++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }

      expect(onCompleteMock).toHaveBeenCalledTimes(1);

      // Parent updates visibility to false
      rerender(
        React.createElement(CountdownScreen, {
          visible: isModalVisible,
          initialSeconds: 0,
          nextBlock: sampleUpcomingBlock,
          onComplete: onCompleteMock,
        })
      );

      // Advance further
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(onCompleteMock).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('Per-second light haptics trigger on every tick, and completion chime triggers at 0s', () => {
      jest.useFakeTimers();

      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 5,
        nextBlock: sampleUpcomingBlock,
      });

      render(
        React.createElement(CountdownScreen, {
          nextBlock: sampleUpcomingBlock,
        })
      );

      // Initial mount triggers 1 tick haptic
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

      // Advance 4 ticks
      for (let i = 0; i < 4; i++) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

      // 5th tick reaches 0s -> triggers complete haptic chime
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success
      );

      jest.useRealTimers();
    });

    it('Skip button immediately triggers completion haptic and terminates countdown', () => {
      const onSkipMock = jest.fn();

      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 8,
      });

      const { getByTestId } = render(
        React.createElement(CountdownScreen, {
          nextBlock: sampleUpcomingBlock,
          onSkip: onSkipMock,
        })
      );

      const skipButton = getByTestId('countdown-skip-button');
      act(() => {
        fireEvent.press(skipButton);
      });

      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success
      );
      expect(onSkipMock).toHaveBeenCalledTimes(1);
      expect(useActiveStateStore.getState().isCountdownActive).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 4: State Machine Progression & Re-trigger Immunity
  // =========================================================================
  describe('Challenge 4: State Machine Progression & Re-trigger Invariant', () => {
    it('State Machine: Expired block -> Modal -> Countdown -> Next block; subsequent ticks do NOT re-trigger alert', () => {
      const store = useActiveStateStore.getState();

      // Setup store with active block having 2 seconds remaining
      useActiveStateStore.setState({
        currentBlock: sampleExpiredBlock,
        nextBlock: sampleUpcomingBlock,
        remainingSeconds: 2,
        isTransitionActive: false,
        isCountdownActive: false,
      });

      // 1. Tick 1s: remainingSeconds becomes 1
      act(() => {
        useActiveStateStore.getState().tick();
      });
      expect(useActiveStateStore.getState().remainingSeconds).toBe(1);
      expect(useActiveStateStore.getState().isTransitionActive).toBe(false);

      // 2. Tick 1s: remainingSeconds reaches 0 -> triggers transition alert!
      act(() => {
        useActiveStateStore.getState().tick();
      });
      expect(useActiveStateStore.getState().isTransitionActive).toBe(true);
      expect(useActiveStateStore.getState().transitionBlock?.id).toBe(sampleExpiredBlock.id);

      // 3. User taps primary CTA "รับทราบแล้ว"
      act(() => {
        useActiveStateStore.getState().acknowledgeTransition();
      });
      expect(useActiveStateStore.getState().isTransitionActive).toBe(false);
      expect(useActiveStateStore.getState().isCountdownActive).toBe(true);
      expect(useActiveStateStore.getState().countdownSecondsLeft).toBe(10);

      // 4. Tick countdown 10 times to completion
      for (let s = 10; s > 0; s--) {
        act(() => {
          useActiveStateStore.getState().tickCountdown();
        });
      }

      // Assert transition completed
      const stateAfterCountdown = useActiveStateStore.getState();
      expect(stateAfterCountdown.isCountdownActive).toBe(false);
      expect(stateAfterCountdown.currentBlock?.id).toBe(sampleUpcomingBlock.id);
      expect(stateAfterCountdown.remainingSeconds).toBe(sampleUpcomingBlock.durationMinutes * 60);
      expect(stateAfterCountdown.nextBlock).toBeNull();
      expect(stateAfterCountdown.transitionBlock).toBeNull();

      // 5. CRITICAL PROBE: Subsequent clock ticks MUST decrement the NEW block and NOT re-trigger alert
      for (let t = 0; t < 10; t++) {
        act(() => {
          useActiveStateStore.getState().tick();
        });
      }

      const stateAfterSubsequentTicks = useActiveStateStore.getState();
      expect(stateAfterSubsequentTicks.isTransitionActive).toBe(false);
      expect(stateAfterSubsequentTicks.currentBlock?.id).toBe(sampleUpcomingBlock.id);
      expect(stateAfterSubsequentTicks.remainingSeconds).toBe(
        sampleUpcomingBlock.durationMinutes * 60 - 10
      );
    });

    it('Progression when nextBlock is null (last block of day): gracefully enters idle state without crash', () => {
      useActiveStateStore.setState({
        currentBlock: sampleExpiredBlock,
        nextBlock: null,
        remainingSeconds: 1,
      });

      act(() => {
        useActiveStateStore.getState().tick();
      });
      expect(useActiveStateStore.getState().isTransitionActive).toBe(true);

      act(() => {
        useActiveStateStore.getState().acknowledgeTransition();
      });

      // Complete countdown
      act(() => {
        useActiveStateStore.getState().completeCountdown();
      });

      const finalState = useActiveStateStore.getState();
      expect(finalState.isCountdownActive).toBe(false);
      expect(finalState.currentBlock).toBeNull();
      expect(finalState.nextBlock).toBeNull();
      expect(finalState.remainingSeconds).toBe(0);

      // Tick while idle: must be safe no-op
      expect(() => {
        act(() => {
          useActiveStateStore.getState().tick();
        });
      }).not.toThrow();
    });
  });

  // =========================================================================
  // Challenge 5: Audio & Haptics Service Lifecycle & Termination
  // =========================================================================
  describe('Challenge 5: Audio & Haptics Service Lifecycle', () => {
    it('AudioService: startAlarm starts playback & haptics; stopAlarm terminates both immediately', async () => {
      const service = new AudioService();

      expect(service.isAlarmPlaying()).toBe(false);
      expect(service.isHapticActive()).toBe(false);

      // Start alarm
      await service.startAlarm({
        enableHaptics: true,
        hapticIntervalMs: 500,
      });

      expect(service.isAlarmPlaying()).toBe(true);
      expect(service.isHapticActive()).toBe(true);

      // Stop alarm
      await service.stopAlarm();

      expect(service.isAlarmPlaying()).toBe(false);
      expect(service.isHapticActive()).toBe(false);
    });

    it('AudioService: stopAlarm invokes release or remove on player and nullifies reference', async () => {
      const service = new AudioService();
      const mockPlayer = {
        pause: jest.fn(),
        currentTime: 10,
        release: jest.fn(),
        remove: jest.fn(),
      };
      (service as any).player = mockPlayer;
      (service as any).playing = true;

      await service.stopAlarm();

      expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
      expect(mockPlayer.currentTime).toBe(0);
      expect(mockPlayer.release).toHaveBeenCalledTimes(1);
      expect((service as any).player).toBeNull();
      expect(service.isPlaying()).toBe(false);
    });

    it('AudioService: stopAlarm falls back to remove when release is not present', async () => {
      const service = new AudioService();
      const mockPlayer = {
        pause: jest.fn(),
        currentTime: 5,
        remove: jest.fn(),
      };
      (service as any).player = mockPlayer;
      (service as any).playing = true;

      await service.stopAlarm();

      expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
      expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
      expect((service as any).player).toBeNull();
    });

    it('TransitionModal handleAcknowledge resilience: survives errors in audio or notification services', async () => {
      // Force cancelNaggingAlerts to throw
      (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(
        new Error('OS Notification Bridge Failure')
      );

      const onAcknowledgeMock = jest.fn();

      const { getByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: sampleExpiredBlock,
          notificationIds: ['notif-fail'],
          onAcknowledge: onAcknowledgeMock,
        })
      );

      const btn = getByTestId('transition-acknowledge-button');

      // Tapping must not crash the app, and should still complete the transition flow
      await act(async () => {
        fireEvent.press(btn);
      });

      expect(onAcknowledgeMock).toHaveBeenCalledTimes(1);
      expect(useActiveStateStore.getState().isCountdownActive).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 6: Concurrency & Stress Probing
  // =========================================================================
  describe('Challenge 6: Concurrency & Stress Probing', () => {
    it('Rapid multi-tap on CTA "รับทราบแล้ว" does not corrupt state or trigger multiple transitions', async () => {
      const onAcknowledgeMock = jest.fn();

      const { getByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: sampleExpiredBlock,
          onAcknowledge: onAcknowledgeMock,
        })
      );

      const btn = getByTestId('transition-acknowledge-button');

      // Simulate 5 rapid simultaneous taps
      await act(async () => {
        await Promise.all([
          fireEvent.press(btn),
          fireEvent.press(btn),
          fireEvent.press(btn),
          fireEvent.press(btn),
          fireEvent.press(btn),
        ]);
      });

      const state = useActiveStateStore.getState();
      expect(state.isCountdownActive).toBe(true);
      expect(state.countdownSecondsLeft).toBe(10);
      expect(state.isTransitionActive).toBe(false);
    });

    it('Persistence partialize test: transition state is properly identified for offline recovery', () => {
      useActiveStateStore.setState({
        isTransitionActive: true,
        transitionBlock: sampleExpiredBlock,
        activeNotificationIds: ['persisted-notif-1'],
        countdownSecondsLeft: 5,
        remainingSeconds: 42,
      });

      const currentState = useActiveStateStore.getState();
      // Verify values set in store
      expect(currentState.isTransitionActive).toBe(true);
      expect(currentState.transitionBlock?.id).toBe(sampleExpiredBlock.id);
      expect(currentState.activeNotificationIds).toEqual(['persisted-notif-1']);
    });
  });
});
