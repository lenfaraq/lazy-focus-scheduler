import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { HeroCard, PeekCard } from '../components';
import { calculateSchedule } from '../engine/scheduler';
import { useActiveStateStore } from '../store/activeStateStore';
import { useRoutineStore } from '../store/routineStore';
import { useScheduleStore } from '../store/scheduleStore';
import { DayOfWeek } from '../types';

function getCurrentDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[new Date().getDay()];
}

export const NowScreen: React.FC = () => {
  const activeTemplateId = useRoutineStore((s) => s.activeTemplateId);
  const templates = useRoutineStore((s) => s.templates);
  const getTemplateForDay = useRoutineStore((s) => s.getTemplateForDay);

  const activeDate = useScheduleStore((s) => s.activeDate);
  const schedules = useScheduleStore((s) => s.schedules);
  const setDaySchedule = useScheduleStore((s) => s.setDaySchedule);
  const completeBlockEarly = useScheduleStore((s) => s.completeBlockEarly);
  const skipBlock = useScheduleStore((s) => s.skipBlock);

  const currentBlock = useActiveStateStore((s) => s.currentBlock);
  const nextBlock = useActiveStateStore((s) => s.nextBlock);
  const remainingSeconds = useActiveStateStore((s) => s.remainingSeconds);
  const progress = useActiveStateStore((s) => s.progress);
  const isBedtimeWindDown = useActiveStateStore((s) => s.isBedtimeWindDown);
  const syncWithCurrentTime = useActiveStateStore((s) => s.syncWithCurrentTime);

  const activeTemplate =
    templates.find((t) => t.id === activeTemplateId) ??
    getTemplateForDay(getCurrentDayOfWeek());

  const currentSchedule = schedules[activeDate] ?? null;

  useEffect(() => {
    if (!currentSchedule && activeTemplate) {
      const generated = calculateSchedule(activeTemplate, activeDate);
      setDaySchedule(activeDate, generated);
      syncWithCurrentTime(activeDate, generated);
    } else if (currentSchedule) {
      syncWithCurrentTime(activeDate, currentSchedule);
    }
  }, [activeDate, activeTemplate, currentSchedule, setDaySchedule, syncWithCurrentTime]);

  const handleFinishEarly = (blockId: string) => {
    if (!currentSchedule || !activeTemplate) return;
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    completeBlockEarly(activeDate, blockId, currentMinute);
    const updatedSchedule = useScheduleStore.getState().getDaySchedule(activeDate);
    if (updatedSchedule) {
      const recalculated = calculateSchedule(activeTemplate, activeDate, {
        anchorMinute: currentMinute,
        existingBlocks: updatedSchedule.blocks,
      });
      setDaySchedule(activeDate, recalculated);
      syncWithCurrentTime(activeDate, recalculated, currentMinute, now.getSeconds());
    }
  };

  const handleSkip = (blockId: string) => {
    if (!currentSchedule || !activeTemplate) return;
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    skipBlock(activeDate, blockId);
    const updatedSchedule = useScheduleStore.getState().getDaySchedule(activeDate);
    if (updatedSchedule) {
      const recalculated = calculateSchedule(activeTemplate, activeDate, {
        anchorMinute: currentMinute,
        existingBlocks: updatedSchedule.blocks,
      });
      setDaySchedule(activeDate, recalculated);
      syncWithCurrentTime(activeDate, recalculated, currentMinute, now.getSeconds());
    }
  };

  return (
    <ScrollView
      testID="now-screen"
      style={[
        styles.container,
        isBedtimeWindDown && styles.containerWindDown,
      ]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.dateLabel,
            isBedtimeWindDown && styles.textWindDownSecondary,
          ]}
        >
          วันนี้ • {activeDate}
        </Text>
        <Text
          style={[
            styles.screenTitle,
            isBedtimeWindDown && styles.textWindDownPrimary,
          ]}
        >
          สิ่งที่ต้องทำตอนนี้
        </Text>
        {activeTemplate && (
          <Text
            style={[
              styles.templateSub,
              isBedtimeWindDown && styles.textWindDownSecondary,
            ]}
          >
            รูทีน: {activeTemplate.name} (นอน {activeTemplate.bedtime})
          </Text>
        )}
      </View>

      <HeroCard
        currentBlock={currentBlock}
        remainingSeconds={remainingSeconds}
        progress={progress}
        isBedtimeWindDown={isBedtimeWindDown}
        onFinishEarly={handleFinishEarly}
        onSkip={handleSkip}
      />

      <PeekCard
        nextBlock={nextBlock}
        isBedtimeWindDown={isBedtimeWindDown}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  containerWindDown: {
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
    marginBottom: 2,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0f172a',
  },
  templateSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  textWindDownPrimary: {
    color: '#f8fafc',
  },
  textWindDownSecondary: {
    color: '#a5b4fc',
  },
});
