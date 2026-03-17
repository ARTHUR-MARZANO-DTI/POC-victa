import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { INITIAL_STATE } from './data.js';
import {
  genId,
  fmt,
  fmtTotal,
  fmtCurrency,
  evaluateRules,
  calculateRange,
  buildFlowGraph,
  getHistoryStats,
  calculateGoalSeek,
} from './engine.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CUSTOM NODE — React Flow node with time breakdown + uncertainty
// ═══════════════════════════════════════════════════════════════════════════════
const COLORS = {
  milestone:   { bg: '#059669', border: '#047857' },
  fixed:       { bg: '#1e40af', border: '#1e3a8a' },
  conditional: { bg: '#d97706', border: '#b45309' },
  uncertain:   { bg: '#6b7280', border: '#4b5563' },
};

function CustomNode({ data }) {
  const c = COLORS[data.variant] || COLORS.fixed;
  const showBreakdown = data.internal > 0 || data.external > 0;
  return (
    <div
      className={`rounded-xl shadow-lg px-4 py-3 min-w-[220px] text-center text-white transition-all hover:scale-105 hover:shadow-xl ${data.isCritical ? 'ring-2 ring-red-400 ring-offset-2' : ''} ${data.isUncertain ? 'node-uncertain' : ''}`}
      style={{ background: c.bg, border: `2px solid ${data.isCritical ? '#ef4444' : c.border}` }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-3 !h-3" />
      <div className="font-bold text-sm leading-tight">{data.label}</div>
      <div className="mt-1 text-xs opacity-90 font-medium">{fmt(data.duracao)}</div>
      {showBreakdown && data.duracao > 0 && (
        <div className="mt-1 text-[10px] opacity-70 flex justify-center gap-2">
          <span>🏢 {data.internal}m</span>
          <span>🏛️ {data.external}m</span>
        </div>
      )}
      {data.cost > 0 && (
        <div className="mt-0.5 text-[10px] opacity-70">{fmtCurrency(data.cost)}</div>
      )}
      {data.isCritical && (
        <div className="mt-1 text-[10px] font-semibold text-red-200 uppercase tracking-wider">Caminho Crítico</div>
      )}
      {data.isUncertain && (
        <div className="mt-1 text-[10px] font-semibold text-yellow-200 uppercase tracking-wider">⚠ Incerto</div>
      )}
      {data.historyAvg !== undefined && (
        <div className="mt-0.5 text-[10px] opacity-70">📊 Hist: {fmtTotal(data.historyAvg)}m ({data.historyCount}p)</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-3 !h-3" />
    </div>
  );
}
const nodeTypes = { custom: CustomNode };

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EDIT MODAL — Click node to edit duration
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fadeIn" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] border border-gray-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Editar Duração</h3>
        <p className="text-sm text-gray-500 mb-4">{node.data.label}</p>
        <form onSubmit={submit}>
          <label htmlFor="dur-input" className="block text-sm font-medium text-gray-700 mb-1">Duração (meses)</label>
          <input id="dur-input" type="number" min="0" step="0.5" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
          <p className="text-xs text-gray-400 mt-1">Valores decimais permitidos (ex: 4,5)</p>
          {node.data.internal > 0 && (
            <div className="mt-3 p-2.5 bg-gray-50 rounded-lg text-xs text-gray-600">
              <p>🏢 Tempo Interno (Victa): <strong>{node.data.internal}m</strong></p>
              <p>🏛️ Tempo Externo (Órgão): <strong>{node.data.external}m</strong></p>
            </div>
          )}
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
// 3. ADMIN TAB — CRUD for Questions, Tasks, Rules + Region context
// ═══════════════════════════════════════════════════════════════════════════════
function AdminTab({ state, setState }) {
  const [adminRegion, setAdminRegion] = useState(state.regions[0]?.id || '');

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-semibold text-gray-600">Região de contexto:</label>
          <select value={adminRegion} onChange={(e) => setAdminRegion(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-400">
            {state.regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}/{r.state}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <QuestionsPanel state={state} setState={setState} regionId={adminRegion} />
          <TasksPanel state={state} setState={setState} regionId={adminRegion} />
          <RulesPanel state={state} setState={setState} regionId={adminRegion} />
        </div>
      </div>
    </div>
  );
}

// ── Questions Panel ──
function QuestionsPanel({ state, setState, regionId }) {
  const [text, setText] = useState('');
  const [type, setType] = useState('boolean');
  const [visQ, setVisQ] = useState('');
  const [elimMsg, setElimMsg] = useState('');
  const [opts, setOpts] = useState('');

  const regionQs = state.questions.filter((q) => q.region_id === regionId);

  const add = () => {
    if (!text.trim()) return;
    const options = type === 'select'
      ? opts.split(',').map((o) => o.trim()).filter(Boolean).map((o) => ({ value: o.toLowerCase().replace(/\s+/g, '_'), label: o }))
      : null;
    const q = {
      id: genId('q'), text: text.trim(), type, region_id: regionId,
      visible_when: visQ ? { question_id: visQ, equals_value: true } : null,
      eliminatory: elimMsg ? { value: true, message: elimMsg } : null,
      options,
    };
    setState((s) => ({ ...s, questions: [...s.questions, q] }));
    setText(''); setType('boolean'); setVisQ(''); setElimMsg(''); setOpts('');
  };
  const del = (id) => setState((s) => ({ ...s, questions: s.questions.filter((q) => q.id !== id) }));

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 flex flex-col">
      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">{regionQs.length}</span>
        Perguntas
      </h3>
      <div className="space-y-2 flex-1 overflow-auto mb-4 max-h-[320px]">
        {regionQs.map((q) => (
          <div key={q.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-medium text-gray-700">{q.text}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{q.type}</span>
                {q.eliminatory && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">Eliminatória</span>}
                {q.visible_when && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600">Condicional</span>}
              </div>
            </div>
            <button onClick={() => del(q.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <input placeholder="Texto da pergunta..." value={text} onChange={(e) => setText(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-400" />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none">
            <option value="boolean">Sim/Não</option>
            <option value="select">Seleção (Dropdown)</option>
          </select>
          <select value={visQ} onChange={(e) => setVisQ(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none">
            <option value="">Sempre visível</option>
            {regionQs.map((q) => <option key={q.id} value={q.id}>Quando: {q.text.slice(0, 25)}...</option>)}
          </select>
        </div>
        {type === 'select' && (
          <input placeholder="Opções separadas por vírgula (ex: ZIA, ZO, ZRM)" value={opts} onChange={(e) => setOpts(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-purple-400" />
        )}
        <input placeholder="Mensagem eliminatória (vazio = não eliminatória)" value={elimMsg} onChange={(e) => setElimMsg(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-red-300" />
        <button onClick={add} className="w-full bg-purple-600 text-white text-sm py-1.5 rounded-lg hover:bg-purple-700 cursor-pointer">+ Adicionar Pergunta</button>
      </div>
    </div>
  );
}

// ── Tasks Panel ──
function TasksPanel({ state, setState, regionId }) {
  const [name, setName] = useState('');
  const [dur, setDur] = useState('');
  const [minD, setMinD] = useState('');
  const [maxD, setMaxD] = useState('');
  const [intD, setIntD] = useState('');
  const [extD, setExtD] = useState('');
  const [cost, setCost] = useState('');

  const regionTs = state.tasks.filter((t) => t.region_id === regionId);

  const add = () => {
    if (!name.trim()) return;
    const d = Number.parseFloat(dur) || 0;
    const t = {
      id: genId('t'), name: name.trim(), region_id: regionId,
      default_duration_months: d,
      min_duration_months: Number.parseFloat(minD) || d * 0.7,
      max_duration_months: Number.parseFloat(maxD) || d * 1.4,
      internal_months: Number.parseFloat(intD) || 0,
      external_months: Number.parseFloat(extD) || d,
      estimated_cost: Number.parseFloat(cost) || 0,
    };
    setState((s) => ({ ...s, tasks: [...s.tasks, t] }));
    setName(''); setDur(''); setMinD(''); setMaxD(''); setIntD(''); setExtD(''); setCost('');
  };
  const del = (id) => setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 flex flex-col">
      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{regionTs.length}</span>
        Etapas (Tasks)
      </h3>
      <div className="space-y-2 flex-1 overflow-auto mb-4 max-h-[320px]">
        {regionTs.map((t) => (
          <div key={t.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-center gap-2">
            <div>
              <p className="text-xs font-medium text-gray-700">{t.name}</p>
              <p className="text-[10px] text-gray-400">{t.default_duration_months}m ({t.min_duration_months}–{t.max_duration_months}) · {fmtCurrency(t.estimated_cost)}</p>
            </div>
            <button onClick={() => del(t.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <input placeholder="Nome da etapa..." value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400" />
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Mín (m)" type="number" step="0.5" min="0" value={minD} onChange={(e) => setMinD(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none" />
          <input placeholder="Padrão (m)" type="number" step="0.5" min="0" value={dur} onChange={(e) => setDur(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none" />
          <input placeholder="Máx (m)" type="number" step="0.5" min="0" value={maxD} onChange={(e) => setMaxD(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Interno (m)" type="number" step="0.5" min="0" value={intD} onChange={(e) => setIntD(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none" />
          <input placeholder="Externo (m)" type="number" step="0.5" min="0" value={extD} onChange={(e) => setExtD(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none" />
          <input placeholder="Custo (R$)" type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none" />
        </div>
        <button onClick={add} className="w-full bg-blue-600 text-white text-sm py-1.5 rounded-lg hover:bg-blue-700 cursor-pointer">+ Adicionar Etapa</button>
      </div>
    </div>
  );
}

// ── Rules Panel ──
function RulesPanel({ state, setState, regionId }) {
  const blank = { condType: 'always', qId: '', eqVal: '', taskId: '', deps: [], replaces: '', onlyIfActive: false };
  const [form, setForm] = useState(blank);

  const regionQs = state.questions.filter((q) => q.region_id === regionId);
  const regionTs = state.tasks.filter((t) => t.region_id === regionId);
  const regionRs = state.rules.filter((r) => r.region_id === regionId);

  const taskName = (id) => state.tasks.find((t) => t.id === id)?.name || id;
  const qText = (id) => state.questions.find((q) => q.id === id)?.text || id;
  const selectedQ = regionQs.find((q) => q.id === form.qId);

  const toggleDep = (id) => {
    setForm((f) => ({ ...f, deps: f.deps.includes(id) ? f.deps.filter((d) => d !== id) : [...f.deps, id] }));
  };

  const add = () => {
    if (!form.taskId) return;
    let eqVal = null;
    if (form.condType === 'cond') {
      if (selectedQ?.type === 'boolean') eqVal = form.eqVal === 'true';
      else eqVal = form.eqVal || null;
    }
    const r = {
      id: genId('r'), region_id: regionId,
      if_question_id: form.condType === 'always' ? null : form.qId || null,
      equals_value: form.condType === 'always' ? null : eqVal,
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
    let cond = 'SEMPRE';
    if (r.if_question_id) {
      const val = r.equals_value === true ? 'Sim' : r.equals_value === false ? 'Não' : `"${r.equals_value}"`;
      cond = `SE "${qText(r.if_question_id).slice(0, 30)}" = ${val}`;
    }
    const task = taskName(r.then_add_task_id);
    const deps = r.depends_on_task_ids.length ? `após [${r.depends_on_task_ids.map(taskName).join(', ')}]` : '';
    const repl = r.replaces_task_id ? ` ⤳ substitui "${taskName(r.replaces_task_id)}"` : '';
    const upd = r.only_if_active ? ' [merge deps]' : '';
    return `${cond} → ${task} ${deps}${repl}${upd}`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 flex flex-col">
      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">{regionRs.length}</span>
        Regras (Gatilhos)
      </h3>
      <div className="space-y-1.5 flex-1 overflow-auto mb-4 max-h-[320px]">
        {regionRs.map((r) => (
          <div key={r.id} className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-start gap-2">
            <p className="text-[11px] text-gray-600 leading-snug">{describeRule(r)}</p>
            <button onClick={() => del(r.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500">Criar Gatilho</p>
        <div className="flex gap-2">
          <select value={form.condType} onChange={(e) => setForm((f) => ({ ...f, condType: e.target.value, qId: '', eqVal: '' }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none flex-1">
            <option value="always">Sempre</option>
            <option value="cond">Condicional</option>
          </select>
          {form.condType === 'cond' && (
            <>
              <select value={form.qId} onChange={(e) => setForm((f) => ({ ...f, qId: e.target.value, eqVal: '' }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none flex-1">
                <option value="">Pergunta...</option>
                {regionQs.map((q) => <option key={q.id} value={q.id}>{q.text.slice(0, 25)}</option>)}
              </select>
              {selectedQ?.type === 'boolean' ? (
                <select value={form.eqVal} onChange={(e) => setForm((f) => ({ ...f, eqVal: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none w-16">
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              ) : selectedQ?.type === 'select' ? (
                <select value={form.eqVal} onChange={(e) => setForm((f) => ({ ...f, eqVal: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none flex-1">
                  <option value="">Valor...</option>
                  {selectedQ.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : null}
            </>
          )}
        </div>
        <select value={form.taskId} onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none">
          <option value="">Etapa a adicionar...</option>
          {regionTs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="max-h-24 overflow-auto border border-gray-200 rounded-lg p-2">
          <p className="text-[10px] text-gray-400 mb-1">Depende de:</p>
          {regionTs.map((t) => (
            <label key={t.id} className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.deps.includes(t.id)} onChange={() => toggleDep(t.id)} className="rounded" />
              {t.name}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={form.replaces} onChange={(e) => setForm((f) => ({ ...f, replaces: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none">
            <option value="">Não substitui nenhuma</option>
            {regionTs.map((t) => <option key={t.id} value={t.id}>Substitui: {t.name}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={form.onlyIfActive} onChange={(e) => setForm((f) => ({ ...f, onlyIfActive: e.target.checked }))} className="rounded" />
            Merge deps
          </label>
        </div>
        <button onClick={add} className="w-full bg-amber-600 text-white text-sm py-1.5 rounded-lg hover:bg-amber-700 cursor-pointer">+ Adicionar Regra</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. GOAL-SEEK PANEL — Reverse calculation from target date
// ═══════════════════════════════════════════════════════════════════════════════
function GoalSeekPanel({ totalDefault, schedule, taskCatalog }) {
  const [targetDate, setTargetDate] = useState('');
  const [open, setOpen] = useState(false);

  const result = useMemo(() => {
    if (!targetDate || !totalDefault) return null;
    return calculateGoalSeek(targetDate, totalDefault, schedule, taskCatalog);
  }, [targetDate, totalDefault, schedule, taskCatalog]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 mb-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          🎯 Engenharia Reversa (Goal-Seek)
        </h4>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 animate-slideDown">
          <div>
            <label className="text-xs text-gray-600 block mb-1">Data alvo de lançamento:</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          {result && (
            <div className="space-y-2">
              <div className={`p-3 rounded-lg text-sm font-medium ${result.feasible ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {result.feasible
                  ? `✅ Viável! Folga de ${fmtTotal(result.slack)} meses`
                  : `❌ Inviável: faltam ${fmtTotal(Math.abs(result.slack))} meses`}
              </div>
              <div className="text-xs text-gray-500">
                Meses disponíveis: <strong>{result.monthsAvailable}</strong> · Prazo estimado: <strong>{fmtTotal(result.totalMonths)}</strong>
              </div>
              {result.deadlines.filter((d) => d.isCritical).length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Datas-limite (caminho crítico):</p>
                  {result.deadlines.filter((d) => d.isCritical).map((d) => (
                    <div key={d.taskId} className="flex justify-between text-xs py-1 border-b border-gray-50">
                      <span className="text-gray-600 font-medium">{d.taskName}</span>
                      <span className={`font-semibold ${result.feasible ? 'text-green-700' : 'text-red-600'}`}>{d.latestStart.toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SCENARIOS PANEL — Save / Compare scenarios
// ═══════════════════════════════════════════════════════════════════════════════
function ScenariosPanel({ scenarios, onSave, onLoad, onDelete }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 mb-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between cursor-pointer">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          📋 Cenários Salvos ({scenarios.length})
        </h4>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 animate-slideDown">
          <div className="flex gap-2">
            <input placeholder="Nome do cenário..." value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-400" />
            <button onClick={handleSave} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 cursor-pointer whitespace-nowrap">Salvar</button>
          </div>
          {scenarios.length > 0 ? (
            <div className="space-y-1.5 max-h-[200px] overflow-auto">
              {scenarios.map((sc) => (
                <div key={sc.id} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{sc.name}</p>
                    <p className="text-[10px] text-gray-400">{sc.regionName} · {fmtTotal(sc.totalMin)}–{fmtTotal(sc.totalMax)}m · {sc.taskCount} etapas</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => onLoad(sc)} className="text-blue-500 hover:text-blue-700 text-[10px] cursor-pointer font-medium">Carregar</button>
                    <button onClick={() => onDelete(sc.id)} className="text-red-400 hover:text-red-600 text-xs cursor-pointer">✕</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">Nenhum cenário salvo</p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SIMULATOR TAB — Dynamic form + React Flow + Critical Path + Goals
// ═══════════════════════════════════════════════════════════════════════════════
function SimulatorTab({ state, setState }) {
  const [regionId, setRegionId] = useState(state.regions[0]?.id || '');
  const [answers, setAnswers] = useState({});
  const [overrides, setOverrides] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const switchRegion = (newId) => {
    setRegionId(newId);
    setAnswers({});
    setOverrides({});
  };

  const regionQuestions = useMemo(
    () => state.questions.filter((q) => q.region_id === regionId),
    [state.questions, regionId],
  );

  // Compute effective answers
  const effectiveAnswers = useMemo(() => {
    const eff = { ...answers };
    regionQuestions.forEach((q) => {
      if (q.visible_when) {
        const parentAns = eff[q.visible_when.question_id];
        if (parentAns !== q.visible_when.equals_value) {
          eff[q.id] = q.type === 'boolean' ? false : '';
        }
      }
      if (eff[q.id] === undefined) {
        eff[q.id] = q.type === 'boolean' ? false : '';
      }
    });
    return eff;
  }, [answers, regionQuestions]);

  // Eliminatory check
  const eliminatoryAlert = useMemo(() => {
    for (const q of regionQuestions) {
      if (q.eliminatory && effectiveAnswers[q.id] === q.eliminatory.value) {
        return { question: q, message: q.eliminatory.message };
      }
    }
    return null;
  }, [regionQuestions, effectiveAnswers]);

  // Run rule engine
  const { activeMap, uncertainTasks, conditionalTasks } = useMemo(
    () => evaluateRules(state.rules, effectiveAnswers, regionId),
    [state.rules, effectiveAnswers, regionId],
  );

  // Region tasks
  const regionTasks = useMemo(
    () => state.tasks.filter((t) => t.region_id === regionId),
    [state.tasks, regionId],
  );

  // Calculate range (min/default/max) + critical path
  const {
    totalDefault,
    totalMin,
    totalMax,
    criticalIds,
    schedule,
    taskEntries,
  } = useMemo(
    () => calculateRange(activeMap, regionTasks, overrides),
    [activeMap, regionTasks, overrides],
  );

  // Total cost
  const totalCost = useMemo(() => {
    const catalog = Object.fromEntries(regionTasks.map((t) => [t.id, t]));
    let sum = 0;
    activeMap.forEach((_data, id) => { sum += catalog[id]?.estimated_cost || 0; });
    return sum;
  }, [activeMap, regionTasks]);

  // Build React Flow graph
  useEffect(() => {
    const enriched = taskEntries.map(([id, data]) => {
      const hist = getHistoryStats(state.history, id, regionId);
      return [id, { ...data, historyAvg: hist?.avg, historyCount: hist?.count }];
    });

    const { nodes: n, edges: e } = buildFlowGraph(
      enriched, regionTasks, criticalIds, uncertainTasks, conditionalTasks, schedule,
    );

    n.forEach((node) => {
      const entry = enriched.find(([id]) => id === node.id);
      if (entry?.[1].historyAvg !== undefined) {
        node.data.historyAvg = entry[1].historyAvg;
        node.data.historyCount = entry[1].historyCount;
      }
    });

    setNodes(n);
    setEdges(e);
  }, [taskEntries, regionTasks, criticalIds, uncertainTasks, conditionalTasks, schedule, state.history, regionId, setNodes, setEdges]);

  const handleNodeClick = useCallback((_ev, node) => setSelectedNode(node), []);
  const handleSave = useCallback((id, dur) => {
    setOverrides((p) => ({ ...p, [id]: dur }));
    setSelectedNode(null);
  }, []);

  const setAnswer = useCallback((qId, val) => setAnswers((p) => ({ ...p, [qId]: val })), []);

  // Active rules count
  const activeRuleCount = useMemo(() => {
    return state.rules.filter((r) => {
      if (r.region_id && r.region_id !== regionId) return false;
      if (!r.if_question_id) return true;
      const a = effectiveAnswers[r.if_question_id];
      if (a === 'unknown') return true;
      return a === r.equals_value;
    }).length;
  }, [state.rules, effectiveAnswers, regionId]);

  // Scenarios
  const handleSaveScenario = useCallback((name) => {
    const region = state.regions.find((r) => r.id === regionId);
    const sc = {
      id: genId('sc'), name,
      savedAt: new Date().toISOString(),
      regionId,
      regionName: region ? `${region.name}/${region.state}` : regionId,
      answers: { ...answers },
      overrides: { ...overrides },
      totalDefault, totalMin, totalMax,
      taskCount: activeMap.size,
    };
    setState((s) => ({ ...s, scenarios: [...s.scenarios, sc] }));
  }, [answers, overrides, regionId, totalDefault, totalMin, totalMax, activeMap.size, state.regions, setState]);

  const handleLoadScenario = useCallback((sc) => {
    setRegionId(sc.regionId);
    setAnswers(sc.answers);
    setOverrides(sc.overrides);
  }, []);

  const handleDeleteScenario = useCallback((id) => {
    setState((s) => ({ ...s, scenarios: s.scenarios.filter((sc) => sc.id !== id) }));
  }, [setState]);

  const currentRegion = state.regions.find((r) => r.id === regionId);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left — Dynamic Form */}
      <aside className="w-[400px] flex-shrink-0 p-5 overflow-y-auto border-r border-gray-200 bg-gray-50">
        {/* Region selector */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-lg">📍</div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Região / Legislação</label>
              <select value={regionId} onChange={(e) => switchRegion(e.target.value)} className="w-full mt-0.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-400">
                {state.regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} / {r.state}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Eliminatory Alert */}
        {eliminatoryAlert && (
          <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4 mb-4 animate-fadeIn">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">⛔</span>
              <div>
                <p className="text-sm font-bold text-red-800">Projeto Bloqueado</p>
                <p className="text-xs text-red-600 mt-1">{eliminatoryAlert.message}</p>
                <p className="text-[10px] text-red-400 mt-2">Pergunta: {eliminatoryAlert.question.text}</p>
              </div>
            </div>
          </div>
        )}

        {/* Questions form */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">Simulador</h2>
              <p className="text-[10px] text-gray-500">Responda para gerar o cenário · {currentRegion?.name}/{currentRegion?.state}</p>
            </div>
          </div>
          <div className="space-y-0">
            {regionQuestions.map((q) => {
              const visible = !q.visible_when || effectiveAnswers[q.visible_when.question_id] === q.visible_when.equals_value;
              if (!visible) return null;
              return (
                <div key={q.id} className={`py-3 border-b border-gray-100 last:border-0 ${q.visible_when ? 'pl-3 border-l-2 border-l-amber-400 animate-slideDown' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-700 font-medium leading-snug flex-1">
                      {q.text}
                      {q.eliminatory && <span className="ml-1 text-red-400 text-[10px]">⚠</span>}
                    </span>
                    {q.type === 'boolean' ? (
                      <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                        <button type="button" onClick={() => setAnswer(q.id, false)}
                          className={`px-2 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${effectiveAnswers[q.id] === false ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
                          Não
                        </button>
                        <button type="button" onClick={() => setAnswer(q.id, 'unknown')}
                          className={`px-2 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${effectiveAnswers[q.id] === 'unknown' ? 'bg-amber-100 shadow text-amber-700' : 'text-gray-400 hover:text-gray-600'}`}>
                          ?
                        </button>
                        <button type="button" onClick={() => setAnswer(q.id, true)}
                          className={`px-2 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer ${effectiveAnswers[q.id] === true ? 'bg-blue-600 shadow text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                          Sim
                        </button>
                      </div>
                    ) : q.type === 'select' ? (
                      <select value={effectiveAnswers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs max-w-[180px] outline-none focus:ring-1 focus:ring-blue-400 flex-shrink-0">
                        <option value="">Selecione...</option>
                        {q.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        <option value="unknown">⚠ Não sei</option>
                      </select>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Goal-Seek */}
        <GoalSeekPanel totalDefault={totalDefault} schedule={schedule} taskCatalog={regionTasks} />

        {/* Stats */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 mb-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Resultado do Motor</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-blue-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-blue-700">{activeMap.size}</div>
              <div className="text-[10px] text-blue-500">Etapas</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-amber-700">{activeRuleCount}</div>
              <div className="text-[10px] text-amber-500">Regras</div>
            </div>
            <div className="bg-red-50 rounded-xl p-2">
              <div className="text-lg font-extrabold text-red-700">{criticalIds.size}</div>
              <div className="text-[10px] text-red-500">Cam. Crítico</div>
            </div>
          </div>
          {uncertainTasks.size > 0 && (
            <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-[10px] text-amber-700 font-medium">⚠ {uncertainTasks.size} etapa(s) incerta(s) por respostas "Não sei"</p>
            </div>
          )}
        </div>

        {/* Scenarios */}
        <ScenariosPanel
          scenarios={state.scenarios}
          onSave={handleSaveScenario}
          onLoad={handleLoadScenario}
          onDelete={handleDeleteScenario}
        />

        {/* Legend */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Legenda</h4>
          <div className="space-y-1.5">
            {[
              ['#059669', 'Marco (Início/Fim)'],
              ['#1e40af', 'Etapa Fixa (sempre presente)'],
              ['#d97706', 'Etapa Condicional'],
              ['#6b7280', 'Etapa Incerta ("Não sei")'],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                <span className="text-[11px] text-gray-600">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm border-2 border-red-400 bg-white flex-shrink-0" />
              <span className="text-[11px] text-gray-600">Caminho Crítico (gargalo)</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-[10px] text-gray-400">
            <p>🏢 = Tempo Interno (Victa) · 🏛️ = Tempo Externo (Órgão)</p>
            <p>📊 = Histórico (média projetos passados)</p>
            <p>💡 Clique em qualquer nó para editar sua duração.</p>
          </div>
        </div>
      </aside>

      {/* Right — Graph */}
      <main className="flex-1 relative">
        {eliminatoryAlert ? (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-red-600 text-white px-8 py-3 rounded-xl shadow-lg animate-fadeIn">
            <span className="text-base font-extrabold">⛔ Projeto Bloqueado</span>
          </div>
        ) : (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl shadow-lg animate-fadeIn min-w-[360px]">
            <div className="flex items-center justify-between gap-6">
              <div>
                <span className="text-[10px] font-medium opacity-80 block leading-tight uppercase tracking-wider">Prazo Total Previsto</span>
                <span className="text-2xl font-extrabold">{fmtTotal(totalMin)} – {fmtTotal(totalMax)} meses</span>
                <span className="text-xs opacity-80 block">estimativa central: {fmtTotal(totalDefault)} meses</span>
              </div>
              {totalCost > 0 && (
                <div className="text-right border-l border-white/20 pl-5">
                  <span className="text-[10px] font-medium opacity-80 block uppercase tracking-wider">Custo Est.</span>
                  <span className="text-lg font-bold">{fmtCurrency(totalCost)}</span>
                </div>
              )}
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.4 }}
          minZoom={0.15} maxZoom={1.5}
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
// 7. MAIN APP — Tabs + Global State
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [state, setState] = useState(INITIAL_STATE);
  const [tab, setTab] = useState('simulator');

  const regionCounts = useMemo(() => {
    return `${state.questions.length}P · ${state.tasks.length}E · ${state.rules.length}R`;
  }, [state.questions.length, state.tasks.length, state.rules.length]);

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-0 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 py-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight">Simulador de Legalização</h1>
            <p className="text-xs text-gray-500">Victa Construtora — Motor de Regras Multi-Região</p>
          </div>
        </div>
        <nav className="flex h-full">
          {[
            { key: 'admin', label: '1. Configuração de Regras', icon: '⚙️' },
            { key: 'simulator', label: '2. Simulador', icon: '🚀' },
          ].map((t) => (
            <button
              key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
        <div className="text-xs text-gray-400">{regionCounts}</div>
      </header>
      {tab === 'admin' && <AdminTab state={state} setState={setState} />}
      {tab === 'simulator' && <SimulatorTab state={state} setState={setState} />}
    </div>
  );
}
