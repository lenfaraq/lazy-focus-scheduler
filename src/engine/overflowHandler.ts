/**
 * Lazy Focus & Smart Routine Scheduler
 * Overflow Resolution & Flexible Task Prioritization Engine
 *
 * Implements:
 * 1. Priority ranking (High -> Medium -> Low).
 * 2. Energy-to-gap matching (High energy to early peak slots, low energy to evening wind-down).
 * 3. Three overflow resolution strategies:
 *    - drop_low_priority: Drops lowest-priority tasks until remaining fit.
 *    - proportional_scale: Compresses durations down to minDuration; defers if below minDuration.
 *    - hybrid: Drops low-priority first; compresses medium/high if overflow <= 25%; else drops medium.
 */

import {
  FlexibleActivity,
  ActivityPriority,
  EnergyLevel,
  OverflowStrategy,
} from '../types';
import { GapInterval } from './gapFinder';

export interface SlottedActivityPlan {
  activity: FlexibleActivity;
  plannedDuration: number;
  durationMinutes: number; // alias for compatibility
  originalDuration: number;
  originalDurationMinutes: number; // alias for compatibility
  scaleFactor: number;
  isCompressed: boolean;
}

export type SlottedTaskPlan = SlottedActivityPlan;

export type DeferralReason =
  | 'low_priority_dropped'
  | 'medium_priority_dropped'
  | 'high_priority_dropped'
  | 'below_min_duration'
  | 'insufficient_gap_capacity';

export interface DeferredTaskPlan {
  activity: FlexibleActivity;
  reason: DeferralReason;
  detail: string;
}

export interface OverflowResolutionResult {
  slottedActivities: SlottedActivityPlan[];
  slottedTasks: SlottedActivityPlan[]; // alias
  deferredActivities: FlexibleActivity[];
  deferredTasks: DeferredTaskPlan[];
  totalRequiredMinutes: number;
  totalAllocatedMinutes: number;
  availableGapMinutes: number;
  overflowMinutes: number;
  strategyUsed: OverflowStrategy;
}

const PRIORITY_WEIGHTS: Record<ActivityPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const ENERGY_WEIGHTS: Record<EnergyLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Sorts flexible activities primarily by priority (high -> medium -> low),
 * secondarily by energy level (high -> medium -> low) to direct high energy
 * to earlier morning slots, preserving original order for ties.
 */
export function sortFlexibleActivities(tasks: FlexibleActivity[]): FlexibleActivity[] {
  return [...tasks].sort((a, b) => {
    const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    const energyDiff = ENERGY_WEIGHTS[b.energyLevel] - ENERGY_WEIGHTS[a.energyLevel];
    if (energyDiff !== 0) return energyDiff;

    return 0;
  });
}

export const sortFlexibleTasks = sortFlexibleActivities;

/**
 * Calculates total estimated duration for a set of flexible activities.
 */
export function calculateTotalDuration(tasks: FlexibleActivity[]): number {
  return tasks.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);
}

function createSlottedPlan(
  activity: FlexibleActivity,
  plannedDuration: number,
  originalDuration: number
): SlottedActivityPlan {
  const scaleFactor = Math.round((plannedDuration / originalDuration) * 100) / 100;
  return {
    activity,
    plannedDuration,
    durationMinutes: plannedDuration,
    originalDuration,
    originalDurationMinutes: originalDuration,
    scaleFactor,
    isCompressed: plannedDuration < originalDuration,
  };
}

/**
 * Strategy A: Drop Low Priority
 * Drops low-priority tasks, then medium-priority tasks until the remaining tasks
 * fit within available gap capacity (accounting for transition buffers).
 */
