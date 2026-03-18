import { useState, useMemo, useCallback } from 'react';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import Modal from '../components/Modal';
import CustomNode from '../components/CustomNode';
import { genId } from '../engine';

const nodeTypes = { custom: CustomNode };

export default function TemplatesPage({ state, update }) {
  const [editing, setEditing] = useState(null);

  const save = (tpl) => {
    const exists = state.templates.find((t) => t.id === tpl.id);
    if (exists) {
      update({ templates: state.templates.map((t) => (t.id === tpl.id ? tpl : t)) });
    } else {
      update({ templates: [...state.templates, tpl] });
    }
    setEditing(null);
  };

  const remove = (id) => {
    update({ templates: state.templates.filter((t) => t.id !== id) });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Templates</h1>
        <button
          onClick={() => setEditing({ id: genId('tpl'), name: '', description: '', nodes: [], edges: [] })}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium"
        >
          + Novo Template
        </button>
      </div>

      {!state.templates.length && (
        <p className="text-gray-400 text-sm">Nenhum template criado. Crie simulações e salve layouts como templates.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.templates.map((tpl) => (
          <div key={tpl.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-gray-800">{tpl.name}</h3>
                {tpl.description && <p className="text-xs text-gray-500">{tpl.description}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(structuredClone(tpl))} className="text-blue-600 hover:underline text-xs">Editar</button>
                <button onClick={() => remove(tpl.id)} className="text-red-500 hover:underline text-xs">Excluir</button>
              </div>
            </div>
            <div className="h-40 bg-gray-50 rounded border">
              <MiniPreview nodes={tpl.nodes} edges={tpl.edges} />
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {tpl.nodes.length} nós, {tpl.edges.length} conexões
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <TemplateModal template={editing} onSave={save} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function MiniPreview({ nodes, edges }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      panOnDrag={false}
      zoomOnScroll={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e5e7eb" gap={20} />
    </ReactFlow>
  );
}

function TemplateModal({ template, onSave, onClose }) {
  const [name, setName] = useState(template.name);
  const [desc, setDesc] = useState(template.description || '');

  return (
    <Modal title={template.name ? 'Editar Template' : 'Novo Template'} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-gray-600">Nome</span>
          <input className="w-full border rounded px-3 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Descrição</span>
          <textarea className="w-full border rounded px-3 py-1.5 h-16" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <p className="text-xs text-gray-400">Layouts de nós e conexões são salvos automaticamente a partir do board de simulação.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
          <button onClick={() => onSave({ ...template, name, description: desc })} disabled={!name.trim()} className="px-4 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
