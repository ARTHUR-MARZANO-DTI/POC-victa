import { useState } from 'react';
import Modal from '../components/Modal';
import { genId, fmtCurrency } from '../engine';

function emptyStep() {
  return {
    id: genId('s'),
    name: '',
    area: '',
    defaultDurationMonths: 0,
    minDurationMonths: 0,
    maxDurationMonths: 0,
    internalMonths: 0,
    externalMonths: 0,
    estimatedCost: 0,
    details: '',
    childStepId: null,
  };
}

export default function StepsPage({ state, update }) {
  const [editing, setEditing] = useState(null);

  const save = (step) => {
    const exists = state.steps.find((s) => s.id === step.id);
    if (exists) {
      update({ steps: state.steps.map((s) => (s.id === step.id ? step : s)) });
    } else {
      update({ steps: [...state.steps, step] });
    }
    setEditing(null);
  };

  const remove = (id) => {
    update({ steps: state.steps.filter((s) => s.id !== id) });
  };

  const childName = (id) => state.steps.find((s) => s.id === id)?.name || null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Etapas (Globais)</h1>
        <button
          onClick={() => setEditing(emptyStep())}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium"
        >
          + Nova Etapa
        </button>
      </div>

      <table className="w-full text-sm bg-white rounded-lg shadow overflow-hidden">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-4 py-2">Nome</th>
            <th className="text-left px-4 py-2 w-24">Área</th>
            <th className="text-right px-4 py-2 w-20">Padrão</th>
            <th className="text-right px-4 py-2 w-20">Mín</th>
            <th className="text-right px-4 py-2 w-20">Máx</th>
            <th className="text-right px-4 py-2 w-28">Custo</th>
            <th className="text-left px-4 py-2 w-40">Etapa-filha</th>
            <th className="px-4 py-2 w-28"></th>
          </tr>
        </thead>
        <tbody>
          {state.steps.map((s) => (
            <tr key={s.id} className="border-t hover:bg-gray-50">
              <td className="px-4 py-2 font-medium">{s.name}</td>
              <td className="px-4 py-2 text-xs">{s.area}</td>
              <td className="px-4 py-2 text-right">{s.defaultDurationMonths}m</td>
              <td className="px-4 py-2 text-right">{s.minDurationMonths}m</td>
              <td className="px-4 py-2 text-right">{s.maxDurationMonths}m</td>
              <td className="px-4 py-2 text-right text-xs">{fmtCurrency(s.estimatedCost)}</td>
              <td className="px-4 py-2 text-xs">{childName(s.childStepId) || '—'}</td>
              <td className="px-4 py-2 flex gap-2 justify-end">
                <button onClick={() => setEditing({ ...s })} className="text-blue-600 hover:underline text-xs">Editar</button>
                <button onClick={() => remove(s.id)} className="text-red-500 hover:underline text-xs">Excluir</button>
              </td>
            </tr>
          ))}
          {!state.steps.length && (
            <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Nenhuma etapa cadastrada.</td></tr>
          )}
        </tbody>
      </table>

      {editing && (
        <StepModal step={editing} allSteps={state.steps} onSave={save} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function StepModal({ step, allSteps, onSave, onClose }) {
  const [form, setForm] = useState({ ...step });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const otherSteps = allSteps.filter((s) => s.id !== form.id);

  return (
    <Modal title={step.name ? 'Editar Etapa' : 'Nova Etapa'} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="text-xs text-gray-600">Nome</span>
            <input className="w-full border rounded px-3 py-1.5" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Área</span>
            <input className="w-full border rounded px-3 py-1.5" value={form.area} onChange={(e) => set('area', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Etapa-filha obrigatória</span>
            <select className="w-full border rounded px-3 py-1.5" value={form.childStepId || ''} onChange={(e) => set('childStepId', e.target.value || null)}>
              <option value="">Nenhuma</option>
              {otherSteps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-gray-600">Duração padrão (meses)</span>
            <input type="number" step="0.5" className="w-full border rounded px-3 py-1.5" value={form.defaultDurationMonths} onChange={(e) => set('defaultDurationMonths', Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Mínimo (meses)</span>
            <input type="number" step="0.5" className="w-full border rounded px-3 py-1.5" value={form.minDurationMonths} onChange={(e) => set('minDurationMonths', Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Máximo (meses)</span>
            <input type="number" step="0.5" className="w-full border rounded px-3 py-1.5" value={form.maxDurationMonths} onChange={(e) => set('maxDurationMonths', Number(e.target.value))} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-gray-600">Meses internos</span>
            <input type="number" step="0.5" className="w-full border rounded px-3 py-1.5" value={form.internalMonths} onChange={(e) => set('internalMonths', Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Meses externos</span>
            <input type="number" step="0.5" className="w-full border rounded px-3 py-1.5" value={form.externalMonths} onChange={(e) => set('externalMonths', Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Custo estimado (R$)</span>
            <input type="number" className="w-full border rounded px-3 py-1.5" value={form.estimatedCost} onChange={(e) => set('estimatedCost', Number(e.target.value))} />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-gray-600">Detalhes / observações</span>
          <textarea className="w-full border rounded px-3 py-1.5 h-20" value={form.details} onChange={(e) => set('details', e.target.value)} />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim()} className="px-4 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
