/**
 * Milestone 2 Unit Test Suite: Overflow Strategies & Deferral Backlog
 * Tests priority sorting, energy matching, drop_low_priority,
 * proportional_scale down to minDuration, hybrid resolution, and deferral backlog.
 */

import { resolveOverflow, sortFlexibleActivities } from '../../src/engine/overflowHandler';
import { GapInterval } from '../../src/engine/gapFinder';
import { FlexibleActivity } from '../../src/types';

describe('Milestone 2 — overflowHandler Suite', () => {
  const sampleActivities: FlexibleActivity[] = [
    {
      id: 'flex-p1-high-energy',
      title: 'Deep Coding',
      estimatedDuration: 90,
      minDuration: 45,
      priority: 'high',
      energyLevel: 'high',
    },
    {
      id: 'flex-p2-med-energy',
      title: 'Review PRs',
      estimatedDuration: 60,
      minDuration: 30,
      priority: 'medium',
      energyLevel: 'medium',
    },
    {
      id: 'flex-p3-low-energy',
      title: 'Tidy Desk',
      estimatedDuration: 30,
      minDuration: 15,
      priority: 'low',
      energyLevel: 'low',
    },
    {
      id: 'flex-p1-low-energy',
      title: 'Journaling',
      estimatedDuration: 30,
      minDuration: 15,
      priority: 'high',
      energyLevel: 'low',
    },
  ];

  // =========================================================================
  // 1. Priority Sorting & Energy Matching
  // =========================================================================
  describe('1. Priority Ranking & Energy Level Sorting', () => {
    it('ranks activities by Priority (High -> Medium -> Low)', () => {
      const sorted = sortFlexibleActivities(sampleActivities);
      const priorities = sorted.map((a) => a.priority);
      expect(priorities).toEqual(['high', 'high', 'medium', 'low']);
    });

    it('matches high-energy activities before low-energy activities within same priority tier', () => {
      const sorted = sortFlexibleActivities(sampleActivities);
      const highPrio = sorted.filter((a) => a.priority === 'high');
      expect(highPrio[0].energyLevel).toBe('high');
      expect(highPrio[1].energyLevel).toBe('low');
    });

    it('preserves stable insertion order when priority and energy are identical', () => {
      const identicalActivities: FlexibleActivity[] = [
        { id: '1', title: 'Task 1', estimatedDuration: 30, minDuration: 15, priority: 'medium', energyLevel: 'medium' },
        { id: '2', title: 'Task 2', estimatedDuration: 30, minDuration: 15, priority: 'medium', energyLevel: 'medium' },
      ];
      const sorted = sortFlexibleActivities(identicalActivities);
      expect(sorted.map((a) => a.id)).toEqual(['1', '2']);
    });
  });

  // =========================================================================
  // 2. Strategy: drop_low_priority
  // =========================================================================
  describe('2. Overflow Strategy: drop_low_priority', () => {
    it('defers low-priority items first when available gap time is insufficient', () => {
      // Total flexible: 90 + 60 + 30 + 30 = 210 min (+ buffers 4 * 5 = 20m -> 230m needed)
      // Available gap: only 140 min
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 620, durationMinutes: 140 },
      ];

      const result = resolveOverflow(sampleActivities, gaps, 'drop_low_priority', 5);

      // Low priority "Tidy Desk" must be dropped
      const droppedIds = result.deferredActivities.map((a) => a.id);
      expect(droppedIds).toContain('flex-p3-low-energy');

      // High priority tasks must be preserved
      const slottedIds = result.slottedActivities.map((s) => s.activity.id);
      expect(slottedIds).toContain('flex-p1-high-energy');
    });

    it('defers medium priority items if gaps still cannot fit high priority tasks', () => {
      // Total high priority: 90 + 30 + (2 * 5 buffer) = 130 min needed
      // Available gap: 135 min
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 615, durationMinutes: 135 },
      ];

      const result = resolveOverflow(sampleActivities, gaps, 'drop_low_priority', 5);
      const droppedIds = result.deferredActivities.map((a) => a.id);

      expect(droppedIds).toContain('flex-p3-low-energy');
      expect(droppedIds).toContain('flex-p2-med-energy');

      // Both high-priority tasks fit cleanly
      expect(result.slottedActivities).toHaveLength(2);
    });

    it('defers lowest-order high priority tasks when even high priority tasks exceed capacity', () => {
      // Gap: 80 min. High priority needs 90m + 30m.
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 560, durationMinutes: 80 },
      ];

      const result = resolveOverflow(sampleActivities, gaps, 'drop_low_priority', 5);
      const droppedIds = result.deferredActivities.map((a) => a.id);

      expect(droppedIds).toContain('flex-p1-high-energy'); // 90m task cannot fit in 80m gap
      expect(result.slottedActivities.some((s) => s.activity.id === 'flex-p1-low-energy')).toBe(true);
    });
  });

  // =========================================================================
  // 3. Strategy: proportional_scale
  // =========================================================================
  describe('3. Overflow Strategy: proportional_scale', () => {
    it('proportionally scales task durations down to fit available gaps', () => {
      // Two tasks: Task A (60m, min 30m), Task B (60m, min 30m). Total 120m (+ 10m buffers = 130m).
      // Gap available: 75m (65m for tasks, 10m for buffers -> ratio ~ 65/120 = 0.54)
      const tasks: FlexibleActivity[] = [
        { id: 't1', title: 'Task A', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'high' },
        { id: 't2', title: 'Task B', estimatedDuration: 60, minDuration: 30, priority: 'medium', energyLevel: 'medium' },
      ];
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 555, durationMinutes: 75 },
      ];

      const result = resolveOverflow(tasks, gaps, 'proportional_scale', 5);

      expect(result.deferredActivities).toHaveLength(0);
      expect(result.slottedActivities).toHaveLength(2);

      // Both scaled down to >= minDuration (30m)
      result.slottedActivities.forEach((slotted) => {
        expect(slotted.durationMinutes).toBeGreaterThanOrEqual(30);
        expect(slotted.durationMinutes).toBeLessThan(60);
        expect(slotted.scaleFactor).toBeDefined();
        expect(slotted.scaleFactor!).toBeLessThan(1.0);
      });
    });

    // EDGE CASE 11: Proportional Scaling Below Minimum Duration
    it('handles EC11: defers task rather than compressing below minDuration', () => {
      // Task 1: 60m with min 30m.
      // Task 2: 100m with min 80m.
      // Total 160m. Available gap: 60m.
      // Scaling ratio 60/160 = 0.375.
      // Task 2: 100 * 0.375 = 37.5m < minDuration (80m)!
      const tasks: FlexibleActivity[] = [
        { id: 't1', title: 'Task 1', estimatedDuration: 60, minDuration: 30, priority: 'high', energyLevel: 'high' },
        { id: 't2', title: 'Task 2', estimatedDuration: 100, minDuration: 80, priority: 'medium', energyLevel: 'medium' },
      ];
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 540, durationMinutes: 60 },
      ];

      const result = resolveOverflow(tasks, gaps, 'proportional_scale', 0);

      // Task 2 must be deferred to backlog because it cannot be compressed below 80m
      expect(result.deferredActivities.some((a) => a.id === 't2')).toBe(true);

      // Task 1 receives full remaining gap capacity (bounded by estimatedDuration 60m)
      const slotted1 = result.slottedActivities.find((s) => s.activity.id === 't1');
      expect(slotted1).toBeDefined();
      expect(slotted1?.durationMinutes).toBe(60);
    });
  });

  // =========================================================================
  // 4. Strategy: hybrid (Default Strategy)
  // =========================================================================
  describe('4. Overflow Strategy: hybrid (Default)', () => {
    it('defers low-priority first; if remaining overflow <= 25%, proportionally scales medium/high', () => {
      // Task High: 60m (min 40m)
      // Task Med: 60m (min 40m)
      // Task Low: 30m (min 15m)
      // Available gap: 105m (+ buffers = 15m) -> 90m for tasks.
      // Step 1: Drop Low (30m). Remaining High + Med = 120m.
      // Gap for tasks = 95m (with 2 buffers). Overflow = 120 / 95 = 1.26 ~ <= 25% boundary.
      const tasks: FlexibleActivity[] = [
        { id: 'h1', title: 'High', estimatedDuration: 60, minDuration: 40, priority: 'high', energyLevel: 'high' },
        { id: 'm1', title: 'Med', estimatedDuration: 60, minDuration: 40, priority: 'medium', energyLevel: 'medium' },
        { id: 'l1', title: 'Low', estimatedDuration: 30, minDuration: 15, priority: 'low', energyLevel: 'low' },
      ];
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 585, durationMinutes: 105 },
      ];

      const result = resolveOverflow(tasks, gaps, 'hybrid', 5);

      // Low is dropped
      expect(result.deferredActivities.some((a) => a.id === 'l1')).toBe(true);

      // High and Med are compressed to fit into gap
      expect(result.slottedActivities.some((s) => s.activity.id === 'h1')).toBe(true);
      expect(result.slottedActivities.some((s) => s.activity.id === 'm1')).toBe(true);
      result.slottedActivities.forEach((s) => {
        expect(s.durationMinutes).toBeGreaterThanOrEqual(40); // >= minDuration
      });
    });

    it('defers medium-priority task when remaining overflow exceeds 25%', () => {
      // High: 100m (min 60m), Med: 100m (min 60m), Low: 30m
      // Gap: 90m. Even after dropping Low, 200m vs 90m is > 100% overflow (> 25%).
      // Medium must be deferred.
      const tasks: FlexibleActivity[] = [
        { id: 'h1', title: 'High Task', estimatedDuration: 100, minDuration: 60, priority: 'high', energyLevel: 'high' },
        { id: 'm1', title: 'Med Task', estimatedDuration: 100, minDuration: 60, priority: 'medium', energyLevel: 'medium' },
        { id: 'l1', title: 'Low Task', estimatedDuration: 30, minDuration: 15, priority: 'low', energyLevel: 'low' },
      ];
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 570, durationMinutes: 90 },
      ];

      const result = resolveOverflow(tasks, gaps, 'hybrid', 0);
      const droppedIds = result.deferredActivities.map((a) => a.id);

      expect(droppedIds).toContain('l1');
      expect(droppedIds).toContain('m1');
      expect(result.slottedActivities.some((s) => s.activity.id === 'h1')).toBe(true);
    });
  });

  // =========================================================================
  // 5. Deferral Backlog Completeness
  // =========================================================================
  describe('5. Deferral Backlog Completeness', () => {
    it('preserves full flexible activity metadata on deferred tasks', () => {
      const gaps: GapInterval[] = [
        { startMinute: 480, endMinute: 510, durationMinutes: 30 },
      ];
      const result = resolveOverflow(sampleActivities, gaps, 'drop_low_priority', 5);

      expect(result.deferredActivities.length).toBeGreaterThan(0);
      result.deferredActivities.forEach((def) => {
        expect(def.id).toBeTruthy();
        expect(def.title).toBeTruthy();
        expect(def.estimatedDuration).toBeGreaterThan(0);
        expect(def.priority).toBeTruthy();
      });
    });

    // EDGE CASE 6: 100% Fixed Day (Zero Gaps)
    it('handles EC6: zero available gaps cleanly defers 100% of flexible activities', () => {
      const gaps: GapInterval[] = []; // Zero gap time
      const result = resolveOverflow(sampleActivities, gaps, 'hybrid', 5);

      expect(result.slottedActivities).toHaveLength(0);
      expect(result.deferredActivities).toHaveLength(sampleActivities.length);
    });
  });
});
