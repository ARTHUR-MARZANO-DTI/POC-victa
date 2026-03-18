// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE.JS — Utilitários, Caminho Crítico, Estatísticas
//   (Sem motor de regras — tudo é manual no diagrama)
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
// CRITICAL PATH — Topological Sort + Forward/Backward Pass
// ═══════════════════════════════════════════════════════════════════════════════
export function calculateCriticalPath(nodeEntries) {
  if (!nodeEntries.length)
    return { total: 0, criticalIds: new Set(), schedule: {} };

  const nodeMap = {};
  nodeEntries.forEach(({ id, duration, deps }) => {
    nodeMap[id] = { dur: duration, deps: [...deps], es: 0, ef: 0, ls: Infinity, lf: Infinity };
  });

  const ids = Object.keys(nodeMap);
  const successors = {};
  ids.forEach((id) => { successors[id] = []; });
  ids.forEach((id) => {
    nodeMap[id].deps.forEach((dep) => {
      if (successors[dep]) successors[dep].push(id);
    });
  });

  // Kahn's topological sort
  const inDeg = {};
  ids.forEach((id) => { inDeg[id] = nodeMap[id].deps.filter((d) => nodeMap[d]).length; });
  const queue = ids.filter((id) => inDeg[id] === 0);
  const sorted = [];
  while (queue.length) {
    const cur = queue.shift();
    sorted.push(cur);
    (successors[cur] || []).forEach((next) => { inDeg[next]--; if (inDeg[next] === 0) queue.push(next); });
  }

  // Forward pass
  sorted.forEach((id) => {
    const n = nodeMap[id];
    n.ef = n.es + n.dur;
    (successors[id] || []).forEach((next) => { if (n.ef > nodeMap[next].es) nodeMap[next].es = n.ef; });
  });

  let total = 0;
  Object.values(nodeMap).forEach((n) => { if (n.ef > total) total = n.ef; });

  // Backward pass
  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = sorted[i];
    const n = nodeMap[id];
    if (!successors[id].length) { n.lf = total; }
    else {
      let minLS = Infinity;
      successors[id].forEach((s) => { if (nodeMap[s].ls < minLS) minLS = nodeMap[s].ls; });
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

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD FLOW EDGES — Converte edges do React Flow + step catalog em dados para
//   o cálculo de caminho crítico
// ═══════════════════════════════════════════════════════════════════════════════
export function buildCriticalPathEntries(rfNodes, rfEdges, stepCatalog) {
  const catalogMap = Object.fromEntries(stepCatalog.map((s) => [s.id, s]));

  // Collect deps from edges
  const depsMap = {};
  rfNodes.forEach((n) => { depsMap[n.id] = []; });
  rfEdges.forEach((e) => {
    if (depsMap[e.target]) depsMap[e.target].push(e.source);
  });

  return rfNodes.map((n) => {
    const step = catalogMap[n.id];
    const dur = n.data?.durationOverride ?? step?.defaultDurationMonths ?? 0;
    return { id: n.id, duration: dur, deps: depsMap[n.id] || [] };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICS — Calcula médias a partir das simulações concluídas
// ═══════════════════════════════════════════════════════════════════════════════
export function getStepStats(simulations, stepId, localityId) {
  const durations = [];
  simulations.forEach((sim) => {
    if (localityId && sim.localityId !== localityId) return;
    (sim.completedSteps || []).forEach((cs) => {
      if (cs.stepId === stepId && cs.actualDuration != null) durations.push(cs.actualDuration);
    });
  });
  if (!durations.length) return null;
  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / durations.length;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  return { avg: Math.round(avg * 10) / 10, median, count: durations.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CYCLE DETECTION — Verifica se adicionar uma aresta criaria um ciclo (DFS)
// ═══════════════════════════════════════════════════════════════════════════════
export function wouldCreateCycle(existingEdges, newSource, newTarget) {
  // If adding newSource→newTarget, check if there's already a path from newTarget back to newSource
  const adj = {};
  existingEdges.forEach((e) => {
    if (!adj[e.source]) adj[e.source] = [];
    adj[e.source].push(e.target);
  });
  // Add the proposed edge
  if (!adj[newSource]) adj[newSource] = [];
  adj[newSource].push(newTarget);

  // DFS from newTarget to see if we can reach newSource
  const visited = new Set();
  const stack = [newTarget];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === newSource) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    (adj[cur] || []).forEach((n) => stack.push(n));
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE STYLING — Aplica estilos de caminho crítico nos edges do React Flow
// ═══════════════════════════════════════════════════════════════════════════════
export function styledEdges(rfEdges, criticalIds) {
  return rfEdges.map((e) => {
    const isCrit = criticalIds.has(e.source) && criticalIds.has(e.target);
    return {
      ...e,
      type: 'smoothstep',
      animated: true,
      style: { stroke: isCrit ? '#ef4444' : '#64748b', strokeWidth: isCrit ? 3 : 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isCrit ? '#ef4444' : '#64748b' },
    };
  });
}
