/**
 * TransitionModal Component
 * 
 * Fullscreen un-dismissible transition alert modal.
 * Enforces Zero-Snooze Policy: Single primary CTA "รับทราบแล้ว".
 * Cancels notification queue and audio alarm upon acknowledgment.
 */

import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useActiveStateStore } from '../store/activeStateStore';
import { audioService } from '../services/audioService';
import { cancelNaggingAlerts } from '../services/notifications';
import { ScheduledBlock } from '../types';

export interface TransitionModalProps {
  visible?: boolean;
  currentBlock?: ScheduledBlock | null;
  nextBlock?: ScheduledBlock | null;
  notificationIds?: string[];
  onAcknowledge?: () => void | Promise<void>;
  testID?: string;
}

export const TransitionModal: React.FC<TransitionModalProps> = ({
  visible: propVisible,
  currentBlock: propCurrentBlock,
  nextBlock: propNextBlock,
  notificationIds: propNotificationIds,
  onAcknowledge,
  testID = 'transition-modal',
}) => {
  // Store bindings
  const storeIsTransitionActive = useActiveStateStore((s) => s.isTransitionActive);
  const storeTransitionBlock = useActiveStateStore((s) => s.transitionBlock);
  const storeNextBlock = useActiveStateStore((s) => s.nextBlock);
  const storeActiveNotificationIds = useActiveStateStore((s) => s.activeNotificationIds);
  const acknowledgeTransition = useActiveStateStore((s) => s.acknowledgeTransition);

  const isVisible = propVisible !== undefined ? propVisible : storeIsTransitionActive;
  const activeBlock = propCurrentBlock !== undefined ? propCurrentBlock : storeTransitionBlock;
  const upcomingBlock = propNextBlock !== undefined ? propNextBlock : storeNextBlock;
  const activeNotifIds = propNotificationIds !== undefined ? propNotificationIds : storeActiveNotificationIds;

  // Intercept Android hardware back button: Strictly prevent dismiss
  useEffect(() => {
    if (!isVisible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // Consumes event, preventing modal dismiss
    });
    return () => backHandler.remove();
  }, [isVisible]);

  // Start looping foreground audio alarm and rhythmic haptics when modal becomes visible
  useEffect(() => {
    if (!isVisible) return;
    audioService.startTransitionAlert().catch(() => {});
    return () => {
      audioService.stopTransitionAlert().catch(() => {});
    };
  }, [isVisible]);

  const handleAcknowledge = async () => {
    try {
      // 1. Stop audio alert and foreground vibration loop
      await audioService.stopTransitionAlert();
    } catch {
      // Graceful error silence
    }

    try {
      // 2. Cancel all 15 scheduled local nagging notifications
      if (activeBlock?.id) {
        await cancelNaggingAlerts(activeBlock.id);
      } else if (activeNotifIds && activeNotifIds.length > 0) {
        await cancelNaggingAlerts('active-transition');
      }
    } catch {
      // Graceful error silence
    }

    // 3. Update runtime state to exit modal and start 10s countdown
    acknowledgeTransition();

    // 4. Trigger caller callback if supplied
    if (onAcknowledge) {
      await onAcknowledge();
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent={false}
      onRequestClose={() => {
        // Strictly no-op: user cannot dismiss via swipe or back gesture
      }}
      statusBarTranslucent
      testID={testID}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />
        <View style={styles.container}>
          {/* Urgent Warning Header */}
          <View style={styles.header}>
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>⏰ หมดเวลาแล้ว!</Text>
            </View>
            <Text style={styles.headerTitle}>ช่วงเวลาปรับเปลี่ยนกิจกรรม</Text>
            <Text style={styles.headerSubtitle}>
              ถึงเวลาหยุดกิจกรรมปัจจุบันและเตรียมพร้อมสำหรับกิจกรรมถัดไป
            </Text>
          </View>

          {/* Expired Activity Hero Card */}
          <View style={styles.expiredCard} testID="transition-expired-card">
            <Text style={styles.expiredCardLabel}>กิจกรรมที่สิ้นสุด</Text>
            <View style={styles.cardContent}>
              <Text style={styles.activityEmoji}>
                {activeBlock?.categoryEmoji || '⏳'}
              </Text>
              <View style={styles.cardDetails}>
                <Text style={styles.activityTitle} numberOfLines={2}>
                  {activeBlock?.title || 'กิจกรรมปัจจุบัน'}
                </Text>
                <Text style={styles.activityTime}>
                  {activeBlock ? `${activeBlock.startTime} - ${activeBlock.endTime} น.` : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Next Activity Preview Peek Card */}
          <View style={styles.nextCard} testID="transition-next-card">
            <Text style={styles.nextCardLabel}>➡️ กิจกรรมถัดไปของคุณ</Text>
            <View style={styles.cardContent}>
              <Text style={styles.nextEmoji}>
                {upcomingBlock?.categoryEmoji || '🎯'}
              </Text>
              <View style={styles.cardDetails}>
                <Text style={styles.nextTitle} numberOfLines={2}>
                  {upcomingBlock?.title || 'เวลาอิสระ / พักผ่อน'}
                </Text>
                <Text style={styles.nextTime}>
                  {upcomingBlock
                    ? `เริ่ม ${upcomingBlock.startTime} น.`
                    : 'ไม่มีกิจกรรมหลังจากนี้'}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Footer: Single Primary CTA "รับทราบแล้ว" (Zero Snooze) */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.acknowledgeButton}
              onPress={handleAcknowledge}
              activeOpacity={0.8}
              testID="transition-acknowledge-button"
              accessibilityRole="button"
              accessibilityLabel="รับทราบแล้ว"
            >
              <Text style={styles.acknowledgeButtonText}>รับทราบแล้ว</Text>
            </TouchableOpacity>
            <Text style={styles.zeroSnoozeHint}>
              กดยืนยันเพื่อหยุดเสียงเตือนและเริ่มช่วงปรับเปลี่ยน 10 วินาที
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 20,
    backgroundColor: '#0B0F19',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  alertBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  alertBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  expiredCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    marginVertical: 12,
  },
  expiredCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  nextCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  nextCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityEmoji: {
    fontSize: 38,
    marginRight: 16,
  },
  nextEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  cardDetails: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 14,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  nextTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 4,
  },
  nextTime: {
    fontSize: 13,
    color: '#94A3B8',
  },
  footer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  acknowledgeButton: {
    backgroundColor: '#EF4444',
    width: '100%',
    height: 58,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  acknowledgeButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  zeroSnoozeHint: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 12,
  },
});
