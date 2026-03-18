import { useState } from 'react';
import Modal from '../components/Modal';
import { genId } from '../engine';

export default function SimulationsPage({ state, update, openBoard }) {
  const [creating, setCreating] = useState(false);

  const remove = (id) => {
    update({ simulations: state.simulations.filter((s) => s.id !== id) });
  };

  const localityName = (id) => {
    const l = state.localities.find((l) => l.id === id);
    return l ? `${l.name}/${l.state}` : id;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Simulações</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium"
        >
          + Nova Simulação
        </button>
      </div>

      {!state.simulations.length && (
        <p className="text-gray-400 text-sm">Nenhuma simulação criada.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.simulations.map((sim) => {
          const isFinished = !!sim.finishedAt;
          return (
            <div key={sim.id} className={`bg-white rounded-lg shadow p-4 flex flex-col ${isFinished ? 'border-2 border-green-300' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-800">{sim.name}</h3>
                {isFinished && (
                  <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Concluída</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2">{localityName(sim.localityId)}</p>
              <div className="text-xs text-gray-400 mb-3">
                {sim.nodes?.length || 0} etapas no diagrama &middot; {sim.completedSteps?.length || 0} concluídas
                {isFinished && (
                  <div className="text-green-600 mt-0.5">Finalizada em {new Date(sim.finishedAt).toLocaleDateString('pt-BR')}</div>
                )}
              </div>
              <div className="mt-auto flex gap-2">
                <button onClick={() => openBoard(sim.id)} className={`flex-1 text-white text-xs py-1.5 rounded font-medium ${isFinished ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {isFinished ? 'Visualizar' : 'Abrir Board'}
                </button>
                {!isFinished && (
                  <button onClick={() => remove(sim.id)} className="text-red-500 hover:underline text-xs px-2">Excluir</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <CreateSimulationModal
          localities={state.localities}
          templates={state.templates}
          steps={state.steps}
          onSave={(sim) => {
            update({ simulations: [...state.simulations, sim] });
            setCreating(false);
            openBoard(sim.id);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CreateSimulationModal({ localities, templates, steps, onSave, onClose }) {
  const [name, setName] = useState('');
  const [localityId, setLocalityId] = useState(localities[0]?.id || '');
  const [templateId, setTemplateId] = useState('');

  const create = () => {
    const tpl = templates.find((t) => t.id === templateId);
    const sim = {
      id: genId('sim'),
      name: name.trim(),
      localityId,
      nodes: tpl ? structuredClone(tpl.nodes) : [],
      edges: tpl ? structuredClone(tpl.edges) : [],
      answers: {},
      completedSteps: [],
      createdAt: new Date().toISOString(),
    };
    onSave(sim);
  };

  return (
    <Modal title="Nova Simulação" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-gray-600">Nome da simulação</span>
          <input className="w-full border rounded px-3 py-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Edifício Meireles" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Localidade</span>
          <select className="w-full border rounded px-3 py-1.5" value={localityId} onChange={(e) => setLocalityId(e.target.value)}>
            {localities.map((l) => <option key={l.id} value={l.id}>{l.name}/{l.state}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Template (opcional)</span>
          <select className="w-full border rounded px-3 py-1.5" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Nenhum (board vazio)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
          <button onClick={create} disabled={!name.trim() || !localityId} className="px-4 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50">Criar e abrir</button>
        </div>
      </div>
    </Modal>
  );
}
