/**
 * Milestone 3 Unit Test Suite: Transition Modal & Countdown Screen UI Flow
 * 
 * Validates fullscreen un-dismissible modal, Zero-Snooze invariant,
 * CTA "รับทราบแล้ว" side effects, 10-second countdown ticking, and state progression.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { TransitionModal } from '../../src/components/TransitionModal';
import { CountdownScreen } from '../../src/components/CountdownScreen';
import { useActiveStateStore } from '../../src/store/activeStateStore';
import { audioService, triggerTickHaptic, triggerCompleteHaptic } from '../../src/services/audioService';
import * as Notifications from 'expo-notifications';
import { ScheduledBlock } from '../../src/types';

// Mock services & native modules
jest.mock('../../src/services/audioService', () => ({
  audioService: {
    startTransitionAlert: jest.fn().mockResolvedValue(undefined),
    stopTransitionAlert: jest.fn().mockResolvedValue(undefined),
    isPlaying: jest.fn().mockReturnValue(false),
  },
  triggerTickHaptic: jest.fn().mockResolvedValue(undefined),
  triggerCompleteHaptic: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-test-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  AndroidNotificationPriority: { MAX: 'max' },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

describe('Milestone 3 — TransitionModal & CountdownScreen UI Suite', () => {
  const mockCurrentBlock: ScheduledBlock = {
    id: 'block-current',
    title: 'เล่นเกมออนไลน์',
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

  const mockNextBlock: ScheduledBlock = {
    id: 'block-next',
    title: 'ทำการบ้าน / อ่านหนังสือ',
    categoryEmoji: '📚',
    type: 'flexible',
    startTime: '15:05',
    endTime: '16:00',
    startMinute: 905,
    endMinute: 960,
    durationMinutes: 55,
    isLocked: false,
    isCompleted: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useActiveStateStore.getState().resetActiveState();
  });

  // =========================================================================
  // 1. TransitionModal: Zero-Snooze & Un-dismissible Verification
  // =========================================================================
  describe('1. TransitionModal Component & Invariants', () => {
    it('renders expired activity details and next activity peek preview', () => {
      const { getByText, getByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: mockCurrentBlock,
          nextBlock: mockNextBlock,
        })
      );

      expect(getByText('เล่นเกมออนไลน์')).toBeTruthy();
      expect(getByText('14:00 - 15:00 น.')).toBeTruthy();
      expect(getByText('ทำการบ้าน / อ่านหนังสือ')).toBeTruthy();
      expect(getByText('เริ่ม 15:05 น.')).toBeTruthy();
      expect(getByTestId('transition-acknowledge-button')).toBeTruthy();
    });

    it('enforces Zero-Snooze Invariant: ZERO snooze or postpone buttons exist', () => {
      const { queryByText } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: mockCurrentBlock,
          nextBlock: mockNextBlock,
        })
      );

      const forbiddenKeywords = [
        'snooze',
        'Snooze',
        'เลื่อน',
        'เตือนอีกครั้ง',
        '5 นาที',
        '10 นาที',
        '15 นาที',
        'ภายหลัง',
        'ข้ามการเตือน',
      ];

      for (const keyword of forbiddenKeywords) {
        expect(queryByText(keyword)).toBeNull();
      }

      // Assert single primary CTA exists
      expect(queryByText('รับทราบแล้ว')).toBeTruthy();
    });

    it('locks onRequestClose preventing hardware back dismiss', () => {
      const { getByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: mockCurrentBlock,
          nextBlock: mockNextBlock,
        })
      );

      const modalElement = getByTestId('transition-modal');
      expect(modalElement.props.onRequestClose).toBeDefined();

      // Trigger onRequestClose - should not throw and should remain visible
      act(() => {
        modalElement.props.onRequestClose();
      });
      expect(modalElement.props.visible).toBe(true);
    });

    it('triggers audioService.startTransitionAlert when modal becomes visible', () => {
      render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: mockCurrentBlock,
          nextBlock: mockNextBlock,
        })
      );

      expect(audioService.startTransitionAlert).toHaveBeenCalledTimes(1);
    });

    it('triggers audioService.stopTransitionAlert when modal unmounts', () => {
      const { unmount } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: mockCurrentBlock,
          nextBlock: mockNextBlock,
        })
      );

      expect(audioService.startTransitionAlert).toHaveBeenCalledTimes(1);
      unmount();
      expect(audioService.stopTransitionAlert).toHaveBeenCalled();
    });

    it('tapping "รับทราบแล้ว" triggers audio stop, cancels notification queue, and acknowledges transition', async () => {
      const onAcknowledgeMock = jest.fn();
      useActiveStateStore.getState().triggerTransition(mockCurrentBlock, ['notif-1', 'notif-2']);

      const { getByTestId } = render(
        React.createElement(TransitionModal, {
          visible: true,
          currentBlock: mockCurrentBlock,
          nextBlock: mockNextBlock,
          notificationIds: ['notif-1', 'notif-2'],
          onAcknowledge: onAcknowledgeMock,
        })
      );

      // Audio was started on mount
      expect(audioService.startTransitionAlert).toHaveBeenCalledTimes(1);

      const acknowledgeButton = getByTestId('transition-acknowledge-button');
      await act(async () => {
        fireEvent.press(acknowledgeButton);
      });

      expect(audioService.stopTransitionAlert).toHaveBeenCalled();
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-2');
      expect(onAcknowledgeMock).toHaveBeenCalledTimes(1);

      // Verify store state transitioned to countdown
      const state = useActiveStateStore.getState();
      expect(state.isTransitionActive).toBe(false);
      expect(state.isCountdownActive).toBe(true);
      expect(state.countdownSecondsLeft).toBe(10);
    });
  });

  // =========================================================================
  // 2. CountdownScreen: 10s Timer & Haptic Execution
  // =========================================================================
  describe('2. CountdownScreen Component & Timer Cycle', () => {
    it('renders initial 10-second countdown and Thai micro-action directives', () => {
      const { getByText, getByTestId } = render(
        React.createElement(CountdownScreen, {
          visible: true,
          initialSeconds: 10,
          nextBlock: mockNextBlock,
        })
      );

      expect(getByTestId('countdown-timer-value').props.children).toBe(10);
      expect(getByText(/วางมือถือลง/)).toBeTruthy();
      expect(getByText(/ลุกขึ้นยืดเส้นยืดสาย/)).toBeTruthy();
      expect(getByText(/ดื่มน้ำสักแก้ว/)).toBeTruthy();
      expect(getByText('ทำการบ้าน / อ่านหนังสือ')).toBeTruthy();
    });

    it('executes second ticks down to 0 and invokes onComplete callback', () => {
      jest.useFakeTimers();
      const onCompleteMock = jest.fn();

      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 10,
        transitionBlock: mockCurrentBlock,
      });

      render(
        React.createElement(CountdownScreen, {
          visible: true,
          nextBlock: mockNextBlock,
          onComplete: onCompleteMock,
        })
      );

      // Advance 1 second
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(useActiveStateStore.getState().countdownSecondsLeft).toBe(9);
      expect(triggerTickHaptic).toHaveBeenCalled();

      // Advance remaining 9 seconds
      act(() => {
        jest.advanceTimersByTime(9000);
      });

      expect(useActiveStateStore.getState().isCountdownActive).toBe(false);
      expect(triggerCompleteHaptic).toHaveBeenCalled();
      expect(onCompleteMock).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('allows early manual bypass via "พร้อมแล้ว เริ่มเลย" button', () => {
      const onSkipMock = jest.fn();
      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 7,
      });

      const { getByTestId } = render(
        React.createElement(CountdownScreen, {
          visible: true,
          nextBlock: mockNextBlock,
          onSkip: onSkipMock,
        })
      );

      const skipButton = getByTestId('countdown-skip-button');
      act(() => {
        fireEvent.press(skipButton);
      });

      expect(triggerCompleteHaptic).toHaveBeenCalled();
      expect(useActiveStateStore.getState().isCountdownActive).toBe(false);
      expect(onSkipMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 3. Complete End-to-End State Machine Transition
  // =========================================================================
  describe('3. Complete State Machine Transition Cycle', () => {
    it('transitions seamlessly: active -> alert modal -> acknowledge -> countdown screen -> idle next task', async () => {
      jest.useFakeTimers();

      // Step 1: Active task expires (tick reaching remainingSeconds <= 1)
      useActiveStateStore.setState({
        currentBlock: mockCurrentBlock,
        nextBlock: mockNextBlock,
        remainingSeconds: 1,
        isTransitionActive: false,
      });

      act(() => {
        useActiveStateStore.getState().tick();
      });

      // Assert transition modal is now triggered
      expect(useActiveStateStore.getState().isTransitionActive).toBe(true);
      expect(useActiveStateStore.getState().transitionBlock?.id).toBe(mockCurrentBlock.id);

      // Step 2: User acknowledges modal
      act(() => {
        useActiveStateStore.getState().acknowledgeTransition();
      });

      expect(useActiveStateStore.getState().isTransitionActive).toBe(false);
      expect(useActiveStateStore.getState().isCountdownActive).toBe(true);
      expect(useActiveStateStore.getState().countdownSecondsLeft).toBe(10);

      // Step 3: 10s Countdown ticks to completion
      for (let s = 10; s > 0; s--) {
        act(() => {
          useActiveStateStore.getState().tickCountdown();
        });
      }

      // Assert countdown completed and system transitioned to next task!
      expect(useActiveStateStore.getState().isCountdownActive).toBe(false);
      expect(useActiveStateStore.getState().transitionBlock).toBeNull();
      expect(useActiveStateStore.getState().activeNotificationIds).toHaveLength(0);
      expect(useActiveStateStore.getState().currentBlock?.id).toBe(mockNextBlock.id);
      expect(useActiveStateStore.getState().remainingSeconds).toBe(mockNextBlock.durationMinutes * 60);

      jest.useRealTimers();
    });
  });
});
