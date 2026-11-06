import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useRoutineStore,
  DEFAULT_ROUTINE_TEMPLATES,
  DEFAULT_WEEKDAY_TEMPLATE,
  DEFAULT_WEEKEND_TEMPLATE,
} from '../../src/store/routineStore';
import { useScheduleStore } from '../../src/store/scheduleStore';
import { useActiveStateStore, INITIAL_ACTIVE_STATE } from '../../src/store/activeStateStore';
import {
  asyncStorageAdapter,
  InMemoryStorage,
  SafeJSONStorage,
} from '../../src/store/storageAdapter';
import { RoutineTemplate, DaySchedule, ScheduledBlock } from '../../src/types';

describe('Milestone 1 — Offline Storage & Zustand Persistence Suite', () => {
  beforeEach(async () => {
    // 1. Reset AsyncStorage mock storage
    await AsyncStorage.clear();

    // 2. Reset in-memory Zustand store states
    useRoutineStore.getState().resetToDefaults();
    useScheduleStore.getState().clearSchedules();
    useActiveStateStore.getState().resetActiveState();

    // 3. Reset all mock function call histories
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Store Initialization & Default Templates
  // =========================================================================
  describe('1. Store Initialization with Default Templates', () => {
    it('exports DEFAULT_ROUTINE_TEMPLATES containing weekday and weekend presets', () => {
      expect(DEFAULT_ROUTINE_TEMPLATES).toHaveLength(2);
      expect(DEFAULT_ROUTINE_TEMPLATES[0]).toBe(DEFAULT_WEEKDAY_TEMPLATE);
      expect(DEFAULT_ROUTINE_TEMPLATES[1]).toBe(DEFAULT_WEEKEND_TEMPLATE);
    });

    it('initializes with default weekday and weekend routine templates', () => {
      const state = useRoutineStore.getState();
      expect(state.templates).toBeDefined();
      expect(state.templates.length).toBeGreaterThanOrEqual(2);

      const weekday = state.templates.find((t) => t.id === 'template-weekday');
      expect(weekday).toBeDefined();
      expect(weekday?.name).toBe('Weekday Routine');
      expect(weekday?.assignedDays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
      expect(weekday?.wakeTime).toBe('07:00');
      expect(weekday?.bedtime).toBe('23:30');

      const weekend = state.templates.find((t) => t.id === 'template-weekend');
      expect(weekend).toBeDefined();
      expect(weekend?.name).toBe('Weekend Routine');
      expect(weekend?.assignedDays).toEqual(['sat', 'sun']);
      expect(weekend?.wakeTime).toBe('08:30');
      expect(weekend?.bedtime).toBe('00:00');
    });

    it('default templates contain non-empty fixed and flexible activities', () => {
      const { templates } = useRoutineStore.getState();
      const weekday = templates.find((t) => t.id === 'template-weekday')!;

      expect(weekday.fixedActivities.length).toBeGreaterThanOrEqual(1);
      const workActivity = weekday.fixedActivities.find((a) => a.title.includes('Work'));
      expect(workActivity).toBeDefined();
      expect(workActivity?.startTime).toBe('09:00');
      expect(workActivity?.endTime).toBe('18:00');

      expect(weekday.flexibleActivities.length).toBeGreaterThanOrEqual(1);
      const workout = weekday.flexibleActivities.find((a) => a.title.includes('Workout'));
      expect(workout).toBeDefined();
      expect(workout?.estimatedDuration).toBeGreaterThan(0);
      expect(workout?.minDuration).toBeLessThanOrEqual(workout?.estimatedDuration || 0);
      expect(workout?.priority).toBe('high');
    });

    it('resolves correct active template for day of week', () => {
      const { getActiveTemplateForDay, getTemplateForDay } = useRoutineStore.getState();

      const wedTemplate = getActiveTemplateForDay('wed');
      expect(wedTemplate.id).toBe('template-weekday');

      const sunTemplate = getTemplateForDay('sun');
      expect(sunTemplate.id).toBe('template-weekend');
    });

    it('selectedTemplateId and activeTemplateId default to a valid existing template', () => {
      const { selectedTemplateId, activeTemplateId, templates } = useRoutineStore.getState();
      expect(selectedTemplateId).toBeTruthy();
      expect(activeTemplateId).toBeTruthy();
      const exists = templates.some((t) => t.id === selectedTemplateId);
      expect(exists).toBe(true);
    });
  });

  // =========================================================================
  // 2. Routine Template CRUD Operations
  // =========================================================================
  describe('2. Routine Template CRUD Operations', () => {
    it('successfully adds a new custom routine template', () => {
      const customTemplate: RoutineTemplate = {
        id: 'template-custom-study',
        name: 'Intensive Study Routine',
        assignedDays: [],
        wakeTime: '06:30',
        bedtime: '23:00',
        defaultBufferMinutes: 10,
        overflowStrategy: 'hybrid',
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
        fixedActivities: [
          {
            id: 'fixed-exam',
            title: 'Mock Exam',
            startTime: '10:00',
            endTime: '13:00',
            categoryEmoji: '📝',
            isLocked: true,
          },
        ],
        flexibleActivities: [
          {
            id: 'flex-review',
            title: 'Review Flashcards',
            estimatedDuration: 45,
            minDuration: 30,
            priority: 'high',
            energyLevel: 'high',
          },
        ],
      };

      useRoutineStore.getState().addTemplate(customTemplate);

      const updatedState = useRoutineStore.getState();
      expect(updatedState.templates.some((t) => t.id === 'template-custom-study')).toBe(true);

      const retrieved = updatedState.getTemplateById('template-custom-study');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Intensive Study Routine');
      expect(retrieved?.wakeTime).toBe('06:30');
    });

    it('successfully updates an existing routine template', () => {
      const success = useRoutineStore.getState().updateTemplate('template-weekday', {
        bedtime: '22:45',
        defaultBufferMinutes: 10,
      });

      expect(success).toBe(true);

      const updated = useRoutineStore.getState().getTemplateById('template-weekday');
      expect(updated?.bedtime).toBe('22:45');
      expect(updated?.defaultBufferMinutes).toBe(10);
      // Non-modified fields should remain unchanged
      expect(updated?.name).toBe('Weekday Routine');
      expect(updated?.wakeTime).toBe('07:00');
    });

    it('returns false when updating a non-existent template ID without mutating store', () => {
      const initialCount = useRoutineStore.getState().templates.length;
      const success = useRoutineStore.getState().updateTemplate('non-existent-template-id', {
        name: 'Should Not Exist',
      });

      expect(success).toBe(false);
      expect(useRoutineStore.getState().templates.length).toBe(initialCount);
    });

    it('successfully deletes a routine template', () => {
      const tempTemplate: RoutineTemplate = {
        id: 'template-to-delete',
        name: 'Temporary Routine',
        assignedDays: [],
        wakeTime: '08:00',
        bedtime: '23:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
        fixedActivities: [],
        flexibleActivities: [],
      };
      useRoutineStore.getState().addTemplate(tempTemplate);
      expect(useRoutineStore.getState().getTemplateById('template-to-delete')).toBeDefined();

      const success = useRoutineStore.getState().deleteTemplate('template-to-delete');
      expect(success).toBe(true);
      expect(useRoutineStore.getState().getTemplateById('template-to-delete')).toBeUndefined();
    });

    it('reassigns selectedTemplateId when the currently selected template is deleted', () => {
      const tempTemplate: RoutineTemplate = {
        id: 'template-selected-to-delete',
        name: 'Temporary Selected Routine',
        assignedDays: [],
        wakeTime: '08:00',
        bedtime: '23:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
        fixedActivities: [],
        flexibleActivities: [],
      };
      useRoutineStore.getState().addTemplate(tempTemplate);
      useRoutineStore.getState().selectTemplate('template-selected-to-delete');
      expect(useRoutineStore.getState().selectedTemplateId).toBe('template-selected-to-delete');

      useRoutineStore.getState().deleteTemplate('template-selected-to-delete');

      const currentSelectedId = useRoutineStore.getState().selectedTemplateId;
      expect(currentSelectedId).not.toBe('template-selected-to-delete');
      expect(currentSelectedId).toBeTruthy();
      expect(useRoutineStore.getState().templates.some((t) => t.id === currentSelectedId)).toBe(true);
    });

    it('prevents leaving store in an empty template state (falls back or refuses delete)', () => {
      // Attempt to delete all templates
      const currentTemplates = [...useRoutineStore.getState().templates];
      for (const t of currentTemplates) {
        useRoutineStore.getState().deleteTemplate(t.id);
      }

      // Store invariant: at least 1 template must always remain available
      const remainingTemplates = useRoutineStore.getState().templates;
      expect(remainingTemplates.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 3. Schedule State Persistence & Rehydration
  // =========================================================================
  describe('3. Schedule State Persistence & Rehydration', () => {
    const mockBlocks: ScheduledBlock[] = [
      {
        id: 'block-fixed-1',
        title: 'Morning Meeting',
        type: 'fixed',
        startTime: '09:00',
        endTime: '10:00',
        startMinute: 540,
        endMinute: 600,
        durationMinutes: 60,
        isLocked: true,
        isCompleted: false,
      },
      {
        id: 'block-buffer-1',
        title: 'Break',
        type: 'buffer',
        startTime: '10:00',
        endTime: '10:10',
        startMinute: 600,
        endMinute: 610,
        durationMinutes: 10,
        isLocked: false,
        isCompleted: false,
      },
      {
        id: 'block-flex-1',
        title: 'Deep Focus Coding',
        type: 'flexible',
        startTime: '10:10',
        endTime: '11:40',
        startMinute: 610,
        endMinute: 700,
        durationMinutes: 90,
        isLocked: false,
        isCompleted: false,
      },
    ];

    const mockSchedule: DaySchedule = {
      date: '2026-11-06',
      templateId: 'template-weekday',
      wakeTime: '07:00',
      bedtime: '23:30',
      blocks: mockBlocks,
      deferredActivities: [],
      totalScheduledMinutes: 160,
      totalFreeMinutes: 830,
      generatedAt: '2026-11-06T07:00:00.000Z',
    };

    it('persists daily schedule and retrieves by date key', () => {
      useScheduleStore.getState().saveSchedule(mockSchedule);

      const retrieved = useScheduleStore.getState().getScheduleForDate('2026-11-06');
      expect(retrieved).toBeDefined();
      expect(retrieved?.date).toBe('2026-11-06');
      expect(retrieved?.blocks.length).toBe(3);
      expect(retrieved?.totalScheduledMinutes).toBe(160);
    });

    it('updates block completion status within a stored schedule', () => {
      useScheduleStore.getState().saveSchedule(mockSchedule);

      const success = useScheduleStore
        .getState()
        .setBlockCompleted('2026-11-06', 'block-fixed-1', true);

      expect(success).toBe(true);

      const updated = useScheduleStore.getState().getScheduleForDate('2026-11-06');
      const targetBlock = updated?.blocks.find((b) => b.id === 'block-fixed-1');
      expect(targetBlock?.isCompleted).toBe(true);

      // Other blocks remain unchanged
      const flexBlock = updated?.blocks.find((b) => b.id === 'block-flex-1');
      expect(flexBlock?.isCompleted).toBe(false);
    });

    it('supports completing block early and truncating its end time', () => {
      useScheduleStore.getState().saveSchedule(mockSchedule);

      // Block flex-1 originally 10:10 (610) to 11:40 (700). User completes early at minute 650 (10:50)
      useScheduleStore.getState().completeBlockEarly('2026-11-06', 'block-flex-1', 650);

      const updated = useScheduleStore.getState().getScheduleForDate('2026-11-06');
      const flexBlock = updated?.blocks.find((b) => b.id === 'block-flex-1');
      expect(flexBlock?.isCompleted).toBe(true);
      expect(flexBlock?.endMinute).toBe(650);
      expect(flexBlock?.durationMinutes).toBe(40);
      expect(flexBlock?.endTime).toBe('10:50');
    });

    it('supports skipping block with user notes', () => {
      useScheduleStore.getState().saveSchedule(mockSchedule);

      useScheduleStore.getState().skipBlock('2026-11-06', 'block-flex-1');

      const updated = useScheduleStore.getState().getScheduleForDate('2026-11-06');
      const flexBlock = updated?.blocks.find((b) => b.id === 'block-flex-1');
      expect(flexBlock?.isCompleted).toBe(true);
      expect(flexBlock?.notes).toContain('Skipped');
    });

    it('persists to AsyncStorage mock when saveSchedule is invoked', async () => {
      useScheduleStore.getState().saveSchedule(mockSchedule);

      // Verify AsyncStorage mock received setItem call
      expect(AsyncStorage.setItem).toHaveBeenCalled();
      const storageCalls = (AsyncStorage.setItem as jest.Mock).mock.calls;
      const scheduleCall = storageCalls.find(([key]) => key.includes('schedule'));
      expect(scheduleCall).toBeDefined();
      expect(scheduleCall[1]).toContain('2026-11-06');
    });

    it('rehydrates daily schedule across store reset', async () => {
      useScheduleStore.getState().saveSchedule(mockSchedule);
      useScheduleStore.getState().setBlockCompleted('2026-11-06', 'block-fixed-1', true);

      // Rehydrate store from persistence
      await useScheduleStore.persist.rehydrate();

      const rehydrated = useScheduleStore.getState().getScheduleForDate('2026-11-06');
      expect(rehydrated).toBeDefined();
      expect(rehydrated?.blocks.find((b) => b.id === 'block-fixed-1')?.isCompleted).toBe(true);
    });
  });

  // =========================================================================
  // 4. Active Runtime State & Countdown Actions
  // =========================================================================
  describe('4. Active Runtime State & Transition Flow', () => {
    const testBlocks: ScheduledBlock[] = [
      {
        id: 'block-active',
        title: 'Morning Coding',
        type: 'flexible',
        startTime: '09:00',
        endTime: '10:00',
        startMinute: 540,
        endMinute: 600,
        durationMinutes: 60,
        isLocked: false,
        isCompleted: false,
      },
      {
        id: 'block-next',
        title: 'Team Standup',
        type: 'fixed',
        startTime: '10:00',
        endTime: '10:30',
        startMinute: 600,
        endMinute: 630,
        durationMinutes: 30,
        isLocked: true,
        isCompleted: false,
      },
      {
        id: 'block-bed',
        title: 'Bedtime',
        type: 'bedtime',
        startTime: '23:00',
        endTime: '07:00',
        startMinute: 1380,
        endMinute: 1860,
        durationMinutes: 480,
        isLocked: true,
        isCompleted: false,
      },
    ];

    const testSchedule: DaySchedule = {
      date: '2026-11-06',
      templateId: 'template-weekday',
      wakeTime: '07:00',
      bedtime: '23:00',
      blocks: testBlocks,
      deferredActivities: [],
      totalScheduledMinutes: 90,
      totalFreeMinutes: 870,
      generatedAt: '2026-11-06T07:00:00.000Z',
    };

    it('syncWithCurrentTime matches active block and upcoming peek block', () => {
      // Current time: 09:15 (minute 555, second 0)
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', testSchedule, 555, 0);

      const state = useActiveStateStore.getState();
      expect(state.currentBlock?.id).toBe('block-active');
      expect(state.nextBlock?.id).toBe('block-next');
      expect(state.remainingSeconds).toBe(45 * 60); // 45 minutes remaining
      expect(state.elapsedSeconds).toBe(15 * 60);   // 15 minutes elapsed
      expect(state.progress).toBeCloseTo(0.25, 2);
    });

    it('detects bedtime wind-down when within 60 minutes of bedtime', () => {
      // Bedtime is 23:00 (minute 1380). Current time: 22:30 (minute 1350)
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', testSchedule, 1350, 0);

      const state = useActiveStateStore.getState();
      expect(state.isBedtimeWindDown).toBe(true);
    });

    it('tick decrements remaining seconds and calculates progress', () => {
      useActiveStateStore.getState().syncWithCurrentTime('2026-11-06', testSchedule, 555, 0);
      const initialRemaining = useActiveStateStore.getState().remainingSeconds;

      useActiveStateStore.getState().tick();

      expect(useActiveStateStore.getState().remainingSeconds).toBe(initialRemaining - 1);
    });

    it('triggers transition modal when remainingSeconds reaches 0', () => {
      useActiveStateStore.setState({
        currentBlock: testBlocks[0],
        remainingSeconds: 1,
        isTransitionActive: false,
      });

      useActiveStateStore.getState().tick();

      const state = useActiveStateStore.getState();
      expect(state.isTransitionActive).toBe(true);
      expect(state.transitionBlock?.id).toBe('block-active');
      expect(state.remainingSeconds).toBe(0);
    });

    it('acknowledging transition launches 10-second micro-action countdown', () => {
      useActiveStateStore.setState({
        isTransitionActive: true,
        transitionBlock: testBlocks[0],
        isCountdownActive: false,
      });

      // Tapping "รับทราบแล้ว"
      useActiveStateStore.getState().acknowledgeTransition();

      const state = useActiveStateStore.getState();
      expect(state.isTransitionActive).toBe(false);
      expect(state.isCountdownActive).toBe(true);
      expect(state.countdownSecondsLeft).toBe(10);
    });

    it('tickCountdown counts down from 10 to 0 and auto-completes transition', () => {
      useActiveStateStore.setState({
        isCountdownActive: true,
        countdownSecondsLeft: 2,
      });

      useActiveStateStore.getState().tickCountdown();
      expect(useActiveStateStore.getState().countdownSecondsLeft).toBe(1);

      useActiveStateStore.getState().tickCountdown();
      expect(useActiveStateStore.getState().isCountdownActive).toBe(false);
      expect(useActiveStateStore.getState().countdownSecondsLeft).toBe(10);
    });

    it('resets to INITIAL_ACTIVE_STATE correctly', () => {
      useActiveStateStore.setState({ remainingSeconds: 999, isTransitionActive: true });
      useActiveStateStore.getState().resetActiveState();
      expect(useActiveStateStore.getState().remainingSeconds).toBe(INITIAL_ACTIVE_STATE.remainingSeconds);
      expect(useActiveStateStore.getState().isTransitionActive).toBe(INITIAL_ACTIVE_STATE.isTransitionActive);
    });
  });

  // =========================================================================
  // 5. Corrupted Storage Fallback & Graceful Recovery
  // =========================================================================
  describe('5. Corrupted Storage Fallback & Graceful Recovery', () => {
    it('gracefully falls back to default templates when storage contains invalid raw non-JSON text', async () => {
      // Seed corrupted non-JSON payload
      await AsyncStorage.setItem('routine-storage', 'CORRUPT_RAW_DATA_NOT_JSON{{{');

      // Trigger rehydration
      await expect(useRoutineStore.persist.rehydrate()).resolves.not.toThrow();

      // State should safely fallback to default templates
      const state = useRoutineStore.getState();
      expect(state.templates).toBeDefined();
      expect(state.templates.length).toBeGreaterThanOrEqual(2);
      expect(state.templates.some((t) => t.id === 'template-weekday')).toBe(true);
    });

    it('gracefully falls back when storage contains invalid JSON schema structure', async () => {
      // Seed valid JSON string but corrupt schema (templates is not an array)
      const corruptedSchema = JSON.stringify({
        version: 1,
        state: {
          templates: 'invalid-string-not-array',
          selectedTemplateId: 12345,
        },
      });
      await AsyncStorage.setItem('routine-storage', corruptedSchema);

      // Trigger rehydration
      await expect(useRoutineStore.persist.rehydrate()).resolves.not.toThrow();

      const state = useRoutineStore.getState();
      expect(Array.isArray(state.templates)).toBe(true);
      expect(state.templates.length).toBeGreaterThanOrEqual(2);
    });

    it('recovers corrupted storage by overwriting with valid state on subsequent mutation', async () => {
      await AsyncStorage.setItem('routine-storage', 'BROKEN_JSON_MALFORMED');
      await useRoutineStore.persist.rehydrate();

      // Perform a valid store mutation (reset to defaults or add template)
      useRoutineStore.getState().resetToDefaults();

      // Subsequent read from storage should parse successfully
      const rawStored = await AsyncStorage.getItem('routine-storage');
      expect(rawStored).toBeTruthy();
      expect(() => JSON.parse(rawStored!)).not.toThrow();

      const parsed = JSON.parse(rawStored!);
      expect(parsed.state).toBeDefined();
      expect(Array.isArray(parsed.state.templates)).toBe(true);
    });

    it('handles underlying AsyncStorage getItem rejection without crashing the store', async () => {
      const originalGetItem = AsyncStorage.getItem;
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
        new Error('Simulated hardware I/O disk failure')
      );

      await expect(useRoutineStore.persist.rehydrate()).resolves.not.toThrow();

      const state = useRoutineStore.getState();
      expect(state.templates).toBeDefined();
      expect(state.templates.length).toBeGreaterThanOrEqual(2);

      // Restore getItem
      AsyncStorage.getItem = originalGetItem;
    });

    it('SafeJSONStorage returns null on syntax error without throwing', async () => {
      const inMemory = new InMemoryStorage();
      inMemory.setItem('test-broken', '{invalid-json');
      const safe = new SafeJSONStorage(inMemory);

      const result = await safe.getItem('test-broken');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // 6. Storage Adapter Unit Integrity & Zero External Dependencies
  // =========================================================================
  describe('6. Storage Adapter Unit Integrity & Offline Zero-Dependency', () => {
    it('inMemoryStorage behaves as a synchronous key-value store with clean clearing', () => {
      const storage = new InMemoryStorage();
      storage.setItem('foo', 'bar');
      expect(storage.getItem('foo')).toBe('bar');
      expect(storage.getAllKeys()).toEqual(['foo']);

      storage.removeItem('foo');
      expect(storage.getItem('foo')).toBeNull();

      storage.setItem('k1', 'v1');
      storage.setItem('k2', 'v2');
      storage.clear();
      expect(storage.getAllKeys()).toEqual([]);
    });

    it('asyncStorageAdapter catches setItem and removeItem errors safely', async () => {
      const originalSetItem = AsyncStorage.setItem;
      const originalRemoveItem = AsyncStorage.removeItem;

      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Disk Full'));
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('Permission Denied'));

      // Should not throw unhandled exception
      await expect(asyncStorageAdapter.setItem('test-key', 'value')).resolves.not.toThrow();
      await expect(asyncStorageAdapter.removeItem('test-key')).resolves.not.toThrow();

      AsyncStorage.setItem = originalSetItem;
      AsyncStorage.removeItem = originalRemoveItem;
    });

    it('operates 100% offline with zero network calls', async () => {
      const fetchSpy = jest.fn();
      (global as any).fetch = fetchSpy;

      useRoutineStore.getState().addTemplate({
        id: 'template-offline-test',
        name: 'Offline Routine',
        assignedDays: [],
        wakeTime: '07:00',
        bedtime: '23:00',
        defaultBufferMinutes: 5,
        overflowStrategy: 'hybrid',
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
        fixedActivities: [],
        flexibleActivities: [],
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
