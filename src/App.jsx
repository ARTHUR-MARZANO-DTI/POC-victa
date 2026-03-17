import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. INITIAL STATE — "Banco de Dados" JSON (Fortaleza/CE - Dados Reais dos PDFs)
// ═══════════════════════════════════════════════════════════════════════════════
const INITIAL_STATE = {
  questions: [
    { id: 'q1', text: 'Haverá demolição no terreno?', type: 'boolean', visible_when: null },
    { id: 'q2', text: 'A área total construída é acima de 40.000m²?', type: 'boolean', visible_when: null },
    { id: 'q3', text: 'Haverá supressão de mais de 49 árvores?', type: 'boolean', visible_when: { question_id: 'q2', equals_value: true } },
    { id: 'q4', text: 'O projeto tem mais de 300 unidades?', type: 'boolean', visible_when: null },
  ],
  tasks: [
    { id: 't_comite', name: 'Comitê de Aquisição', default_duration_months: 0 },
    { id: 't_demolicao', name: 'Demolição', default_duration_months: 6 },
    { id: 't_projetos', name: 'Projetos Iniciais', default_duration_months: 2 },
    { id: 't_bombeiros', name: 'Aprovação Bombeiros', default_duration_months: 4.5 },
    { id: 't_las', name: 'Licença Ambiental Simplificada (LAS)', default_duration_months: 7 },
    { id: 't_lp_li', name: 'Licença Regular (LP+LI)', default_duration_months: 10 },
    { id: 't_aop', name: 'Análise de Orientação Prévia (AOP)', default_duration_months: 3.5 },
    { id: 't_alvara', name: 'Alvará de Construção', default_duration_months: 3 },
    { id: 't_ri', name: 'Registro de Incorporação (RI)', default_duration_months: 1 },
  ],
  rules: [
    // ── Regras Incondicionais (sempre ativas) ──
    { id: 'r01', if_question_id: null, equals_value: null, then_add_task_id: 't_comite', depends_on_task_ids: [], replaces_task_id: null, only_if_active: false },
    { id: 'r02', if_question_id: null, equals_value: null, then_add_task_id: 't_projetos', depends_on_task_ids: ['t_comite'], replaces_task_id: null, only_if_active: false },
    { id: 'r03', if_question_id: null, equals_value: null, then_add_task_id: 't_bombeiros', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false },
    { id: 'r04', if_question_id: null, equals_value: null, then_add_task_id: 't_las', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false },
    { id: 'r05', if_question_id: null, equals_value: null, then_add_task_id: 't_alvara', depends_on_task_ids: ['t_bombeiros', 't_las', 't_lp_li'], replaces_task_id: null, only_if_active: false },
    { id: 'r06', if_question_id: null, equals_value: null, then_add_task_id: 't_ri', depends_on_task_ids: ['t_alvara'], replaces_task_id: null, only_if_active: false },
    // ── Condicionais: Demolição ──
    { id: 'r07', if_question_id: 'q1', equals_value: true, then_add_task_id: 't_demolicao', depends_on_task_ids: ['t_comite'], replaces_task_id: null, only_if_active: false },
    { id: 'r08', if_question_id: 'q1', equals_value: true, then_add_task_id: 't_projetos', depends_on_task_ids: ['t_demolicao'], replaces_task_id: null, only_if_active: false },
    // ── Condicionais: Licença Regular (substitui LAS) ──
    { id: 'r09', if_question_id: 'q2', equals_value: true, then_add_task_id: 't_lp_li', depends_on_task_ids: ['t_projetos'], replaces_task_id: 't_las', only_if_active: false },
    { id: 'r10', if_question_id: 'q3', equals_value: true, then_add_task_id: 't_lp_li', depends_on_task_ids: ['t_projetos'], replaces_task_id: 't_las', only_if_active: false },
    // ── Condicionais: AOP + override de dependências ──
    { id: 'r11', if_question_id: 'q4', equals_value: true, then_add_task_id: 't_aop', depends_on_task_ids: ['t_projetos'], replaces_task_id: null, only_if_active: false },
    { id: 'r12', if_question_id: 'q4', equals_value: true, then_add_task_id: 't_las', depends_on_task_ids: ['t_aop'], replaces_task_id: null, only_if_active: true },
    { id: 'r13', if_question_id: 'q4', equals_value: true, then_add_task_id: 't_lp_li', depends_on_task_ids: ['t_aop'], replaces_task_id: null, only_if_active: true },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════
const genId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

function fmt(d) {
  if (d === 0) return 'Marco';
  const s = Number.isInteger(d) ? `${d}` : d.toFixed(1).replace('.', ',');
  return `⏱ ${s} ${d === 1 ? 'mês' : 'meses'}`;
}
function fmtTotal(d) {
  return Number.isInteger(d) ? `${d}` : d.toFixed(1).replace('.', ',');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. RULE ENGINE — Evaluates answers against rules → active tasks + deps
// ═══════════════════════════════════════════════════════════════════════════════
function evaluateRules(rules, answers) {
  const matching = rules.filter((r) => {
    if (!r.if_question_id) return true;
    return answers[r.if_question_id] === r.equals_value;
  });

  const addRules = matching.filter((r) => !r.only_if_active);
  const updateRules = matching.filter((r) => r.only_if_active);

  // Phase 1: Process "add" rules (later rules override earlier for same task)
  const activeMap = new Map();
  addRules.forEach((r) => {
    activeMap.set(r.then_add_task_id, { depends_on: new Set(r.depends_on_task_ids) });
  });

  // Phase 2: Apply replacements
  const toRemove = new Set();
  matching.forEach((r) => { if (r.replaces_task_id) toRemove.add(r.replaces_task_id); });
  toRemove.forEach((id) => activeMap.delete(id));

  // Phase 3: Process "update-only" rules (only affect already-active tasks)
  updateRules.forEach((r) => {
    if (activeMap.has(r.then_add_task_id)) {
      activeMap.set(r.then_add_task_id, { depends_on: new Set(r.depends_on_task_ids) });
    }
  });

  // Phase 4: Filter dependencies to only reference active tasks
  activeMap.forEach((data) => {
    const filtered = new Set();
    data.depends_on.forEach((depId) => { if (activeMap.has(depId)) filtered.add(depId); });
    data.depends_on = filtered;
  });

  return activeMap;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CRITICAL PATH — Topological Sort + Forward/Backward Pass
// ═══════════════════════════════════════════════════════════════════════════════
function calculateCriticalPath(taskEntries) {
  if (!taskEntries.length) return { total: 0, criticalIds: new Set() };

  const nodeMap = {};
  taskEntries.forEach(([id, { duration, depends_on }]) => {
    nodeMap[id] = { dur: duration, deps: [...depends_on], es: 0, ef: 0, ls: Infinity, lf: Infinity };
  });

  const ids = Object.keys(nodeMap);
  const successors = {};
  ids.forEach((id) => { successors[id] = []; });
  ids.forEach((id) => {
    nodeMap[id].deps.forEach((dep) => { if (successors[dep]) successors[dep].push(id); });
  });

  // In-degree for topological sort
  const inDeg = {};
  ids.forEach((id) => { inDeg[id] = nodeMap[id].deps.filter((d) => nodeMap[d]).length; });
  const queue = ids.filter((id) => inDeg[id] === 0);
  const sorted = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);
    successors[cur].forEach((next) => { inDeg[next]--; if (inDeg[next] === 0) queue.push(next); });
  }

  // Forward pass
  sorted.forEach((id) => {
    const n = nodeMap[id];
    n.ef = n.es + n.dur;
    successors[id].forEach((next) => { if (n.ef > nodeMap[next].es) nodeMap[next].es = n.ef; });
  });

  let total = 0;
  Object.values(nodeMap).forEach((n) => { if (n.ef > total) total = n.ef; });

  // Backward pass
  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = sorted[i];
    const n = nodeMap[id];
    if (successors[id].length === 0) { n.lf = total; }
    else {
      let minLS = Infinity;
      successors[id].forEach((s) => { if (nodeMap[s].ls < minLS) minLS = nodeMap[s].ls; });
      n.lf = minLS;
    }
    n.ls = n.lf - n.dur;
  }

  const criticalIds = new Set();
  Object.entries(nodeMap).forEach(([id, n]) => {
    if (Math.abs(n.ls - n.es) < 0.001) criticalIds.add(id);
  });

  return { total, criticalIds };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. AUTO-LAYOUT — Topological layers for React Flow positioning
// ═══════════════════════════════════════════════════════════════════════════════
function computePositions(taskEntries) {
  const LW = 300, RH = 140;
  if (!taskEntries.length) return {};

  const ids = taskEntries.map(([id]) => id);
  const depsMap = {};
  taskEntries.forEach(([id, { depends_on }]) => { depsMap[id] = [...depends_on]; });

  const successors = {};
  ids.forEach((id) => { successors[id] = []; });
  ids.forEach((id) => { depsMap[id].forEach((d) => { if (successors[d]) successors[d].push(id); }); });

  const inDeg = {};
  ids.forEach((id) => { inDeg[id] = depsMap[id].filter((d) => ids.includes(d)).length; });
  const queue = ids.filter((id) => inDeg[id] === 0);
  const sorted = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);
    successors[cur].forEach((n) => { inDeg[n]--; if (inDeg[n] === 0) queue.push(n); });
  }

  const col = {};
  sorted.forEach((id) => {
    const predCols = depsMap[id].filter((d) => col[d] !== undefined).map((d) => col[d]);
    col[id] = predCols.length > 0 ? Math.max(...predCols) + 1 : 0;
  });

  const groups = {};
  sorted.forEach((id) => { const c = col[id]; if (!groups[c]) groups[c] = []; groups[c].push(id); });

  const positions = {};
  Object.entries(groups).forEach(([c, tids]) => {
    const x = Number.parseInt(c, 10) * LW;
    tids.forEach((id, i) => { positions[id] = { x, y: 200 + (i - (tids.length - 1) / 2) * RH }; });
  });
  return positions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. BUILD FLOW GRAPH — Converts active tasks → React Flow nodes + edges
// ═══════════════════════════════════════════════════════════════════════════════
function buildFlowGraph(taskEntries, taskCatalog, criticalIds) {
  const positions = computePositions(taskEntries);
  const taskMap = Object.fromEntries(taskCatalog.map((t) => [t.id, t]));

  const nodes = taskEntries.map(([id, { duration, depends_on }]) => {
    const task = taskMap[id];
    const isCritical = criticalIds.has(id);
    let variant = 'fixed';
    if (duration === 0) variant = 'milestone';
    else if (!['t_comite', 't_projetos', 't_bombeiros', 't_alvara', 't_ri'].includes(id)) variant = 'conditional';
    return {
      id, type: 'custom',
      position: positions[id] || { x: 0, y: 0 },
      data: { label: task?.name || id, duracao: duration, variant, isCritical },
    };
  });

  const edges = [];
  taskEntries.forEach(([id, { depends_on }]) => {
    depends_on.forEach((dep) => {
      const isCrit = criticalIds.has(id) && criticalIds.has(dep);
      edges.push({
        id: `e-${dep}-${id}`, source: dep, target: id, type: 'smoothstep', animated: true,
        style: { stroke: isCrit ? '#ef4444' : '#64748b', strokeWidth: isCrit ? 3 : 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isCrit ? '#ef4444' : '#64748b' },
      });
    });
  });

  return { nodes, edges };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. CUSTOM NODE
// ═══════════════════════════════════════════════════════════════════════════════
const COLORS = {
  milestone:   { bg: '#059669', border: '#047857' },
  fixed:       { bg: '#1e40af', border: '#1e3a8a' },
  conditional: { bg: '#d97706', border: '#b45309' },
};

function CustomNode({ data }) {
  const c = COLORS[data.variant] || COLORS.fixed;
  return (
    <div
      className={`rounded-xl shadow-lg px-5 py-3 min-w-[210px] text-center text-white transition-all hover:scale-105 hover:shadow-xl ${data.isCritical ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}
      style={{ background: c.bg, border: `2px solid ${data.isCritical ? '#ef4444' : c.border}` }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-3 !h-3" />
      <div className="font-bold text-sm leading-tight">{data.label}</div>
      <div className="mt-1 text-xs opacity-90 font-medium">{fmt(data.duracao)}</div>
      {data.isCritical && <div className="mt-1 text-[10px] font-semibold text-red-200 uppercase tracking-wider">Caminho Crítico</div>}
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-3 !h-3" />
    </div>
  );
}
const nodeTypes = { custom: CustomNode };

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EDIT MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function EditModal({ node, onSave, onClose }) {
  const [val, setVal] = useState(node?.data?.duracao ?? 0);
  useEffect(() => { setVal(node?.data?.duracao ?? 0); }, [node]);
  if (!node) return null;
  const submit = (e) => {
    e.preventDefault();
    const p = Number.parseFloat(val);
    if (!Number.isNaN(p) && p >= 0) onSave(node.id, p);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[400px] border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Editar Duração</h3>
        <p className="text-sm text-gray-500 mb-4">{node.data.label}</p>
        <form onSubmit={submit}>
          <label htmlFor="dur-input" className="block text-sm font-medium text-gray-700 mb-1">Duração (meses)</label>
          <input id="dur-input" type="number" min="0" step="0.5" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
          <p className="text-xs text-gray-400 mt-1">Valores decimais permitidos (ex: 4,5)</p>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ADMIN TAB — CRUD for Questions, Tasks, Rules
// ═══════════════════════════════════════════════════════════════════════════════
function AdminTab({ state, setState }) {
  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5">
        <QuestionsPanel state={state} setState={setState} />
        <TasksPanel state={state} setState={setState} />
        <RulesPanel state={state} setState={setState} />
      </div>
    </div>
  );
}

function QuestionsPanel({ state, setState }) {
  const [text, setText] = useState('');
  const [visQ, setVisQ] = useState('');
  const add = () => {
    if (!text.trim()) return;
    const q = { id: genId('q'), text: text.trim(), type: 'boolean', visible_when: visQ ? { question_id: visQ, equals_value: true } : null };
    setState((s) => ({ ...s, questions: [...s.questions, q] }));
    setText(''); setVisQ('');
  };
  const del = (id) => setState((s) => ({ ...s, questions: s.questions.filter((q) => q.id !== id) }));
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 flex flex-col">
      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">{state.questions.length}</span>
        Perguntas
      </h3>
      <div className="space-y-2 flex-1 overflow-auto mb-4">
        {state.questions.map((q) => (
          <div key={q.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-medium text-gray-700">{q.text}</p>
              {q.visible_when && <p className="text-[10px] text-amber-600 mt-0.5">↳ Visível quando {state.questions.find((x) => x.id === q.visible_when.question_id)?.text?.slice(0, 30)}... = Sim</p>}
            </div>
            <button onClick={() => del(q.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <input placeholder="Texto da pergunta..." value={text} onChange={(e) => setText(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-400" />
        <select value={visQ} onChange={(e) => setVisQ(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 outline-none">
          <option value="">Sempre visível</option>
          {state.questions.map((q) => <option key={q.id} value={q.id}>Visível quando: {q.text.slice(0, 40)}</option>)}
        </select>
        <button onClick={add} className="w-full bg-purple-600 text-white text-sm py-1.5 rounded-lg hover:bg-purple-700 cursor-pointer">+ Adicionar Pergunta</button>
      </div>
    </div>
  );
}

function TasksPanel({ state, setState }) {
  const [name, setName] = useState('');
  const [dur, setDur] = useState('');
  const add = () => {
    if (!name.trim()) return;
    const t = { id: genId('t'), name: name.trim(), default_duration_months: Number.parseFloat(dur) || 0 };
    setState((s) => ({ ...s, tasks: [...s.tasks, t] }));
    setName(''); setDur('');
  };
  const del = (id) => setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 flex flex-col">
      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{state.tasks.length}</span>
        Etapas (Tasks)
      </h3>
      <div className="space-y-2 flex-1 overflow-auto mb-4">
        {state.tasks.map((t) => (
          <div key={t.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-center gap-2">
            <div>
              <p className="text-xs font-medium text-gray-700">{t.name}</p>
              <p className="text-[10px] text-gray-400">{t.default_duration_months}m · {t.id}</p>
            </div>
            <button onClick={() => del(t.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <input placeholder="Nome da etapa..." value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400" />
        <input placeholder="Duração (meses)" type="number" step="0.5" min="0" value={dur} onChange={(e) => setDur(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400" />
        <button onClick={add} className="w-full bg-blue-600 text-white text-sm py-1.5 rounded-lg hover:bg-blue-700 cursor-pointer">+ Adicionar Etapa</button>
      </div>
    </div>
  );
}

function RulesPanel({ state, setState }) {
  const blank = { condType: 'always', qId: '', eqVal: true, taskId: '', deps: [], replaces: '', onlyIfActive: false };
  const [form, setForm] = useState(blank);
  const taskName = (id) => state.tasks.find((t) => t.id === id)?.name || id;
  const qText = (id) => state.questions.find((q) => q.id === id)?.text || id;

  const toggleDep = (id) => {
    setForm((f) => ({ ...f, deps: f.deps.includes(id) ? f.deps.filter((d) => d !== id) : [...f.deps, id] }));
  };
  const add = () => {
    if (!form.taskId) return;
    const r = {
      id: genId('r'),
      if_question_id: form.condType === 'always' ? null : form.qId || null,
      equals_value: form.condType === 'always' ? null : form.eqVal,
      then_add_task_id: form.taskId,
      depends_on_task_ids: form.deps,
      replaces_task_id: form.replaces || null,
      only_if_active: form.onlyIfActive,
    };
    setState((s) => ({ ...s, rules: [...s.rules, r] }));
    setForm(blank);
  };
  const del = (id) => setState((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }));

  const describeRule = (r) => {
    const cond = r.if_question_id ? `SE "${qText(r.if_question_id).slice(0, 35)}" = ${r.equals_value ? 'Sim' : 'Não'}` : 'SEMPRE';
    const task = taskName(r.then_add_task_id);
    const deps = r.depends_on_task_ids.length ? `após [${r.depends_on_task_ids.map(taskName).join(', ')}]` : '(sem deps)';
    const repl = r.replaces_task_id ? ` ⤳ substitui "${taskName(r.replaces_task_id)}"` : '';
    const upd = r.only_if_active ? ' [somente atualiza]' : '';
    return `${cond} → ${task} ${deps}${repl}${upd}`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 flex flex-col lg:col-span-1">
      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">{state.rules.length}</span>
        Regras (Gatilhos)
      </h3>
      <div className="space-y-1.5 flex-1 overflow-auto mb-4 max-h-[320px]">
        {state.rules.map((r) => (
          <div key={r.id} className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-start gap-2">
            <p className="text-[11px] text-gray-600 leading-snug">{describeRule(r)}</p>
            <button onClick={() => del(r.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500">Criar Gatilho</p>
        <div className="flex gap-2">
          <select value={form.condType} onChange={(e) => setForm((f) => ({ ...f, condType: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none flex-1">
            <option value="always">Sempre</option>
            <option value="cond">Condicional</option>
          </select>
          {form.condType === 'cond' && (
            <>
              <select value={form.qId} onChange={(e) => setForm((f) => ({ ...f, qId: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none flex-1">
                <option value="">Pergunta...</option>
                {state.questions.map((q) => <option key={q.id} value={q.id}>{q.text.slice(0, 30)}</option>)}
              </select>
              <select value={form.eqVal} onChange={(e) => setForm((f) => ({ ...f, eqVal: e.target.value === 'true' }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none w-16">
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </>
          )}
        </div>
        <select value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none">
          <option value="">Etapa a adicionar...</option>
          {state.tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="max-h-24 overflow-auto border border-gray-200 rounded-lg p-2">
          <p className="text-[10px] text-gray-400 mb-1">Depende de:</p>
          {state.tasks.map((t) => (
            <label key={t.id} className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.deps.includes(t.id)} onChange={() => toggleDep(t.id)} className="rounded" />
              {t.name}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={form.replaces} onChange={(e) => setForm((f) => ({ ...f, replaces: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none">
            <option value="">Não substitui nenhuma</option>
            {state.tasks.map((t) => <option key={t.id} value={t.id}>Substitui: {t.name}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={form.onlyIfActive} onChange={(e) => setForm((f) => ({ ...f, onlyIfActive: e.target.checked }))} className="rounded" />
            Só atualiza
          </label>
        </div>
        <button onClick={add} className="w-full bg-amber-600 text-white text-sm py-1.5 rounded-lg hover:bg-amber-700 cursor-pointer">+ Adicionar Regra</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. SIMULATOR TAB — Dynamic form + React Flow + Critical Path
// ═══════════════════════════════════════════════════════════════════════════════
function SimulatorTab({ state }) {
  const [answers, setAnswers] = useState({});
  const [overrides, setOverrides] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Compute effective answers (reset hidden question answers)
  const effectiveAnswers = useMemo(() => {
    const eff = { ...answers };
    state.questions.forEach((q) => {
      if (q.visible_when) {
        const parentAns = eff[q.visible_when.question_id];
        if (parentAns !== q.visible_when.equals_value) eff[q.id] = false;
      }
      if (eff[q.id] === undefined) eff[q.id] = false;
    });
    return eff;
  }, [answers, state.questions]);

  // Run rule engine
  const activeMap = useMemo(() => evaluateRules(state.rules, effectiveAnswers), [state.rules, effectiveAnswers]);

  // Build enriched task entries with durations
  const taskEntries = useMemo(() => {
    const catalog = Object.fromEntries(state.tasks.map((t) => [t.id, t]));
    return [...activeMap.entries()].map(([id, data]) => {
      const dur = overrides[id] ?? catalog[id]?.default_duration_months ?? 0;
      return [id, { ...data, duration: dur }];
    });
  }, [activeMap, state.tasks, overrides]);

  // Critical path
  const { total, criticalIds } = useMemo(() => calculateCriticalPath(taskEntries), [taskEntries]);

  // Build React Flow graph
  useEffect(() => {
    const { nodes: n, edges: e } = buildFlowGraph(taskEntries, state.tasks, criticalIds);
    setNodes(n);
    setEdges(e);
  }, [taskEntries, state.tasks, criticalIds, setNodes, setEdges]);

  const handleNodeClick = useCallback((_ev, node) => setSelectedNode(node), []);
  const handleSave = useCallback((id, dur) => {
    setOverrides((p) => ({ ...p, [id]: dur }));
    setSelectedNode(null);
  }, []);

  const toggleAnswer = (qId) => setAnswers((p) => ({ ...p, [qId]: !p[qId] }));

  // Count active rules
  const activeRuleCount = useMemo(() => {
    return state.rules.filter((r) => {
      if (!r.if_question_id) return true;
      return effectiveAnswers[r.if_question_id] === r.equals_value;
    }).length;
  }, [state.rules, effectiveAnswers]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left — Dynamic Form */}
      <aside className="w-[380px] flex-shrink-0 p-5 overflow-y-auto border-r border-gray-200 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Simulador</h2>
              <p className="text-xs text-gray-500">Responda para gerar o cenário em tempo real</p>
            </div>
          </div>
          <div className="space-y-0">
            {state.questions.map((q) => {
              const visible = !q.visible_when || effectiveAnswers[q.visible_when.question_id] === q.visible_when.equals_value;
              if (!visible) return null;
              const val = !!effectiveAnswers[q.id];
              return (
                <div key={q.id} className={`flex items-center justify-between py-3 border-b border-gray-100 last:border-0 ${q.visible_when ? 'pl-3 border-l-2 border-l-amber-400 animate-slideDown' : ''}`}>
                  <span className="text-sm text-gray-700 font-medium pr-4 leading-snug">{q.text}</span>
                  <button type="button" onClick={() => toggleAnswer(q.id)} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer ${val ? 'bg-blue-600' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${val ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 mb-4 animate-fadeIn">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Resultado do Motor</h4>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-blue-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-blue-700">{activeMap.size}</div>
              <div className="text-[10px] text-blue-500">Etapas Ativas</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-amber-700">{activeRuleCount}</div>
              <div className="text-[10px] text-amber-500">Regras Ativas</div>
            </div>
            <div className="bg-red-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-red-700">{criticalIds.size}</div>
              <div className="text-[10px] text-red-500">No Cam. Crítico</div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Legenda</h4>
          <div className="space-y-2">
            {[['#059669', 'Marco (Início/Fim)'], ['#1e40af', 'Etapa Fixa'], ['#d97706', 'Etapa Condicional']].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                <span className="text-xs text-gray-600">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm border-2 border-red-400 bg-white" />
              <span className="text-xs text-gray-600">Caminho Crítico (gargalo)</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">💡 Clique em qualquer nó para editar sua duração.</p>
        </div>
      </aside>

      {/* Right — Graph */}
      <main className="flex-1 relative">
        {/* Total banner */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl shadow-lg animate-fadeIn">
          <span className="text-xs font-medium opacity-80 block leading-tight">Prazo Total Previsto até a Obra</span>
          <span className="text-2xl font-extrabold">{fmtTotal(total)} {total === 1 ? 'mês' : 'meses'}</span>
        </div>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.4 }}
          minZoom={0.2} maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={20} size={1} />
          <Controls showInteractive={false} className="!bg-white !shadow-lg !border !border-gray-200 !rounded-xl" />
        </ReactFlow>
      </main>

      {selectedNode && <EditModal node={selectedNode} onSave={handleSave} onClose={() => setSelectedNode(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. MAIN APP — Tabs + Global State
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [state, setState] = useState(INITIAL_STATE);
  const [tab, setTab] = useState('simulator');

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header + Tabs */}
      <header className="bg-white border-b border-gray-200 px-6 py-0 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 py-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight">Simulador de Legalização</h1>
            <p className="text-xs text-gray-500">Victa Construtora — Motor de Regras · Fortaleza/CE</p>
          </div>
        </div>
        <nav className="flex h-full">
          {[
            { key: 'admin', label: '1. Configuração de Regras', icon: '⚙️' },
            { key: 'simulator', label: '2. Simulador', icon: '🚀' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
        <div className="text-xs text-gray-400">
          {state.questions.length}P · {state.tasks.length}E · {state.rules.length}R
        </div>
      </header>

      {/* Body */}
      {tab === 'admin' && <AdminTab state={state} setState={setState} />}
      {tab === 'simulator' && <SimulatorTab state={state} />}
    </div>
  );
}
