import { useState } from 'react';
import Modal from '../components/Modal';
import { genId } from '../engine';

const TYPES = [
  { value: 'boolean', label: 'Sim / Não' },
  { value: 'number_gt', label: 'Número (maior que)' },
  { value: 'number_lt', label: 'Número (menor que)' },
  { value: 'select', label: 'Opções' },
];

function emptyQuestion(localityId) {
  return {
    id: genId('q'),
    text: '',
    type: 'boolean',
    localityId: localityId || null,
    eliminatory: null,
    stepsToAdd: [],
    triggerValue: true,
    threshold: null,
    unit: '',
    options: [],
    subQuestions: [],
  };
}

function emptySubQuestion() {
  return {
    id: genId('sq'),
    text: '',
    type: 'boolean',
    stepsToAdd: [],
    triggerValue: true,
    threshold: null,
    unit: '',
    eliminatory: null,
    subQuestions: [],
  };
}

export default function QuestionsPage({ state, update }) {
  const [editing, setEditing] = useState(null);
  const [filterLocality, setFilterLocality] = useState('all');

  const filtered = filterLocality === 'all'
    ? state.questions
    : filterLocality === 'general'
      ? state.questions.filter((q) => !q.localityId)
      : state.questions.filter((q) => q.localityId === filterLocality);

  const save = (q) => {
    const exists = state.questions.find((x) => x.id === q.id);
    if (exists) {
      update({ questions: state.questions.map((x) => (x.id === q.id ? q : x)) });
    } else {
      update({ questions: [...state.questions, q] });
    }
    setEditing(null);
  };

  const remove = (id) => {
    update({ questions: state.questions.filter((q) => q.id !== id) });
  };

  const localityName = (id) => state.localities.find((l) => l.id === id)?.name || 'Geral';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Perguntas</h1>
        <div className="flex gap-2">
          <select
            value={filterLocality}
            onChange={(e) => setFilterLocality(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="all">Todas</option>
            <option value="general">Gerais</option>
            {state.localities.map((l) => (
              <option key={l.id} value={l.id}>{l.name}/{l.state}</option>
            ))}
          </select>
          <button
            onClick={() => setEditing(emptyQuestion(filterLocality === 'all' || filterLocality === 'general' ? null : filterLocality))}
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium"
          >
            + Nova Pergunta
          </button>
        </div>
      </div>

      <table className="w-full text-sm bg-white rounded-lg shadow overflow-hidden">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-4 py-2">Pergunta</th>
            <th className="text-left px-4 py-2 w-28">Tipo</th>
            <th className="text-left px-4 py-2 w-32">Localidade</th>
            <th className="text-left px-4 py-2 w-40">Etapas vinculadas</th>
            <th className="px-4 py-2 w-28"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((q) => (
            <tr key={q.id} className="border-t hover:bg-gray-50">
              <td className="px-4 py-2">
                {q.text}
                {q.eliminatory && <span className="ml-1 text-red-500 text-xs">(eliminatória)</span>}
                {q.subQuestions?.length > 0 && (
                  <span className="ml-1 text-purple-500 text-xs">({q.subQuestions.length} sub)</span>
                )}
              </td>
              <td className="px-4 py-2 text-xs">{TYPES.find((t) => t.value === q.type)?.label}</td>
              <td className="px-4 py-2 text-xs">{localityName(q.localityId)}</td>
              <td className="px-4 py-2 text-xs">
                {q.stepsToAdd.map((sid) => state.steps.find((s) => s.id === sid)?.name || sid).join(', ') || '—'}
              </td>
              <td className="px-4 py-2 flex gap-2 justify-end">
                <button onClick={() => setEditing({ ...q, subQuestions: q.subQuestions?.map((s) => ({ ...s })) || [] })} className="text-blue-600 hover:underline text-xs">Editar</button>
                <button onClick={() => remove(q.id)} className="text-red-500 hover:underline text-xs">Excluir</button>
              </td>
            </tr>
          ))}
          {!filtered.length && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Nenhuma pergunta encontrada.</td></tr>
          )}
        </tbody>
      </table>

      {editing && (
        <QuestionModal question={editing} steps={state.steps} localities={state.localities} onSave={save} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function QuestionModal({ question, steps, localities, onSave, onClose }) {
  const [form, setForm] = useState(structuredClone(question));

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // Child steps should not appear for individual selection — they travel with parent
  const childStepIds = new Set(steps.filter((s) => s.childStepId).map((s) => s.childStepId));
  const selectableSteps = steps.filter((s) => !childStepIds.has(s.id));

  const toggleStep = (sid) => {
    setForm((f) => ({
      ...f,
      stepsToAdd: f.stepsToAdd.includes(sid) ? f.stepsToAdd.filter((x) => x !== sid) : [...f.stepsToAdd, sid],
    }));
  };

  const addSub = () => setForm((f) => ({ ...f, subQuestions: [...f.subQuestions, emptySubQuestion()] }));
  const removeSub = (idx) => setForm((f) => ({ ...f, subQuestions: f.subQuestions.filter((_, i) => i !== idx) }));
  const updateSub = (idx, partial) =>
    setForm((f) => ({
      ...f,
      subQuestions: f.subQuestions.map((s, i) => (i === idx ? { ...s, ...partial } : s)),
    }));

  const toggleSubStep = (idx, sid) => {
    const sub = form.subQuestions[idx];
    const next = sub.stepsToAdd.includes(sid) ? sub.stepsToAdd.filter((x) => x !== sid) : [...sub.stepsToAdd, sid];
    updateSub(idx, { stepsToAdd: next });
  };

  return (
    <Modal title={question.text ? 'Editar Pergunta' : 'Nova Pergunta'} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-gray-600">Texto da pergunta</span>
          <input className="w-full border rounded px-3 py-1.5" value={form.text} onChange={(e) => setField('text', e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-600">Tipo</span>
            <select className="w-full border rounded px-3 py-1.5" value={form.type} onChange={(e) => setField('type', e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Localidade</span>
            <select className="w-full border rounded px-3 py-1.5" value={form.localityId || ''} onChange={(e) => setField('localityId', e.target.value || null)}>
              <option value="">Geral</option>
              {localities.map((l) => <option key={l.id} value={l.id}>{l.name}/{l.state}</option>)}
            </select>
          </label>
        </div>

        {(form.type === 'number_gt' || form.type === 'number_lt') && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-600">Limite (threshold)</span>
              <input type="number" className="w-full border rounded px-3 py-1.5" value={form.threshold ?? ''} onChange={(e) => setField('threshold', Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Unidade</span>
              <input className="w-full border rounded px-3 py-1.5" value={form.unit} onChange={(e) => setField('unit', e.target.value)} />
            </label>
          </div>
        )}

        {form.type === 'select' && (
          <div>
            <span className="text-xs text-gray-600">Opções</span>
            {(form.options || []).map((opt, i) => (
              <div key={i} className="flex gap-2 mt-1">
                <input className="flex-1 border rounded px-2 py-1" placeholder="valor" value={opt.value}
                  onChange={(e) => {
                    const next = [...form.options];
                    next[i] = { ...next[i], value: e.target.value };
                    setField('options', next);
                  }} />
                <input className="flex-1 border rounded px-2 py-1" placeholder="label" value={opt.label}
                  onChange={(e) => {
                    const next = [...form.options];
                    next[i] = { ...next[i], label: e.target.value };
                    setField('options', next);
                  }} />
                <button onClick={() => setField('options', form.options.filter((_, j) => j !== i))} className="text-red-500 text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => setField('options', [...(form.options || []), { value: '', label: '' }])} className="text-blue-600 text-xs mt-1">+ opção</button>
          </div>
        )}

        {form.type === 'boolean' && (
          <label className="block">
            <span className="text-xs text-gray-600">Valor que dispara as etapas</span>
            <select className="w-full border rounded px-3 py-1.5" value={String(form.triggerValue)} onChange={(e) => setField('triggerValue', e.target.value === 'true')}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </label>
        )}

        {form.type === 'select' && (
          <label className="block">
            <span className="text-xs text-gray-600">Valor que dispara as etapas (triggerValue)</span>
            <input className="w-full border rounded px-3 py-1.5" value={form.triggerValue ?? ''} onChange={(e) => setField('triggerValue', e.target.value || null)} />
          </label>
        )}

        <div>
          <span className="text-xs text-gray-600">Etapas vinculadas (adicionadas quando trigger bate)</span>
          <span className="text-[10px] text-gray-400 ml-1">Etapas filhas vêm automaticamente com o pai</span>
          <div className="flex flex-wrap gap-2 mt-1 max-h-32 overflow-y-auto">
            {selectableSteps.map((s) => {
              const childName = s.childStepId ? steps.find((x) => x.id === s.childStepId)?.name : null;
              return (
                <label key={s.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded border cursor-pointer ${form.stepsToAdd.includes(s.id) ? 'bg-blue-50 border-blue-300' : 'bg-gray-50'}`}>
                  <input type="checkbox" checked={form.stepsToAdd.includes(s.id)} onChange={() => toggleStep(s.id)} />
                  {s.name}
                  {childName && <span className="text-[10px] text-purple-500">(+ {childName})</span>}
                </label>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.eliminatory}
            onChange={(e) => setField('eliminatory', e.target.checked ? { value: true, message: '' } : null)}
          />
          <span className="text-xs text-gray-600">Pergunta eliminatória?</span>
        </label>
        {form.eliminatory && (
          <input className="w-full border rounded px-3 py-1.5 text-xs" placeholder="Mensagem de inviabilidade"
            value={form.eliminatory.message} onChange={(e) => setField('eliminatory', { ...form.eliminatory, message: e.target.value })} />
        )}

        {/* Sub-questions */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-semibold text-purple-700">Sub-perguntas</span>
              <span className="ml-2 text-xs text-gray-400">Aparecem quando a resposta principal dispara o trigger</span>
            </div>
            <button onClick={addSub} className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs px-3 py-1 rounded font-medium">+ Adicionar sub-pergunta</button>
          </div>
          {form.subQuestions.length === 0 && (
            <div className="text-xs text-gray-400 italic py-2">Nenhuma sub-pergunta. Clique em "+ Adicionar" para criar.</div>
          )}
          <div className="space-y-3">
            {form.subQuestions.map((sub, idx) => {
              const selectedStepNames = sub.stepsToAdd.map((sid) => steps.find((s) => s.id === sid)?.name || sid);
              return (
                <div key={sub.id} className="border-l-4 border-purple-400 bg-purple-50 rounded-r-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-800">Sub-pergunta {idx + 1}</span>
                    <button onClick={() => removeSub(idx)} className="text-red-400 hover:text-red-600 text-xs font-medium">Remover</button>
                  </div>
                  <label className="block">
                    <span className="text-[11px] text-purple-600 font-medium">Texto</span>
                    <input className="w-full border border-purple-200 rounded px-2 py-1.5 text-xs bg-white" placeholder="Ex: O empreendimento tem mais de 500 unidades?" value={sub.text} onChange={(e) => updateSub(idx, { text: e.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-purple-600 font-medium">Tipo de resposta</span>
                      <select className="w-full border border-purple-200 rounded px-2 py-1.5 text-xs bg-white" value={sub.type} onChange={(e) => updateSub(idx, { type: e.target.value })}>
                        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </label>
                    {(sub.type === 'number_gt' || sub.type === 'number_lt') && (
                      <label className="block">
                        <span className="text-[11px] text-purple-600 font-medium">Limite</span>
                        <input type="number" className="w-full border border-purple-200 rounded px-2 py-1.5 text-xs bg-white" placeholder="threshold"
                          value={sub.threshold ?? ''} onChange={(e) => updateSub(idx, { threshold: Number(e.target.value) })} />
                      </label>
                    )}
                    {sub.type === 'boolean' && (
                      <label className="block">
                        <span className="text-[11px] text-purple-600 font-medium">Valor trigger</span>
                        <select className="w-full border border-purple-200 rounded px-2 py-1.5 text-xs bg-white" value={String(sub.triggerValue)} onChange={(e) => updateSub(idx, { triggerValue: e.target.value === 'true' })}>
                          <option value="true">Sim</option>
                          <option value="false">Não</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] text-purple-600 font-medium">Etapas vinculadas</span>
                    {selectedStepNames.length > 0 && (
                      <div className="flex flex-wrap gap-1 my-1">
                        {selectedStepNames.map((name, i) => (
                          <span key={i} className="bg-purple-200 text-purple-800 text-[10px] px-2 py-0.5 rounded-full">{name}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto bg-white rounded border border-purple-100 p-1.5">
                      {selectableSteps.map((s) => {
                        const childName = s.childStepId ? steps.find((x) => x.id === s.childStepId)?.name : null;
                        return (
                          <label key={s.id} className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${sub.stepsToAdd.includes(s.id) ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>
                            <input type="checkbox" className="w-3 h-3" checked={sub.stepsToAdd.includes(s.id)} onChange={() => toggleSubStep(idx, s.id)} />
                            {s.name}
                            {childName && <span className="text-purple-400">(+ {childName})</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.text.trim()} className="px-4 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
