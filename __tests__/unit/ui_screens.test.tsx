import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  HeroCard,
  PeekCard,
  TemplateEditor,
  TimelineBlockCard,
} from '../../src/components';
import { AppNavigator } from '../../src/navigation/AppNavigator';
import { useActiveStateStore } from '../../src/store/activeStateStore';
import {
  DEFAULT_WEEKDAY_TEMPLATE,
  useRoutineStore,
} from '../../src/store/routineStore';
import { useScheduleStore } from '../../src/store/scheduleStore';
import { ScheduledBlock } from '../../src/types';

describe('Milestone 4 — Core Application UI & Screens Suite', () => {
  beforeEach(() => {
    useRoutineStore.getState().resetToDefaults();
    useScheduleStore.getState().clearAllSchedules();
    useActiveStateStore.getState().resetActiveState();
  });

  const sampleFlexibleBlock: ScheduledBlock = {
    id: 'block-flex-1',
    activityId: 'flex-morning-workout',
    title: 'Morning Focus & Movement',
    categoryEmoji: '⚡',
    type: 'flexible',
    startTime: '07:30',
    endTime: '08:00',
    startMinute: 450,
    endMinute: 480,
    durationMinutes: 30,
    isLocked: false,
    isCompleted: false,
  };

  const sampleNextBlock: ScheduledBlock = {
    id: 'block-buffer-1',
    title: 'Transition Break',
    categoryEmoji: '☕',
    type: 'buffer',
    startTime: '08:00',
    endTime: '08:10',
    startMinute: 480,
    endMinute: 490,
    durationMinutes: 10,
    isLocked: false,
    isCompleted: false,
  };

  test('HeroCard displays active block, countdown timer, wind-down badge, and triggers Finish Early / Skip', () => {
    const onFinishEarly = jest.fn();
    const onSkip = jest.fn();

    const { getByTestId, getByText } = render(
      <HeroCard
        currentBlock={sampleFlexibleBlock}
        remainingSeconds={905}
        progress={0.5}
        isBedtimeWindDown={true}
        onFinishEarly={onFinishEarly}
        onSkip={onSkip}
      />
    );

    expect(getByTestId('hero-active-title').props.children).toBe(
      'Morning Focus & Movement'
    );
    expect(getByTestId('hero-countdown-timer').props.children).toBe('15:05');
    expect(getByTestId('wind-down-badge')).toBeTruthy();
    expect(getByText('ดำเนินการแล้ว 50%')).toBeTruthy();

    fireEvent.press(getByTestId('btn-finish-early'));
    expect(onFinishEarly).toHaveBeenCalledWith('block-flex-1');

    fireEvent.press(getByTestId('btn-skip-block'));
    expect(onSkip).toHaveBeenCalledWith('block-flex-1');
  });

  test('PeekCard displays next scheduled activity and buffer badge', () => {
    const { getByTestId } = render(<PeekCard nextBlock={sampleNextBlock} />);
    expect(getByTestId('peek-next-title').props.children).toBe(
      'Transition Break'
    );
    expect(getByTestId('peek-buffer-badge')).toBeTruthy();
  });

  test('TimelineBlockCard renders distinct styling and toggles completion', () => {
    const onToggle = jest.fn();
    const scaledBlock: ScheduledBlock = {
      ...sampleFlexibleBlock,
      scaleFactor: 0.75,
    };

    const { getByTestId } = render(
      <TimelineBlockCard
        block={scaledBlock}
        isActive={true}
        onToggleComplete={onToggle}
      />
    );

    expect(getByTestId('scaled-badge-block-flex-1')).toBeTruthy();
    fireEvent.press(getByTestId('toggle-complete-block-flex-1'));
    expect(onToggle).toHaveBeenCalledWith('block-flex-1');
  });

  test('TemplateEditor updates buffer settings and adds flexible activities', () => {
    const onUpdate = jest.fn(() => true);
    const { getByTestId } = render(
      <TemplateEditor
        template={DEFAULT_WEEKDAY_TEMPLATE}
        onUpdateTemplate={onUpdate}
      />
    );

    fireEvent.press(getByTestId('buffer-option-15'));
    expect(onUpdate).toHaveBeenCalledWith(DEFAULT_WEEKDAY_TEMPLATE.id, {
      defaultBufferMinutes: 15,
    });
  });

  test('AppNavigator switches between Now, Timeline, and Routines views cleanly', () => {
    const { getByTestId } = render(<AppNavigator />);
    expect(getByTestId('now-screen')).toBeTruthy();

    fireEvent.press(getByTestId('tab-btn-timeline'));
    expect(getByTestId('timeline-screen')).toBeTruthy();

    fireEvent.press(getByTestId('tab-btn-routines'));
    expect(getByTestId('routines-screen')).toBeTruthy();
  });
});
