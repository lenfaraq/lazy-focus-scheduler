import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityPriority,
  EnergyLevel,
  FixedActivity,
  FlexibleActivity,
  OverflowStrategy,
  RoutineTemplate,
} from '../types';

export interface TemplateEditorProps {
  template: RoutineTemplate;
  onUpdateTemplate: (
    id: string,
    updates: Partial<Omit<RoutineTemplate, 'id' | 'createdAt'>>
  ) => boolean;
  testID?: string;
}

const BUFFER_OPTIONS = [5, 10, 15];
const OVERFLOW_OPTIONS: { value: OverflowStrategy; label: string }[] = [
  { value: 'hybrid', label: 'สมดุล (Hybrid)' },
  { value: 'drop_low_priority', label: 'ตัดงานสำคัญน้อย' },
  { value: 'proportional_scale', label: 'ย่อเวลาตามสัดส่วน' },
];

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  template,
  onUpdateTemplate,
  testID = 'template-editor',
}) => {
  const [wakeInput, setWakeInput] = useState(template.wakeTime);
  const [bedtimeInput, setBedtimeInput] = useState(template.bedtime);

  // New Fixed Activity state
  const [newFixedTitle, setNewFixedTitle] = useState('');
  const [newFixedStart, setNewFixedStart] = useState('13:00');
  const [newFixedEnd, setNewFixedEnd] = useState('14:00');

  // New Flexible Activity state
  const [newFlexTitle, setNewFlexTitle] = useState('');
  const [newFlexDuration, setNewFlexDuration] = useState('45');
  const [newFlexMinDuration, setNewFlexMinDuration] = useState('20');
  const [newFlexPriority, setNewFlexPriority] =
    useState<ActivityPriority>('medium');
  const [newFlexEnergy, setNewFlexEnergy] = useState<EnergyLevel>('medium');

  const handleSaveSleepWindow = () => {
    onUpdateTemplate(template.id, {
      wakeTime: wakeInput.trim(),
      bedtime: bedtimeInput.trim(),
    });
  };

  const handleBufferSelect = (minutes: number) => {
    onUpdateTemplate(template.id, { defaultBufferMinutes: minutes });
  };

  const handleOverflowSelect = (strategy: OverflowStrategy) => {
    onUpdateTemplate(template.id, { overflowStrategy: strategy });
  };

  const handleAddFixedActivity = () => {
    if (!newFixedTitle.trim()) return;
    const newFixed: FixedActivity = {
      id: `fixed-${Date.now()}`,
      title: newFixedTitle.trim(),
      startTime: newFixedStart.trim(),
      endTime: newFixedEnd.trim(),
      categoryEmoji: '📌',
      bufferMinutes: template.defaultBufferMinutes,
      isLocked: true,
    };
    const ok = onUpdateTemplate(template.id, {
      fixedActivities: [...template.fixedActivities, newFixed],
    });
    if (ok) {
      setNewFixedTitle('');
    }
  };

  const handleRemoveFixedActivity = (fixedId: string) => {
    onUpdateTemplate(template.id, {
      fixedActivities: template.fixedActivities.filter((a) => a.id !== fixedId),
    });
  };

  const handleAddFlexibleActivity = () => {
    if (!newFlexTitle.trim()) return;
    const est = Math.max(5, parseInt(newFlexDuration, 10) || 30);
    const min = Math.max(5, Math.min(est, parseInt(newFlexMinDuration, 10) || 15));
    const newFlex: FlexibleActivity = {
      id: `flex-${Date.now()}`,
      title: newFlexTitle.trim(),
      estimatedDuration: est,
      minDuration: min,
      priority: newFlexPriority,
      energyLevel: newFlexEnergy,
      categoryEmoji: '⚡',
    };
    const ok = onUpdateTemplate(template.id, {
      flexibleActivities: [...template.flexibleActivities, newFlex],
    });
    if (ok) {
      setNewFlexTitle('');
    }
  };

  const handleRemoveFlexibleActivity = (flexId: string) => {
    onUpdateTemplate(template.id, {
      flexibleActivities: template.flexibleActivities.filter(
        (a) => a.id !== flexId
      ),
    });
  };

  return (
    <View testID={testID} style={styles.container}>
      {/* Wake & Bedtime Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌙 เวลาตื่น &amp; เวลานอน (ล็อกเวลาพักผ่อน)</Text>
        <View style={styles.rowInputs}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>เวลาตื่น (HH:mm)</Text>
            <TextInput
              testID="input-wake-time"
              style={styles.input}
              value={wakeInput}
              onChangeText={setWakeInput}
              placeholder="07:00"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>เวลานอน (HH:mm)</Text>
            <TextInput
              testID="input-bed-time"
              style={styles.input}
              value={bedtimeInput}
              onChangeText={setBedtimeInput}
              placeholder="23:30"
            />
          </View>
          <TouchableOpacity
            testID="btn-save-sleep"
            style={styles.saveSmallBtn}
            onPress={handleSaveSleepWindow}
          >
            <Text style={styles.saveSmallBtnText}>บันทึก</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transition Buffer Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>☕ เวลาพักเปลี่ยนผ่านระหว่างกิจกรรม</Text>
        <View style={styles.pillsRow}>
          {BUFFER_OPTIONS.map((mins) => {
            const selected = template.defaultBufferMinutes === mins;
            return (
              <TouchableOpacity
                key={mins}
                testID={`buffer-option-${mins}`}
                style={[styles.pill, selected && styles.pillSelected]}
                onPress={() => handleBufferSelect(mins)}
              >
                <Text
                  style={[styles.pillText, selected && styles.pillTextSelected]}
                >
                  {mins} นาที
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Overflow Strategy */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📐 การจัดการเมื่อเวลากิจกรรมล้นช่องว่าง</Text>
        <View style={styles.pillsRow}>
          {OVERFLOW_OPTIONS.map((opt) => {
            const selected = template.overflowStrategy === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                testID={`overflow-option-${opt.value}`}
                style={[styles.pill, selected && styles.pillSelected]}
                onPress={() => handleOverflowSelect(opt.value)}
              >
                <Text
                  style={[styles.pillText, selected && styles.pillTextSelected]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Fixed Activities */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          🔒 กิจกรรมเวลาตายตัว ({template.fixedActivities.length})
        </Text>
        {template.fixedActivities.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle}>
                {item.categoryEmoji || '🔒'} {item.title}
              </Text>
              <Text style={styles.itemMeta}>
                {item.startTime} - {item.endTime}
              </Text>
            </View>
            <TouchableOpacity
              testID={`remove-fixed-${item.id}`}
              style={styles.deleteBtn}
              onPress={() => handleRemoveFixedActivity(item.id)}
            >
              <Text style={styles.deleteBtnText}>ลบ</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addBox}>
          <TextInput
            testID="input-new-fixed-title"
            style={styles.input}
            value={newFixedTitle}
            onChangeText={setNewFixedTitle}
            placeholder="ชื่อกิจกรรมที่ล็อกเวลา (เช่น เรียน, ทำงาน)"
          />
          <View style={styles.rowInputs}>
            <TextInput
              testID="input-new-fixed-start"
              style={[styles.input, styles.flex1]}
              value={newFixedStart}
              onChangeText={setNewFixedStart}
              placeholder="เริ่ม 13:00"
            />
            <TextInput
              testID="input-new-fixed-end"
              style={[styles.input, styles.flex1]}
              value={newFixedEnd}
              onChangeText={setNewFixedEnd}
              placeholder="จบ 14:00"
            />
            <TouchableOpacity
              testID="btn-add-fixed"
              style={styles.addBtn}
              onPress={handleAddFixedActivity}
            >
              <Text style={styles.addBtnText}>+ เพิ่มงานล็อกเวลา</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Flexible Activities Pool */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          ⚡ กิจกรรมยืดหยุ่น — จัดลงช่องว่างอัตโนมัติ ({template.flexibleActivities.length})
        </Text>
        {template.flexibleActivities.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle}>
                {item.categoryEmoji || '⚡'} {item.title}
              </Text>
              <Text style={styles.itemMeta}>
                {item.estimatedDuration} นาที (ขั้นต่ำ {item.minDuration}น.) • สำคัญ:{' '}
                {item.priority.toUpperCase()} • พลังงาน: {item.energyLevel}
              </Text>
            </View>
            <TouchableOpacity
              testID={`remove-flex-${item.id}`}
              style={styles.deleteBtn}
              onPress={() => handleRemoveFlexibleActivity(item.id)}
            >
              <Text style={styles.deleteBtnText}>ลบ</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addBox}>
          <TextInput
            testID="input-new-flex-title"
            style={styles.input}
            value={newFlexTitle}
            onChangeText={setNewFlexTitle}
            placeholder="ชื่อกิจกรรมยืดหยุ่น (เช่น เล่นเกม, ไถ TikTok, ออกกำลังกาย)"
          />
          <View style={styles.rowInputs}>
            <TextInput
              testID="input-new-flex-duration"
              style={[styles.input, styles.flex1]}
              value={newFlexDuration}
              onChangeText={setNewFlexDuration}
              keyboardType="numeric"
              placeholder="เวลา (นาที)"
            />
            <TextInput
              testID="input-new-flex-min-duration"
              style={[styles.input, styles.flex1]}
              value={newFlexMinDuration}
              onChangeText={setNewFlexMinDuration}
              keyboardType="numeric"
              placeholder="ขั้นต่ำ (นาที)"
            />
          </View>

          <View style={styles.pillsRow}>
            {(['high', 'medium', 'low'] as ActivityPriority[]).map((p) => (
              <TouchableOpacity
                key={p}
                testID={`select-priority-${p}`}
                style={[
                  styles.smallPill,
                  newFlexPriority === p && styles.pillSelected,
                ]}
                onPress={() => setNewFlexPriority(p)}
              >
                <Text
                  style={[
                    styles.smallPillText,
                    newFlexPriority === p && styles.pillTextSelected,
                  ]}
                >
                  สำคัญ: {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.pillsRow}>
            {(['high', 'medium', 'low'] as EnergyLevel[]).map((e) => (
              <TouchableOpacity
                key={e}
                testID={`select-energy-${e}`}
                style={[
                  styles.smallPill,
                  newFlexEnergy === e && styles.pillSelected,
                ]}
                onPress={() => setNewFlexEnergy(e)}
              >
                <Text
                  style={[
                    styles.smallPillText,
                    newFlexEnergy === e && styles.pillTextSelected,
                  ]}
                >
                  พลังงาน: {e}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            testID="btn-add-flex"
            style={styles.addBtn}
            onPress={handleAddFlexibleActivity}
          >
            <Text style={styles.addBtnText}>+ เพิ่มงานยืดหยุ่น</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  rowInputs: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  inputGroup: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  saveSmallBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveSmallBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  smallPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pillSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  smallPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  pillTextSelected: {
    color: '#ffffff',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  itemMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteBtnText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },
  addBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  addBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
