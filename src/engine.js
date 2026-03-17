// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE.JS — Rule Engine, Critical Path, Graph Layout, Utilities
// ═══════════════════════════════════════════════════════════════════════════════
import { MarkerType } from 'reactflow';

// ── Utilities ──
export const genId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

export function fmt(d) {
  if (d === 0) return 'Marco';
  const s = Number.isInteger(d) ? `${d}` : d.toFixed(1).replace('.', ',');
  return `${s} ${d === 1 ? 'mês' : 'meses'}`;
}

export function fmtTotal(d) {
  return Number.isInteger(d) ? `${d}` : d.toFixed(1).replace('.', ',');
}

export function fmtCurrency(v) {
  if (!v) return 'R$ 0';
  return `R$ ${v.toLocaleString('pt-BR')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULE ENGINE — Evaluates answers against rules → active tasks + deps
//   Supports: region filtering, string/boolean equals, "unknown" (pessimistic)
// ═══════════════════════════════════════════════════════════════════════════════
export function evaluateRules(rules, answers, regionId) {
  // Step 0: Filter rules by region
  const regionRules = rules.filter((r) => !r.region_id || r.region_id === regionId);

  // Step 1: Find matching rules
  const matching = regionRules.filter((r) => {
    if (!r.if_question_id) return true; // unconditional
    const answer = answers[r.if_question_id];
    if (answer === 'unknown') return true; // pessimistic: include all conditional tasks
    return answer === r.equals_value;
  });

  const addRules = matching.filter((r) => !r.only_if_active);
  const updateRules = matching.filter((r) => r.only_if_active);

  // Phase 1: Process "add" rules (later rules for same task override earlier)
  const activeMap = new Map();
  addRules.forEach((r) => {
    activeMap.set(r.then_add_task_id, { depends_on: new Set(r.depends_on_task_ids) });
  });

  // Phase 2: Apply task replacements
  const toRemove = new Set();
  matching.forEach((r) => {
    if (r.replaces_task_id) toRemove.add(r.replaces_task_id);
  });
  toRemove.forEach((id) => activeMap.delete(id));

  // Phase 3: Process "update-only" rules — MERGE deps into already-active tasks
  updateRules.forEach((r) => {
    if (activeMap.has(r.then_add_task_id)) {
      const existing = activeMap.get(r.then_add_task_id);
      r.depends_on_task_ids.forEach((d) => existing.depends_on.add(d));
    }
  });

  // Phase 4: Filter deps to only reference tasks that are actually active
  activeMap.forEach((data) => {
    const filtered = new Set();
    data.depends_on.forEach((depId) => {
      if (activeMap.has(depId)) filtered.add(depId);
    });
    data.depends_on = filtered;
  });

  // Track uncertain tasks (triggered by "unknown" answers)
  const uncertainTasks = new Set();
  regionRules.forEach((r) => {
    if (r.if_question_id && answers[r.if_question_id] === 'unknown') {
      if (activeMap.has(r.then_add_task_id)) uncertainTasks.add(r.then_add_task_id);
    }
  });

  // Track which tasks are ONLY driven by conditional rules (for visual variant)
  const fromUnconditional = new Set();
  const fromConditional = new Set();
  addRules.forEach((r) => {
    if (!r.if_question_id) fromUnconditional.add(r.then_add_task_id);
    else fromConditional.add(r.then_add_task_id);
  });
  const conditionalTasks = new Set();
  fromConditional.forEach((id) => {
    if (!fromUnconditional.has(id) && activeMap.has(id)) conditionalTasks.add(id);
  });

  return { activeMap, uncertainTasks, conditionalTasks };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICAL PATH — Topological Sort + Forward/Backward Pass
//   Returns: total, criticalIds, schedule (per-task ES/EF/LS/LF/slack)
// ═══════════════════════════════════════════════════════════════════════════════
export function calculateCriticalPath(taskEntries) {
  if (!taskEntries.length)
    return { total: 0, criticalIds: new Set(), schedule: {} };

  const nodeMap = {};
  taskEntries.forEach(([id, { duration, depends_on }]) => {
    nodeMap[id] = {
      dur: duration,
      deps: [...depends_on],
      es: 0,
      ef: 0,
      ls: Infinity,
      lf: Infinity,
    };
  });

  const ids = Object.keys(nodeMap);
  const successors = {};
  ids.forEach((id) => {
    successors[id] = [];
  });
  ids.forEach((id) => {
    nodeMap[id].deps.forEach((dep) => {
      if (successors[dep]) successors[dep].push(id);
    });
  });

  // Topological sort (Kahn's algorithm)
  const inDeg = {};
  ids.forEach((id) => {
    inDeg[id] = nodeMap[id].deps.filter((d) => nodeMap[d]).length;
  });
  const queue = ids.filter((id) => inDeg[id] === 0);
  const sorted = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);
    successors[cur].forEach((next) => {
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    });
  }

  // Forward pass
  sorted.forEach((id) => {
    const n = nodeMap[id];
    n.ef = n.es + n.dur;
    successors[id].forEach((next) => {
      if (n.ef > nodeMap[next].es) nodeMap[next].es = n.ef;
    });
  });

  let total = 0;
  Object.values(nodeMap).forEach((n) => {
    if (n.ef > total) total = n.ef;
  });

  // Backward pass
  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = sorted[i];
    const n = nodeMap[id];
    if (successors[id].length === 0) {
      n.lf = total;
    } else {
      let minLS = Infinity;
      successors[id].forEach((s) => {
        if (nodeMap[s].ls < minLS) minLS = nodeMap[s].ls;
      });
      n.lf = minLS;
    }
    n.ls = n.lf - n.dur;
  }

  const criticalIds = new Set();
  const schedule = {};
  Object.entries(nodeMap).forEach(([id, n]) => {
    const slack = Math.abs(n.ls - n.es);
    if (slack < 0.001) criticalIds.add(id);
    schedule[id] = { es: n.es, ef: n.ef, ls: n.ls, lf: n.lf, slack };
  });

  return { total, criticalIds, schedule };
}

// Build task entries with specified duration key
export function buildTaskEntries(activeMap, taskCatalog, overrides, durationKey) {
  const catalog = Object.fromEntries(taskCatalog.map((t) => [t.id, t]));
  return [...activeMap.entries()].map(([id, data]) => {
    const task = catalog[id];
    const dur = overrides[id] ?? task?.[durationKey] ?? task?.default_duration_months ?? 0;
    return [id, { ...data, duration: dur }];
  });
}

// Calculate min/default/max ranges
export function calculateRange(activeMap, taskCatalog, overrides) {
  const teDefault = buildTaskEntries(activeMap, taskCatalog, overrides, 'default_duration_months');
  const teMin = buildTaskEntries(activeMap, taskCatalog, {}, 'min_duration_months');
  const teMax = buildTaskEntries(activeMap, taskCatalog, {}, 'max_duration_months');

  const cpDefault = calculateCriticalPath(teDefault);
  const cpMin = calculateCriticalPath(teMin);
  const cpMax = calculateCriticalPath(teMax);

  return {
    totalDefault: cpDefault.total,
    totalMin: cpMin.total,
    totalMax: cpMax.total,
    criticalIds: cpDefault.criticalIds,
    schedule: cpDefault.schedule,
    taskEntries: teDefault,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-LAYOUT — Topological layers for React Flow positioning
// ═══════════════════════════════════════════════════════════════════════════════
export function computePositions(taskEntries) {
  const LW = 300,
    RH = 130;
  if (!taskEntries.length) return {};

  const ids = taskEntries.map(([id]) => id);
  const depsMap = {};
  taskEntries.forEach(([id, { depends_on }]) => {
    depsMap[id] = [...depends_on];
  });

  const successors = {};
  ids.forEach((id) => {
    successors[id] = [];
  });
  ids.forEach((id) => {
    depsMap[id].forEach((d) => {
      if (successors[d]) successors[d].push(id);
    });
  });

  const inDeg = {};
  ids.forEach((id) => {
    inDeg[id] = depsMap[id].filter((d) => ids.includes(d)).length;
  });
  const queue = ids.filter((id) => inDeg[id] === 0);
  const sorted = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);
    successors[cur].forEach((n) => {
      inDeg[n]--;
      if (inDeg[n] === 0) queue.push(n);
    });
  }

  const col = {};
  sorted.forEach((id) => {
    const predCols = depsMap[id]
      .filter((d) => col[d] !== undefined)
      .map((d) => col[d]);
    col[id] = predCols.length > 0 ? Math.max(...predCols) + 1 : 0;
  });

  const groups = {};
  sorted.forEach((id) => {
    const c = col[id];
    if (!groups[c]) groups[c] = [];
    groups[c].push(id);
  });

  const positions = {};
  Object.entries(groups).forEach(([c, tids]) => {
    const x = Number.parseInt(c, 10) * LW;
    tids.forEach((id, i) => {
      positions[id] = { x, y: 200 + (i - (tids.length - 1) / 2) * RH };
    });
  });
  return positions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD FLOW GRAPH — Converts active tasks → React Flow nodes + edges
// ═══════════════════════════════════════════════════════════════════════════════
export function buildFlowGraph(
  taskEntries,
  taskCatalog,
  criticalIds,
  uncertainTasks,
  conditionalTasks,
  schedule,
) {
  const positions = computePositions(taskEntries);
  const taskMap = Object.fromEntries(taskCatalog.map((t) => [t.id, t]));

  const nodes = taskEntries.map(([id, { duration }]) => {
    const task = taskMap[id];
    const isCritical = criticalIds.has(id);
    const isUncertain = uncertainTasks.has(id);
    let variant = 'fixed';
    if (duration === 0) variant = 'milestone';
    else if (conditionalTasks.has(id)) variant = 'conditional';
    if (isUncertain) variant = 'uncertain';

    const s = schedule[id] || {};

    return {
      id,
      type: 'custom',
      position: positions[id] || { x: 0, y: 0 },
      data: {
        label: task?.name || id,
        duracao: duration,
        variant,
        isCritical,
        isUncertain,
        internal: task?.internal_months ?? 0,
        external: task?.external_months ?? 0,
        cost: task?.estimated_cost ?? 0,
        slack: s.slack ?? 0,
        es: s.es ?? 0,
        ef: s.ef ?? 0,
      },
    };
  });

  const edges = [];
  taskEntries.forEach(([id, { depends_on }]) => {
    depends_on.forEach((dep) => {
      const isCrit = criticalIds.has(id) && criticalIds.has(dep);
      edges.push({
        id: `e-${dep}-${id}`,
        source: dep,
        target: id,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: isCrit ? '#ef4444' : '#64748b',
          strokeWidth: isCrit ? 3 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCrit ? '#ef4444' : '#64748b',
        },
      });
    });
  });

  return { nodes, edges };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY STATS — Compute average/median actual duration from past projects
// ═══════════════════════════════════════════════════════════════════════════════
export function getHistoryStats(history, taskId, regionId) {
  const durations = [];
  history
    .filter((h) => !regionId || h.region_id === regionId)
    .forEach((h) => {
      h.tasks_completed.forEach((tc) => {
        if (tc.task_id === taskId) durations.push(tc.actual_duration);
      });
    });
  if (!durations.length) return null;
  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / durations.length;
  const sorted = [...durations].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  return { avg: Math.round(avg * 10) / 10, median, count: durations.length, durations };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOAL-SEEK — Reverse calculation from target date
// ═══════════════════════════════════════════════════════════════════════════════
export function calculateGoalSeek(targetDate, totalMonths, schedule, taskCatalog) {
  const today = new Date();
  const target = new Date(targetDate);
  const monthsAvailable =
    (target.getFullYear() - today.getFullYear()) * 12 +
    (target.getMonth() - today.getMonth());

  const slack = monthsAvailable - totalMonths;
  const feasible = slack >= 0;

  const taskMap = Object.fromEntries(taskCatalog.map((t) => [t.id, t]));
  const deadlines = [];

  Object.entries(schedule).forEach(([id, s]) => {
    const monthsFromStart = s.ls;
    const deadlineDate = new Date(today);
    deadlineDate.setMonth(deadlineDate.getMonth() + Math.round(slack >= 0 ? monthsFromStart + slack : monthsFromStart));
    deadlines.push({
      taskId: id,
      taskName: taskMap[id]?.name || id,
      latestStart: deadlineDate,
      slackMonths: s.slack,
      isCritical: s.slack < 0.001,
    });
  });

  deadlines.sort((a, b) => a.latestStart - b.latestStart);

  return {
    monthsAvailable,
    totalMonths,
    slack,
    feasible,
    deadlines,
  };
}