export function resolveDropLowPriority(
  tasks: FlexibleActivity[],
  capacity: number,
  bufferMinutes: number = 0
): OverflowResolutionResult {
  const totalRequired = calculateTotalDuration(tasks);

  if (capacity <= 0 || tasks.length === 0) {
    const deferredTasks: DeferredTaskPlan[] = tasks.map((t) => ({
      activity: t,
      reason: 'insufficient_gap_capacity',
      detail: 'No gap time available in the schedule.',
    }));
    return {
      slottedActivities: [],
      slottedTasks: [],
      deferredActivities: tasks,
      deferredTasks,
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: 0,
      availableGapMinutes: capacity,
      overflowMinutes: totalRequired,
      strategyUsed: 'drop_low_priority',
    };
  }

  const sorted = sortFlexibleActivities(tasks);
  const totalNeededWithBuffers = totalRequired + sorted.length * bufferMinutes;

  if (totalNeededWithBuffers <= capacity) {
    const slotted = sorted.map((t) => createSlottedPlan(t, t.estimatedDuration, t.estimatedDuration));
    return {
      slottedActivities: slotted,
      slottedTasks: slotted,
      deferredActivities: [],
      deferredTasks: [],
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: totalRequired,
      availableGapMinutes: capacity,
      overflowMinutes: 0,
      strategyUsed: 'drop_low_priority',
    };
  }

  // Partition by priority
  const highTasks = sorted.filter((t) => t.priority === 'high');
  const mediumTasks = sorted.filter((t) => t.priority === 'medium');
  const lowTasks = sorted.filter((t) => t.priority === 'low');

  const highNeeded = calculateTotalDuration(highTasks) + highTasks.length * bufferMinutes;

  const slotted: SlottedActivityPlan[] = [];
  const deferredTasks: DeferredTaskPlan[] = [];

  if (highNeeded > capacity) {
    // Even high-priority tasks cannot all fit! Drop all low and medium
    for (const l of lowTasks) {
      deferredTasks.push({
        activity: l,
        reason: 'low_priority_dropped',
        detail: 'Dropped to fit schedule within available waking gaps.',
      });
    }
    for (const m of mediumTasks) {
      deferredTasks.push({
        activity: m,
        reason: 'medium_priority_dropped',
        detail: 'Dropped to protect high-priority tasks and bedtime cutoff.',
      });
    }

    // Greedily slot high tasks that fit
    let remainingCapacity = capacity;
    for (const h of highTasks) {
      const neededForH = h.estimatedDuration + bufferMinutes;
      if (neededForH <= remainingCapacity) {
        slotted.push(createSlottedPlan(h, h.estimatedDuration, h.estimatedDuration));
        remainingCapacity -= neededForH;
      } else {
        deferredTasks.push({
          activity: h,
          reason: 'high_priority_dropped',
          detail: 'Dropped due to extreme gap capacity shortage.',
        });
      }
    }
  } else {
    // All high-priority tasks fit!
    for (const h of highTasks) {
      slotted.push(createSlottedPlan(h, h.estimatedDuration, h.estimatedDuration));
    }
    let remainingCapacity = capacity - highNeeded;

    const medNeeded = calculateTotalDuration(mediumTasks) + mediumTasks.length * bufferMinutes;

    if (medNeeded > remainingCapacity) {
      // Medium tasks cannot all fit; drop all low tasks
      for (const l of lowTasks) {
        deferredTasks.push({
          activity: l,
          reason: 'low_priority_dropped',
          detail: 'Dropped to fit schedule within available waking gaps.',
        });
      }

      // Greedily slot medium tasks that fit
      for (const m of mediumTasks) {
        const neededForM = m.estimatedDuration + bufferMinutes;
        if (neededForM <= remainingCapacity) {
          slotted.push(createSlottedPlan(m, m.estimatedDuration, m.estimatedDuration));
          remainingCapacity -= neededForM;
        } else {
          deferredTasks.push({
            activity: m,
            reason: 'medium_priority_dropped',
            detail: 'Dropped to protect high-priority tasks and bedtime cutoff.',
          });
        }
      }
    } else {
      // All medium tasks fit!
      for (const m of mediumTasks) {
        slotted.push(createSlottedPlan(m, m.estimatedDuration, m.estimatedDuration));
      }
      remainingCapacity -= medNeeded;

      // Slot low tasks that fit
      for (const l of lowTasks) {
        const neededForL = l.estimatedDuration + bufferMinutes;
        if (neededForL <= remainingCapacity) {
          slotted.push(createSlottedPlan(l, l.estimatedDuration, l.estimatedDuration));
          remainingCapacity -= neededForL;
        } else {
          deferredTasks.push({
            activity: l,
            reason: 'low_priority_dropped',
            detail: 'Dropped to fit schedule within available waking gaps.',
          });
        }
      }
    }
  }

  const totalAllocated = slotted.reduce((sum, s) => sum + s.plannedDuration, 0);

  return {
    slottedActivities: slotted,
    slottedTasks: slotted,
    deferredActivities: deferredTasks.map((d) => d.activity),
    deferredTasks,
    totalRequiredMinutes: totalRequired,
    totalAllocatedMinutes: totalAllocated,
    availableGapMinutes: capacity,
    overflowMinutes: Math.max(0, totalRequired - capacity),
    strategyUsed: 'drop_low_priority',
  };
}

