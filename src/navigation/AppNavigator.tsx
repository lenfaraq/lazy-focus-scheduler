import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CountdownScreen, TransitionModal } from '../components';
import { NowScreen, RoutinesScreen, TimelineScreen } from '../screens';
import {
  endLiveActivity,
  scheduleNaggingAlerts,
  startLiveActivity,
  updateLiveActivity,
} from '../services';
import { useActiveStateStore } from '../store/activeStateStore';

export type AppTab = 'now' | 'timeline' | 'routines';

export interface AppNavigatorProps {
  initialTab?: AppTab;
}

export const AppNavigator: React.FC<AppNavigatorProps> = ({
  initialTab = 'now',
}) => {
  const [activeTab, setActiveTab] = useState<AppTab>(initialTab);

  const currentBlock = useActiveStateStore((s) => s.currentBlock);
  const nextBlock = useActiveStateStore((s) => s.nextBlock);
  const isTransitionActive = useActiveStateStore((s) => s.isTransitionActive);
  const transitionBlock = useActiveStateStore((s) => s.transitionBlock);
  const isBedtimeWindDown = useActiveStateStore((s) => s.isBedtimeWindDown);
  const tick = useActiveStateStore((s) => s.tick);

  const liveActivityIdRef = useRef<string | null>(null);

  // Global 1-second runtime timer tick
  useEffect(() => {
    const interval = setInterval(() => {
      tick();
    }, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  // Schedule 15-batch nagging notifications when transition becomes active
  useEffect(() => {
    if (isTransitionActive && transitionBlock) {
      scheduleNaggingAlerts(transitionBlock).catch(() => {});
    }
  }, [isTransitionActive, transitionBlock]);

  // Sync offline iOS Live Activity lifecycle with active block
  useEffect(() => {
    let isMounted = true;

    async function syncLiveActivity() {
      if (!currentBlock || currentBlock.type === 'free') {
        if (liveActivityIdRef.current) {
          await endLiveActivity(liveActivityIdRef.current);
          liveActivityIdRef.current = null;
        }
        return;
      }

      const now = new Date();
      const endDate = new Date(
        now.getTime() +
          Math.max(1, useActiveStateStore.getState().remainingSeconds) * 1000
      );
      const nextStartDate = new Date(endDate.getTime() + 5 * 60 * 1000);

      const payload = {
        routineId: currentBlock.id,
        activityName: currentBlock.title,
        emoji: currentBlock.categoryEmoji || '🎯',
        isFixed: currentBlock.isLocked,
        startDate: now,
        endDate,
        nextActivityName: nextBlock?.title || 'พักผ่อน',
        nextActivityStartDate: nextStartDate,
        isTransitionAlert: isTransitionActive,
      };

      if (!liveActivityIdRef.current) {
        const id = await startLiveActivity(payload);
        if (isMounted) {
          liveActivityIdRef.current = id;
        }
      } else {
        await updateLiveActivity(liveActivityIdRef.current, payload);
      }
    }

    syncLiveActivity();
    return () => {
      isMounted = false;
    };
  }, [currentBlock, nextBlock, isTransitionActive]);

  return (
    <SafeAreaView
      testID="app-navigator"
      style={[
        styles.safeArea,
        isBedtimeWindDown && styles.safeAreaWindDown,
      ]}
    >
      <View style={styles.screenContainer}>
        {activeTab === 'now' && <NowScreen />}
        {activeTab === 'timeline' && <TimelineScreen />}
        {activeTab === 'routines' && <RoutinesScreen />}
      </View>

      {/* Bottom Tab Bar */}
      <View
        testID="bottom-tab-bar"
        style={[
          styles.tabBar,
          isBedtimeWindDown && styles.tabBarWindDown,
        ]}
      >
        <TouchableOpacity
          testID="tab-btn-now"
          style={[
            styles.tabItem,
            activeTab === 'now' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('now')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'now' }}
        >
          <Text style={styles.tabIcon}>🎯</Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'now' && styles.tabLabelActive,
            ]}
          >
            ตอนนี้ (Now)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-btn-timeline"
          style={[
            styles.tabItem,
            activeTab === 'timeline' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('timeline')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'timeline' }}
        >
          <Text style={styles.tabIcon}>📅</Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'timeline' && styles.tabLabelActive,
            ]}
          >
            ตารางเวลา (Timeline)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-btn-routines"
          style={[
            styles.tabItem,
            activeTab === 'routines' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('routines')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'routines' }}
        >
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'routines' && styles.tabLabelActive,
            ]}
          >
            รูทีน (Routines)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Global Unignorable Transition Enforcer Overlays */}
      <TransitionModal />
      <CountdownScreen />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  safeAreaWindDown: {
    backgroundColor: '#0f172a',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tabBarWindDown: {
    backgroundColor: '#1e1b4b',
    borderTopColor: '#312e81',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12,
  },
  tabItemActive: {
    backgroundColor: '#eff6ff',
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabLabelActive: {
    color: '#2563eb',
    fontWeight: '800',
  },
});
