/**
 * CountdownScreen Component
 * 
 * 10-Second Micro-Action Transition Countdown Screen.
 * Commands user to stand up, stretch, and break screen inertia.
 * Executes per-second haptic pulses and auto-advances at 0s.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  StatusBar,
} from 'react-native';
import { useActiveStateStore } from '../store/activeStateStore';
import { triggerTickHaptic, triggerCompleteHaptic } from '../services/audioService';
import { ScheduledBlock } from '../types';

export interface CountdownScreenProps {
  visible?: boolean;
  initialSeconds?: number;
  nextBlock?: ScheduledBlock | null;
  onComplete?: () => void;
  onTick?: (secondsLeft: number) => void;
  onSkip?: () => void;
  testID?: string;
}

export const CountdownScreen: React.FC<CountdownScreenProps> = ({
  visible: propVisible,
  initialSeconds,
  nextBlock: propNextBlock,
  onComplete,
  onTick,
  onSkip,
  testID = 'countdown-screen',
}) => {
  const storeIsCountdownActive = useActiveStateStore((s) => s.isCountdownActive);
  const storeCountdownSecondsLeft = useActiveStateStore((s) => s.countdownSecondsLeft);
  const storeNextBlock = useActiveStateStore((s) => s.nextBlock);
  const tickCountdown = useActiveStateStore((s) => s.tickCountdown);
  const completeCountdown = useActiveStateStore((s) => s.completeCountdown);

  const isVisible = propVisible !== undefined ? propVisible : storeIsCountdownActive;
  const upcomingBlock = propNextBlock !== undefined ? propNextBlock : storeNextBlock;

  // Local state for UI rendering in prop-driven mode
  const [localSeconds, setLocalSeconds] = useState<number | null>(
    initialSeconds !== undefined ? initialSeconds : null
  );

  // Ref to always maintain current seconds for timer ticks without re-creating effect
  const localSecondsRef = useRef<number | null>(
    initialSeconds !== undefined ? initialSeconds : null
  );

  // Guard flag preventing duplicate completions or intervals restarting when at 0
  const hasCompletedRef = useRef<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Store latest callbacks in refs to decouple timer effect from inline function references
  const onCompleteRef = useRef(onComplete);
  const onTickRef = useRef(onTick);
  const onSkipRef = useRef(onSkip);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  // Sync ref and state when initialSeconds prop updates
  useEffect(() => {
    if (initialSeconds !== undefined) {
      localSecondsRef.current = initialSeconds;
      setLocalSeconds(initialSeconds);
      if (initialSeconds > 0) {
        hasCompletedRef.current = false;
      }
    }
  }, [initialSeconds]);

  // Reset completion flag when modal becomes hidden or store activates new countdown
  useEffect(() => {
    if (!isVisible) {
      hasCompletedRef.current = false;
    }
  }, [isVisible]);

  useEffect(() => {
    if (storeIsCountdownActive) {
      hasCompletedRef.current = false;
    }
  }, [storeIsCountdownActive]);

  const secondsLeft = localSeconds !== null ? localSeconds : storeCountdownSecondsLeft;

  // Animation value for visual pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 1. Dedicated mount haptic effect: triggers once when screen becomes visible
  useEffect(() => {
    if (isVisible) {
      // Guard: do NOT fire initial tick haptic if already expired/non-positive
      if (localSecondsRef.current !== null && localSecondsRef.current <= 0) {
        return;
      }
      triggerTickHaptic().catch(() => {});
    }
  }, [isVisible]);

  // 2. Tick timer loop: strictly monotonic and decoupled from localSeconds state mutations
  useEffect(() => {
    // Guards: do NOT start timer if hidden, already at <= 0s, or already completed
    if (!isVisible) return;
    if (localSecondsRef.current !== null && localSecondsRef.current <= 0) return;
    if (hasCompletedRef.current) return;

    timerRef.current = setInterval(() => {
      // Pulse animation on each tick
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();

      const currentSeconds =
        localSecondsRef.current !== null
          ? localSecondsRef.current
          : useActiveStateStore.getState().countdownSecondsLeft;

      if (currentSeconds <= 1) {
        // Transition finished (0 seconds reached)
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        hasCompletedRef.current = true;
        triggerCompleteHaptic().catch(() => {});
        completeCountdown();
        if (localSecondsRef.current !== null) {
          localSecondsRef.current = 0;
          setLocalSeconds(0);
        }
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      } else {
        const nextSeconds = currentSeconds - 1;
        if (localSecondsRef.current !== null) {
          localSecondsRef.current = nextSeconds;
          setLocalSeconds(nextSeconds);
        } else {
          tickCountdown();
        }
        triggerTickHaptic().catch(() => {});
        if (onTickRef.current) {
          onTickRef.current(nextSeconds);
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    isVisible,
    initialSeconds,
    pulseAnim,
    tickCountdown,
    completeCountdown,
  ]);

  const handleSkip = () => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    triggerCompleteHaptic().catch(() => {});
    completeCountdown();
    if (localSecondsRef.current !== null) {
      localSecondsRef.current = 0;
      setLocalSeconds(0);
    }
    if (onSkipRef.current) {
      onSkipRef.current();
    } else if (onCompleteRef.current) {
      onCompleteRef.current();
    }
  };

  // Dynamic color shift based on time remaining
  const getRingColor = (sec: number) => {
    if (sec <= 3) return '#EF4444'; // Urgent Red
    if (sec <= 6) return '#F59E0B'; // Energetic Amber
    return '#38BDF8'; // Cool Cyan
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {}}
      statusBarTranslucent
      testID={testID}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />
        <View style={styles.container}>
          {/* Header & Prompt */}
          <View style={styles.header}>
            <Text style={styles.badgeText}>ช่วงเวลาปรับเปลี่ยน (10s Reset)</Text>
            <Text style={styles.promptHeadline}>
              วางมือถือลง ลุกขึ้นยืดเส้นยืดสาย
            </Text>
            <Text style={styles.promptBody}>
              ดื่มน้ำสักแก้ว ขยับร่างกาย แล้วเตรียมสมาธิสำหรับกิจกรรมถัดไป
            </Text>
          </View>

          {/* Central 10-to-0 Circular Countdown Display */}
          <View style={styles.timerContainer}>
            <Animated.View
              style={[
                styles.timerOuterRing,
                {
                  borderColor: getRingColor(secondsLeft),
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View style={styles.timerInnerCircle}>
                <Text
                  style={[styles.timerNumber, { color: getRingColor(secondsLeft) }]}
                  testID="countdown-timer-value"
                >
                  {secondsLeft}
                </Text>
                <Text style={styles.timerUnit}>วินาที</Text>
              </View>
            </Animated.View>

            {/* Segmented Progress Dots */}
            <View style={styles.dotsContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((dot) => (
                <View
                  key={dot}
                  style={[
                    styles.dot,
                    dot <= secondsLeft
                      ? { backgroundColor: getRingColor(secondsLeft) }
                      : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Next Activity Preview Peek */}
          <View style={styles.nextPreviewCard} testID="countdown-next-preview">
            <Text style={styles.nextPreviewLabel}>กิจกรรมถัดไปที่คุณต้องทำ:</Text>
            <View style={styles.nextPreviewContent}>
              <Text style={styles.nextPreviewEmoji}>
                {upcomingBlock?.categoryEmoji || '🚀'}
              </Text>
              <View style={styles.nextPreviewDetails}>
                <Text style={styles.nextPreviewTitle} numberOfLines={1}>
                  {upcomingBlock?.title || 'เวลาอิสระ / พักผ่อน'}
                </Text>
                <Text style={styles.nextPreviewSub}>
                  {upcomingBlock
                    ? `เริ่ม ${upcomingBlock.startTime} น.`
                    : 'ตามอัธยาศัย'}
                </Text>
              </View>
            </View>
          </View>

          {/* Early Bypass Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              activeOpacity={0.7}
              testID="countdown-skip-button"
              accessibilityRole="button"
              accessibilityLabel="พร้อมแล้ว เริ่มเลย"
            >
              <Text style={styles.skipButtonText}>พร้อมแล้ว เริ่มเลย ➔</Text>
            </TouchableOpacity>
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
    marginTop: 16,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  promptHeadline: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 32,
  },
  promptBody: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  timerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  timerOuterRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  timerInnerCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerNumber: {
    fontSize: 80,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    lineHeight: 88,
  },
  timerUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: -4,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotInactive: {
    backgroundColor: '#334155',
  },
  nextPreviewCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nextPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  nextPreviewContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextPreviewEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  nextPreviewDetails: {
    flex: 1,
  },
  nextPreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  nextPreviewSub: {
    fontSize: 13,
    color: '#38BDF8',
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#475569',
  },
  skipButtonText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
});