/**
 * Strategy B: Proportional Scaling
 * Proportionally scales flexible task durations down to minDuration.
 * If dropping below minDuration, defers that task.
 */
export function resolveProportionalScale(
  tasks: FlexibleActivity[],
  capacity: number,
  bufferMinutes: number = 0
): OverflowResolutionResult {
  const totalRequired = calculateTotalDuration(tasks);

  if (capacity <= 0 || tasks.length === 0) {
    const deferredTasks: DeferredTaskPlan[] = tasks.map((t) => ({
      activity: t,
      reason: 'insufficient_gap_capacity',
      detail: 'No gap time available in the schedule.',
    }));
    return {
      slottedActivities: [],
      slottedTasks: [],
      deferredActivities: tasks,
      deferredTasks,
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: 0,
      availableGapMinutes: capacity,
      overflowMinutes: totalRequired,
      strategyUsed: 'proportional_scale',
    };
  }

  let activePool = sortFlexibleActivities(tasks);
  const totalNeededWithBuffers = totalRequired + activePool.length * bufferMinutes;

  if (totalNeededWithBuffers <= capacity) {
    const slotted = activePool.map((t) => createSlottedPlan(t, t.estimatedDuration, t.estimatedDuration));
    return {
      slottedActivities: slotted,
      slottedTasks: slotted,
      deferredActivities: [],
      deferredTasks: [],
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: totalRequired,
      availableGapMinutes: capacity,
      overflowMinutes: 0,
      strategyUsed: 'proportional_scale',
    };
  }

  const deferredTasks: DeferredTaskPlan[] = [];

  // Iterative relaxation loop:
  while (activePool.length > 0) {
    const K = activePool.length;
    const netCapacity = Math.max(0, capacity - K * bufferMinutes);
    const activeTotal = calculateTotalDuration(activePool);

    if (activeTotal <= netCapacity) {
      break;
    }

    const scaleRatio = activeTotal > 0 ? netCapacity / activeTotal : 0;

    // Check for minDuration violations
    const violatingIndices: number[] = [];
    for (let i = 0; i < activePool.length; i++) {
      const t = activePool[i];
      const scaled = t.estimatedDuration * scaleRatio;
      if (scaled < t.minDuration) {
        violatingIndices.push(i);
      }
    }

    if (violatingIndices.length > 0) {
      // Defer the lowest priority violator (from the end of the sorted array)
      const targetIndex = violatingIndices[violatingIndices.length - 1];
      const deferred = activePool[targetIndex];
      deferredTasks.push({
        activity: deferred,
        reason: 'below_min_duration',
        detail: `Scaling ratio (${(scaleRatio * 100).toFixed(0)}%) drops duration below minimum threshold (${deferred.minDuration}m).`,
      });
      activePool = activePool.filter((_, idx) => idx !== targetIndex);
    } else {
      // All active tasks can theoretically scale down to or above minDuration
      const sumMinDurations = activePool.reduce((sum, t) => sum + t.minDuration, 0);
      if (sumMinDurations > netCapacity) {
        // Even at absolute minimums, tasks cannot fit. Defer lowest-priority task.
        const dropped = activePool.pop()!;
        deferredTasks.push({
          activity: dropped,
          reason: 'insufficient_gap_capacity',
          detail: 'Total minimum durations exceed available gap capacity.',
        });
      } else {
        // Safe to scale activePool
        break;
      }
    }
  }

  if (activePool.length === 0) {
    return {
      slottedActivities: [],
      slottedTasks: [],
      deferredActivities: deferredTasks.map((d) => d.activity),
      deferredTasks,
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: 0,
      availableGapMinutes: capacity,
      overflowMinutes: totalRequired,
      strategyUsed: 'proportional_scale',
    };
  }

  const K = activePool.length;
  const netCapacity = Math.max(0, capacity - K * bufferMinutes);
  const finalActiveTotal = calculateTotalDuration(activePool);
  const ratio = Math.min(1.0, finalActiveTotal > 0 ? netCapacity / finalActiveTotal : 0);

  const slotted: SlottedActivityPlan[] = [];
  let allocatedMinutes = 0;

  for (const task of activePool) {
    const rawScaled = Math.floor(task.estimatedDuration * ratio);
    const planned = Math.max(task.minDuration, Math.min(task.estimatedDuration, rawScaled));
    slotted.push(createSlottedPlan(task, planned, task.estimatedDuration));
    allocatedMinutes += planned;
  }

  // Distribute integer remainder minutes to compressed tasks in priority order
  let remainder = netCapacity - allocatedMinutes;
  if (remainder > 0) {
    for (const plan of slotted) {
      if (remainder <= 0) break;
      const room = plan.originalDuration - plan.plannedDuration;
      if (room > 0) {
        const add = Math.min(remainder, room);
        plan.plannedDuration += add;
        plan.durationMinutes = plan.plannedDuration;
        plan.scaleFactor = Math.round((plan.plannedDuration / plan.originalDuration) * 100) / 100;
        plan.isCompressed = plan.plannedDuration < plan.originalDuration;
        allocatedMinutes += add;
        remainder -= add;
      }
    }
  }

  return {
    slottedActivities: slotted,
    slottedTasks: slotted,
    deferredActivities: deferredTasks.map((d) => d.activity),
    deferredTasks,
    totalRequiredMinutes: totalRequired,
    totalAllocatedMinutes: allocatedMinutes,
    availableGapMinutes: capacity,
    overflowMinutes: Math.max(0, totalRequired - capacity),
    strategyUsed: 'proportional_scale',
  };
}

