import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScheduledBlock } from '../types';

export interface PeekCardProps {
  nextBlock: ScheduledBlock | null;
  isBedtimeWindDown?: boolean;
  testID?: string;
}

export const PeekCard: React.FC<PeekCardProps> = ({
  nextBlock,
  isBedtimeWindDown = false,
  testID = 'peek-card',
}) => {
  if (!nextBlock) {
    return (
      <View
        testID={`${testID}-empty`}
        style={[styles.card, isBedtimeWindDown && styles.cardWindDown]}
      >
        <Text
          style={[
            styles.headerLabel,
            isBedtimeWindDown && styles.textWindDownSecondary,
          ]}
        >
          ถัดไป (NEXT)
        </Text>
        <Text
          style={[
            styles.emptyText,
            isBedtimeWindDown && styles.textWindDownPrimary,
          ]}
        >
          ไม่มีกิจกรรมถัดไปในวันนี้
        </Text>
      </View>
    );
  }

  const isBuffer = nextBlock.type === 'buffer';

  return (
    <View
      testID={testID}
      style={[styles.card, isBedtimeWindDown && styles.cardWindDown]}
    >
      <View style={styles.headerRow}>
        <Text
          style={[
            styles.headerLabel,
            isBedtimeWindDown && styles.textWindDownSecondary,
          ]}
        >
          ถัดไป (NEXT)
        </Text>
        {isBuffer && (
          <View testID="peek-buffer-badge" style={styles.bufferBadge}>
            <Text style={styles.bufferBadgeText}>☕ พักเปลี่ยนผ่าน</Text>
          </View>
        )}
      </View>

      <View style={styles.contentRow}>
        <Text style={styles.emoji}>{nextBlock.categoryEmoji || '⏭'}</Text>
        <View style={styles.infoColumn}>
          <Text
            testID="peek-next-title"
            style={[
              styles.title,
              isBedtimeWindDown && styles.textWindDownPrimary,
            ]}
          >
            {nextBlock.title}
          </Text>
          <Text
            style={[
              styles.timeText,
              isBedtimeWindDown && styles.textWindDownSecondary,
            ]}
          >
            เริ่ม {nextBlock.startTime} - {nextBlock.endTime} ({nextBlock.durationMinutes} นาที)
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardWindDown: {
    backgroundColor: '#312e81',
    borderColor: '#4f46e5',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  bufferBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  bufferBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 28,
  },
  infoColumn: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  timeText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },
  textWindDownPrimary: {
    color: '#f8fafc',
  },
  textWindDownSecondary: {
    color: '#c7d2fe',
  },
});
