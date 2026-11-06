import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TimelineBlockCard } from '../components';
import { useActiveStateStore } from '../store/activeStateStore';
import { useScheduleStore } from '../store/scheduleStore';

export const TimelineScreen: React.FC = () => {
  const activeDate = useScheduleStore((s) => s.activeDate);
  const schedules = useScheduleStore((s) => s.schedules);
  const toggleBlockCompletion = useScheduleStore((s) => s.toggleBlockCompletion);
  const currentBlock = useActiveStateStore((s) => s.currentBlock);

  const schedule = schedules[activeDate] ?? null;
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!schedule) {
    return (
      <View testID="timeline-screen-empty" style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>ยังไม่มีตารางเวลาสำหรับวันนี้</Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID="timeline-screen"
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.screenTitle}>ตารางเวลาทั้งวัน</Text>
        <Text style={styles.subText}>
          ตื่น {schedule.wakeTime} • เข้านอน {schedule.bedtime} • จัดงานแล้ว{' '}
          {schedule.totalScheduledMinutes} นาที (ว่าง {schedule.totalFreeMinutes}{' '}
          นาที)
        </Text>
      </View>

      <View testID="current-time-indicator" style={styles.nowIndicator}>
        <View style={styles.nowDot} />
        <Text style={styles.nowIndicatorText}>เวลาปัจจุบัน {currentTimeStr}</Text>
        <View style={styles.nowLine} />
      </View>

      {schedule.deferredActivities.length > 0 && (
        <View testID="deferred-tasks-banner" style={styles.deferredBanner}>
          <Text style={styles.deferredTitle}>
            ⚠️ รายการที่ถูกเลื่อนเนื่องจากเวลาไม่พอ ({schedule.deferredActivities.length})
          </Text>
          {schedule.deferredActivities.map((item) => (
            <Text key={item.id} style={styles.deferredItem}>
              • {item.categoryEmoji || '⏳'} {item.title} ({item.estimatedDuration}{' '}
              นาที)
            </Text>
          ))}
        </View>
      )}

      <View style={styles.blocksList}>
        {schedule.blocks.map((block) => (
          <TimelineBlockCard
            key={block.id}
            block={block}
            isActive={currentBlock?.id === block.id}
            onToggleComplete={(blockId) =>
              toggleBlockCompletion(activeDate, blockId)
            }
          />
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f1f5f9',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  header: {
    marginBottom: 14,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
  },
  subText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  nowIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  nowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  nowIndicatorText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ef4444',
  },
  nowLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#fecaca',
  },
  deferredBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  deferredTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400e',
    marginBottom: 6,
  },
  deferredItem: {
    fontSize: 13,
    color: '#78350f',
    marginBottom: 2,
  },
  blocksList: {
    marginTop: 4,
  },
});