/**
 * Strategy C: Hybrid Strategy (Default)
 * 1. Defers low-priority tasks first.
 * 2. If remaining overflow is <= 25% of capacity, proportionally compresses
 *    medium/high tasks down to minDuration.
 * 3. Else, defers medium-priority tasks as well.
 */
export function resolveHybrid(
  tasks: FlexibleActivity[],
  capacity: number,
  bufferMinutes: number = 0
): OverflowResolutionResult {
  const totalRequired = calculateTotalDuration(tasks);

  if (capacity <= 0 || tasks.length === 0) {
    const deferredTasks: DeferredTaskPlan[] = tasks.map((t) => ({
      activity: t,
      reason: 'insufficient_gap_capacity',
      detail: 'No gap time available in the schedule.',
    }));
    return {
      slottedActivities: [],
      slottedTasks: [],
      deferredActivities: tasks,
      deferredTasks,
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: 0,
      availableGapMinutes: capacity,
      overflowMinutes: totalRequired,
      strategyUsed: 'hybrid',
    };
  }

  const sorted = sortFlexibleActivities(tasks);
  const totalNeededWithBuffers = totalRequired + sorted.length * bufferMinutes;

  if (totalNeededWithBuffers <= capacity) {
    const slotted = sorted.map((t) => createSlottedPlan(t, t.estimatedDuration, t.estimatedDuration));
    return {
      slottedActivities: slotted,
      slottedTasks: slotted,
      deferredActivities: [],
      deferredTasks: [],
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: totalRequired,
      availableGapMinutes: capacity,
      overflowMinutes: 0,
      strategyUsed: 'hybrid',
    };
  }

  const deferredTasks: DeferredTaskPlan[] = [];

  // Step 1: Defer low-priority tasks first
  const lowTasks = sorted.filter((t) => t.priority === 'low');
  const higherTasks = sorted.filter((t) => t.priority === 'high' || t.priority === 'medium');

  for (const low of lowTasks) {
    deferredTasks.push({
      activity: low,
      reason: 'low_priority_dropped',
      detail: 'Deferred under hybrid strategy to protect medium and high priority routines.',
    });
  }

  const higherNeededWithBuffers =
    calculateTotalDuration(higherTasks) + higherTasks.length * bufferMinutes;

  // If remaining Medium/High tasks already fit into available capacity:
  if (higherNeededWithBuffers <= capacity) {
    const slotted = higherTasks.map((t) =>
      createSlottedPlan(t, t.estimatedDuration, t.estimatedDuration)
    );
    const allocated = calculateTotalDuration(higherTasks);

    return {
      slottedActivities: slotted,
      slottedTasks: slotted,
      deferredActivities: deferredTasks.map((d) => d.activity),
      deferredTasks,
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: allocated,
      availableGapMinutes: capacity,
      overflowMinutes: Math.max(0, totalRequired - capacity),
      strategyUsed: 'hybrid',
    };
  }

  // Step 2: Check remaining overflow magnitude
  const remainingOverflow = higherNeededWithBuffers - capacity;
  const overflowPercentage = capacity > 0 ? remainingOverflow / capacity : 1.0;

  if (overflowPercentage <= 0.25) {
    // Overflow is <= 25%: proportionally compress medium/high tasks down to minDuration
    const scaleResult = resolveProportionalScale(higherTasks, capacity, bufferMinutes);
    return {
      slottedActivities: scaleResult.slottedActivities,
      slottedTasks: scaleResult.slottedTasks,
      deferredActivities: [...deferredTasks.map((d) => d.activity), ...scaleResult.deferredActivities],
      deferredTasks: [...deferredTasks, ...scaleResult.deferredTasks],
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: scaleResult.totalAllocatedMinutes,
      availableGapMinutes: capacity,
      overflowMinutes: Math.max(0, totalRequired - capacity),
      strategyUsed: 'hybrid',
    };
  }

  // Step 3: Overflow > 25%: Defer medium-priority tasks
  const mediumTasks = higherTasks.filter((t) => t.priority === 'medium');
  const highTasks = higherTasks.filter((t) => t.priority === 'high');

  for (const med of mediumTasks) {
    deferredTasks.push({
      activity: med,
      reason: 'medium_priority_dropped',
      detail: 'Remaining overflow exceeded 25%; medium tasks deferred to protect high-priority activities.',
    });
  }

  const highNeededWithBuffers =
    calculateTotalDuration(highTasks) + highTasks.length * bufferMinutes;

  if (highNeededWithBuffers <= capacity) {
    const slotted = highTasks.map((t) =>
      createSlottedPlan(t, t.estimatedDuration, t.estimatedDuration)
    );
    const allocated = calculateTotalDuration(highTasks);

    return {
      slottedActivities: slotted,
      slottedTasks: slotted,
      deferredActivities: deferredTasks.map((d) => d.activity),
      deferredTasks,
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: allocated,
      availableGapMinutes: capacity,
      overflowMinutes: Math.max(0, totalRequired - capacity),
      strategyUsed: 'hybrid',
    };
  }

  // High tasks themselves overflow: compress or drop high tasks
  const highRemainingOverflow = highNeededWithBuffers - capacity;
  const highOverflowPercentage = capacity > 0 ? highRemainingOverflow / capacity : 1.0;

  if (highOverflowPercentage <= 0.25) {
    const highScaleResult = resolveProportionalScale(highTasks, capacity, bufferMinutes);
    return {
      slottedActivities: highScaleResult.slottedActivities,
      slottedTasks: highScaleResult.slottedTasks,
      deferredActivities: [...deferredTasks.map((d) => d.activity), ...highScaleResult.deferredActivities],
      deferredTasks: [...deferredTasks, ...highScaleResult.deferredTasks],
      totalRequiredMinutes: totalRequired,
      totalAllocatedMinutes: highScaleResult.totalAllocatedMinutes,
      availableGapMinutes: capacity,
      overflowMinutes: Math.max(0, totalRequired - capacity),
      strategyUsed: 'hybrid',
    };
  }

  const highDropResult = resolveDropLowPriority(highTasks, capacity, bufferMinutes);
  return {
    slottedActivities: highDropResult.slottedActivities,
    slottedTasks: highDropResult.slottedTasks,
    deferredActivities: [...deferredTasks.map((d) => d.activity), ...highDropResult.deferredActivities],
    deferredTasks: [...deferredTasks, ...highDropResult.deferredTasks],
    totalRequiredMinutes: totalRequired,
    totalAllocatedMinutes: highDropResult.totalAllocatedMinutes,
    availableGapMinutes: capacity,
    overflowMinutes: Math.max(0, totalRequired - capacity),
    strategyUsed: 'hybrid',
  };
}

/**
 * Unified Overflow Resolver Entrypoint
 */
export function resolveOverflow(
  tasks: FlexibleActivity[],
  gapsOrCapacity: GapInterval[] | number,
  strategy: OverflowStrategy = 'hybrid',
  bufferMinutes: number = 0
): OverflowResolutionResult {
  const capacity = Array.isArray(gapsOrCapacity)
    ? gapsOrCapacity.reduce((sum, g) => sum + g.durationMinutes, 0)
    : Math.max(0, Math.floor(gapsOrCapacity));

  switch (strategy) {
    case 'drop_low_priority':
      return resolveDropLowPriority(tasks, capacity, bufferMinutes);
    case 'proportional_scale':
      return resolveProportionalScale(tasks, capacity, bufferMinutes);
    case 'hybrid':
    default:
      return resolveHybrid(tasks, capacity, bufferMinutes);
  }
}
