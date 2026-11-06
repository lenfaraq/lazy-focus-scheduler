import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScheduledBlock } from '../types';

export interface HeroCardProps {
  currentBlock: ScheduledBlock | null;
  remainingSeconds: number;
  progress: number;
  isBedtimeWindDown: boolean;
  onFinishEarly?: (blockId: string) => void;
  onSkip?: (blockId: string) => void;
  testID?: string;
}

export function formatCountdownTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const HeroCard: React.FC<HeroCardProps> = ({
  currentBlock,
  remainingSeconds,
  progress,
  isBedtimeWindDown,
  onFinishEarly,
  onSkip,
  testID = 'hero-card',
}) => {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const percentText = `${Math.round(clampedProgress * 100)}%`;

  if (!currentBlock || currentBlock.type === 'free') {
    return (
      <View
        testID={`${testID}-idle`}
        style={[
          styles.card,
          isBedtimeWindDown ? styles.cardWindDown : styles.cardIdle,
        ]}
      >
        {isBedtimeWindDown && (
          <View testID="wind-down-badge" style={styles.windDownBadge}>
            <Text style={styles.windDownBadgeText}>🌙 โหมดเตรียมเข้านอน</Text>
          </View>
        )}
        <Text style={styles.emoji}>☕</Text>
        <Text
          style={[
            styles.idleTitle,
            isBedtimeWindDown && styles.textWindDownPrimary,
          ]}
        >
          เวลาว่าง / พักผ่อนตามอัธยาศัย
        </Text>
        <Text
          style={[
            styles.idleSubtitle,
            isBedtimeWindDown && styles.textWindDownSecondary,
          ]}
        >
          {currentBlock
            ? `${currentBlock.startTime} - ${currentBlock.endTime} (${currentBlock.durationMinutes} นาที)`
            : 'ไม่มีกิจกรรมที่กำลังดำเนินการในขณะนี้'}
        </Text>
      </View>
    );
  }

  const isUrgent = remainingSeconds > 0 && remainingSeconds <= 300;
  const badgeLabel =
    currentBlock.type === 'fixed'
      ? '🔒 เวลาตายตัว (Fixed)'
      : currentBlock.type === 'bedtime'
        ? '🌙 เวลานอน (Bedtime)'
        : currentBlock.type === 'buffer'
          ? '⏳ พักเปลี่ยนผ่าน (Buffer)'
          : '⚡ ยืดหยุ่น (Flexible)';

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        isBedtimeWindDown && styles.cardWindDown,
        isUrgent && styles.cardUrgent,
      ]}
    >
      <View style={styles.topRow}>
        <View
          style={[
            styles.typeBadge,
            currentBlock.isLocked ? styles.lockedBadge : styles.flexibleBadge,
          ]}
        >
          <Text style={styles.typeBadgeText}>{badgeLabel}</Text>
        </View>
        {isBedtimeWindDown && (
          <View testID="wind-down-badge" style={styles.windDownBadge}>
            <Text style={styles.windDownBadgeText}>🌙 โหมดเตรียมเข้านอน</Text>
          </View>
        )}
      </View>

      <Text style={styles.emoji}>{currentBlock.categoryEmoji || '🎯'}</Text>
      <Text
        testID="hero-active-title"
        style={[
          styles.title,
          isBedtimeWindDown && styles.textWindDownPrimary,
        ]}
      >
        {currentBlock.title}
      </Text>
      <Text
        style={[
          styles.timeRange,
          isBedtimeWindDown && styles.textWindDownSecondary,
        ]}
      >
        {currentBlock.startTime} - {currentBlock.endTime} ({currentBlock.durationMinutes} นาที)
      </Text>

      <Text
        testID="hero-countdown-timer"
        style={[
          styles.timerText,
          isBedtimeWindDown && styles.textWindDownPrimary,
          isUrgent && styles.timerUrgent,
        ]}
      >
        {formatCountdownTime(remainingSeconds)}
      </Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View
            testID="hero-progress-fill"
            style={[
              styles.progressFill,
              { width: `${Math.round(clampedProgress * 100)}%` },
              isUrgent && styles.progressFillUrgent,
            ]}
          />
        </View>
        <Text
          style={[
            styles.progressLabel,
            isBedtimeWindDown && styles.textWindDownSecondary,
          ]}
        >
          ดำเนินการแล้ว {percentText}
        </Text>
      </View>

      {currentBlock.type !== 'bedtime' && (
        <View style={styles.controlsRow}>
          <TouchableOpacity
            testID="btn-finish-early"
            style={styles.finishButton}
            onPress={() => onFinishEarly?.(currentBlock.id)}
            accessibilityRole="button"
            accessibilityLabel="เสร็จก่อนเวลา"
          >
            <Text style={styles.finishButtonText}>✓ เสร็จก่อนเวลา</Text>
          </TouchableOpacity>

          {!currentBlock.isLocked && (
            <TouchableOpacity
              testID="btn-skip-block"
              style={styles.skipButton}
              onPress={() => onSkip?.(currentBlock.id)}
              accessibilityRole="button"
              accessibilityLabel="ข้าม"
            >
              <Text style={styles.skipButtonText}>⏭ ข้าม</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  cardIdle: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
  },
  cardWindDown: {
    backgroundColor: '#1e1b4b',
    borderColor: '#4338ca',
  },
  cardUrgent: {
    borderColor: '#ef4444',
    borderWidth: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  lockedBadge: {
    backgroundColor: '#dbeafe',
  },
  flexibleBadge: {
    backgroundColor: '#dcfce7',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  windDownBadge: {
    backgroundColor: '#312e81',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  windDownBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e0e7ff',
  },
  emoji: {
    fontSize: 48,
    marginVertical: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  idleTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 6,
  },
  idleSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  timeRange: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  timerText: {
    fontSize: 52,
    fontWeight: '900',
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
    marginVertical: 8,
  },
  timerUrgent: {
    color: '#ef4444',
  },
  progressContainer: {
    width: '100%',
    marginTop: 8,
    marginBottom: 20,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 999,
  },
  progressFillUrgent: {
    backgroundColor: '#ef4444',
  },
  progressLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 6,
  },
  controlsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  finishButton: {
    flex: 2,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  skipButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  skipButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
  },
  textWindDownPrimary: {
    color: '#f8fafc',
  },
  textWindDownSecondary: {
    color: '#a5b4fc',
  },
});
