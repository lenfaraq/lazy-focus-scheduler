import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScheduledBlock } from '../types';

export interface TimelineBlockCardProps {
  block: ScheduledBlock;
  isActive?: boolean;
  onToggleComplete?: (blockId: string) => void;
  testID?: string;
}

export const TimelineBlockCard: React.FC<TimelineBlockCardProps> = ({
  block,
  isActive = false,
  onToggleComplete,
  testID,
}) => {
  const isScaled =
    typeof block.scaleFactor === 'number' && block.scaleFactor < 1;

  const getTypeBadge = () => {
    switch (block.type) {
      case 'fixed':
        return { label: '🔒 ล็อกเวลา', style: styles.badgeFixed };
      case 'flexible':
        return { label: '⚡ จัดอัตโนมัติ', style: styles.badgeFlexible };
      case 'buffer':
        return { label: '☕ พักเปลี่ยนผ่าน', style: styles.badgeBuffer };
      case 'bedtime':
        return { label: '🌙 เวลานอน', style: styles.badgeBedtime };
      case 'free':
      default:
        return { label: '✨ เวลาว่าง', style: styles.badgeFree };
    }
  };

  const badge = getTypeBadge();

  return (
    <View
      testID={testID ?? `timeline-block-${block.id}`}
      style={[
        styles.card,
        block.type === 'fixed' && styles.cardFixed,
        block.type === 'flexible' && styles.cardFlexible,
        block.type === 'buffer' && styles.cardBuffer,
        block.type === 'bedtime' && styles.cardBedtime,
        block.type === 'free' && styles.cardFree,
        isActive && styles.cardActive,
        block.isCompleted && styles.cardCompleted,
      ]}
    >
      <View style={styles.timeColumn}>
        <Text
          style={[
            styles.timeStart,
            block.type === 'bedtime' && styles.textLight,
          ]}
        >
          {block.startTime}
        </Text>
        <Text
          style={[
            styles.timeEnd,
            block.type === 'bedtime' && styles.textLightMuted,
          ]}
        >
          {block.endTime}
        </Text>
        <Text
          style={[
            styles.durationText,
            block.type === 'bedtime' && styles.textLightMuted,
          ]}
        >
          {block.durationMinutes}น.
        </Text>
      </View>

      <View style={styles.mainColumn}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, badge.style]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
          {isActive && (
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>กำลังทำอยู่</Text>
            </View>
          )}
          {isScaled && (
            <View testID={`scaled-badge-${block.id}`} style={styles.scalePill}>
              <Text style={styles.scalePillText}>
                ย่อเวลา ({Math.round((block.scaleFactor ?? 1) * 100)}%)
              </Text>
            </View>
          )}
        </View>

        <Text
          style={[
            styles.title,
            block.type === 'bedtime' && styles.textLight,
            block.isCompleted && styles.titleCompleted,
          ]}
        >
          {block.categoryEmoji ? `${block.categoryEmoji} ` : ''}
          {block.title}
        </Text>

        {block.notes ? (
          <Text style={styles.notesText}>{block.notes}</Text>
        ) : null}
      </View>

      {block.type !== 'free' && block.type !== 'bedtime' && (
        <TouchableOpacity
          testID={`toggle-complete-${block.id}`}
          style={[
            styles.checkButton,
            block.isCompleted && styles.checkButtonCompleted,
          ]}
          onPress={() => onToggleComplete?.(block.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: block.isCompleted }}
        >
          <Text
            style={[
              styles.checkText,
              block.isCompleted && styles.checkTextCompleted,
            ]}
          >
            {block.isCompleted ? '✓' : '○'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardFixed: {
    borderLeftWidth: 5,
    borderLeftColor: '#2563eb',
    backgroundColor: '#f8fafc',
  },
  cardFlexible: {
    borderLeftWidth: 5,
    borderLeftColor: '#16a34a',
    backgroundColor: '#ffffff',
  },
  cardBuffer: {
    borderStyle: 'dashed',
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
    paddingVertical: 10,
  },
  cardBedtime: {
    backgroundColor: '#1e1b4b',
    borderColor: '#312e81',
  },
  cardFree: {
    backgroundColor: '#f8fafc',
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    opacity: 0.85,
  },
  cardActive: {
    borderColor: '#2563eb',
    borderWidth: 2,
  },
  cardCompleted: {
    opacity: 0.6,
  },
  timeColumn: {
    width: 64,
    marginRight: 12,
  },
  timeStart: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  timeEnd: {
    fontSize: 12,
    color: '#64748b',
  },
  durationText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  mainColumn: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeFixed: {
    backgroundColor: '#dbeafe',
  },
  badgeFlexible: {
    backgroundColor: '#dcfce7',
  },
  badgeBuffer: {
    backgroundColor: '#fef3c7',
  },
  badgeBedtime: {
    backgroundColor: '#312e81',
  },
  badgeFree: {
    backgroundColor: '#e2e8f0',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
  },
  activePill: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  scalePill: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  scalePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9a3412',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: '#64748b',
  },
  notesText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  textLight: {
    color: '#f8fafc',
  },
  textLightMuted: {
    color: '#a5b4fc',
  },
  checkButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  checkButtonCompleted: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  checkText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748b',
  },
  checkTextCompleted: {
    color: '#ffffff',
  },
});
