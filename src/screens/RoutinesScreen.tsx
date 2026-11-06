import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { TemplateEditor } from '../components';
import { calculateSchedule } from '../engine/scheduler';
import { useActiveStateStore } from '../store/activeStateStore';
import { useRoutineStore } from '../store/routineStore';
import { useScheduleStore } from '../store/scheduleStore';
import { RoutineTemplate } from '../types';

export const RoutinesScreen: React.FC = () => {
  const templates = useRoutineStore((s) => s.templates);
  const activeTemplateId = useRoutineStore((s) => s.activeTemplateId);
  const setActiveTemplate = useRoutineStore((s) => s.setActiveTemplate);
  const updateTemplate = useRoutineStore((s) => s.updateTemplate);
  const addTemplate = useRoutineStore((s) => s.addTemplate);
  const resetToDefaults = useRoutineStore((s) => s.resetToDefaults);

  const activeDate = useScheduleStore((s) => s.activeDate);
  const setDaySchedule = useScheduleStore((s) => s.setDaySchedule);
  const syncWithCurrentTime = useActiveStateStore((s) => s.syncWithCurrentTime);

  const currentTemplate =
    templates.find((t) => t.id === activeTemplateId) ?? templates[0];

  const handleSelectTemplate = (id: string) => {
    setActiveTemplate(id);
    const chosen = useRoutineStore.getState().getTemplateById(id);
    if (chosen) {
      const recalculated = calculateSchedule(chosen, activeDate);
      setDaySchedule(activeDate, recalculated);
      syncWithCurrentTime(activeDate, recalculated);
    }
  };

  const handleUpdateTemplate = (
    id: string,
    updates: Partial<Omit<RoutineTemplate, 'id' | 'createdAt'>>
  ): boolean => {
    const ok = updateTemplate(id, updates);
    if (ok) {
      const updated = useRoutineStore.getState().getTemplateById(id);
      if (updated) {
        const recalculated = calculateSchedule(updated, activeDate);
        setDaySchedule(activeDate, recalculated);
        syncWithCurrentTime(activeDate, recalculated);
      }
    }
    return ok;
  };

  const handleCreateCustomTemplate = () => {
    const created = addTemplate({
      name: `Custom Routine ${templates.length + 1}`,
      assignedDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      wakeTime: '07:30',
      bedtime: '23:30',
      defaultBufferMinutes: 10,
      overflowStrategy: 'hybrid',
      fixedActivities: [],
      flexibleActivities: [
        {
          id: `flex-custom-${Date.now()}`,
          title: 'อ่านหนังสือ / พัฒนาตัวเอง',
          estimatedDuration: 30,
          minDuration: 15,
          priority: 'high',
          energyLevel: 'medium',
          categoryEmoji: '🚀',
        },
      ],
    });
    handleSelectTemplate(created.id);
  };

  return (
    <ScrollView
      testID="routines-screen"
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.screenTitle}>แม่แบบรูทีน (Routines)</Text>
          <Text style={styles.subText}>
            ตั้งครั้งเดียว ระบบจัดตารางรายวันให้อัตโนมัติ
          </Text>
        </View>
        <TouchableOpacity
          testID="btn-reset-defaults"
          style={styles.resetBtn}
          onPress={resetToDefaults}
        >
          <Text style={styles.resetBtnText}>รีเซ็ตค่าเริ่มต้น</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.selectorRow}>
        {templates.map((tpl) => {
          const isSelected = tpl.id === currentTemplate?.id;
          return (
            <TouchableOpacity
              key={tpl.id}
              testID={`select-template-${tpl.id}`}
              style={[
                styles.templateTab,
                isSelected && styles.templateTabSelected,
              ]}
              onPress={() => handleSelectTemplate(tpl.id)}
            >
              <Text
                style={[
                  styles.templateTabText,
                  isSelected && styles.templateTabTextSelected,
                ]}
              >
                {tpl.name}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          testID="btn-add-custom-template"
          style={styles.addTemplateTab}
          onPress={handleCreateCustomTemplate}
        >
          <Text style={styles.addTemplateTabText}>+ สร้างรูทีนใหม่</Text>
        </TouchableOpacity>
      </View>

      {currentTemplate && (
        <TemplateEditor
          key={currentTemplate.id}
          template={currentTemplate}
          onUpdateTemplate={handleUpdateTemplate}
        />
      )}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    marginTop: 2,
  },
  resetBtn: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  templateTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  templateTabSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  templateTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  templateTabTextSelected: {
    color: '#ffffff',
  },
  addTemplateTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
  },
  addTemplateTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
