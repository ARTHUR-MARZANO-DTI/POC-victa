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

// ═══════════════════════════════════════════════════════════════════════
// 1. CUSTOM NODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════
const NODE_COLORS = {
  fixed: { bg: '#1e40af', border: '#1e3a8a', text: '#ffffff' },
  conditional: { bg: '#d97706', border: '#b45309', text: '#ffffff' },
  start: { bg: '#059669', border: '#047857', text: '#ffffff' },
  end: { bg: '#059669', border: '#047857', text: '#ffffff' },
};

function CustomNode({ data, id }) {
  const variant = data.variant || 'fixed';
  const colors = NODE_COLORS[variant];

  return (
    <div
      className="rounded-xl shadow-lg px-5 py-3 min-w-[200px] text-center transition-all hover:scale-105 hover:shadow-xl"
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        color: colors.text,
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-3 !h-3" />
      <div className="font-bold text-sm leading-tight">{data.label}</div>
      {data.duracao !== undefined && (
        <div className="mt-1 text-xs opacity-90 font-medium">
          {data.duracao === 0 ? 'Marco' : `⏱ ${data.duracao} ${data.duracao === 1 ? 'mês' : 'meses'}`}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-3 !h-3" />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

// ═══════════════════════════════════════════════════════════════════════
// 2. CRITICAL PATH ALGORITHM (Topological Sort + Earliest Finish)
// ═══════════════════════════════════════════════════════════════════════
function calculateCriticalPath(nodes, edges) {
  if (!nodes.length) return 0;

  const nodeMap = {};
  nodes.forEach((n) => {
    nodeMap[n.id] = { duracao: n.data.duracao ?? 0, earliestStart: 0, earliestFinish: 0 };
  });

  // Build adjacency list and in-degree map
  const adj = {};
  const inDeg = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
    inDeg[n.id] = 0;
  });
  edges.forEach((e) => {
    if (adj[e.source]) {
      adj[e.source].push(e.target);
    }
    if (inDeg[e.target] !== undefined) {
      inDeg[e.target]++;
    }
  });

  // Kahn's topological sort
  const queue = [];
  Object.keys(inDeg).forEach((id) => {
    if (inDeg[id] === 0) queue.push(id);
  });

  const sorted = [];
  while (queue.length > 0) {
    const curr = queue.shift();
    sorted.push(curr);
    (adj[curr] || []).forEach((next) => {
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    });
  }

  // Forward pass — compute earliest start/finish
  sorted.forEach((id) => {
    const node = nodeMap[id];
    node.earliestFinish = node.earliestStart + node.duracao;
    (adj[id] || []).forEach((next) => {
      if (node.earliestFinish > nodeMap[next].earliestStart) {
        nodeMap[next].earliestStart = node.earliestFinish;
      }
    });
  });

  // Total = max earliest finish across all nodes
  let total = 0;
  Object.values(nodeMap).forEach((n) => {
    if (n.earliestFinish > total) total = n.earliestFinish;
  });

  return total;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. GRAPH BUILDER (Motor de Regras)
// ═══════════════════════════════════════════════════════════════════════
function buildGraph({ hasDemolition, hasOver49Trees, hasOver300Units }) {
  const nodes = [];
  const edges = [];

  // ── Column positions (x) for layout ──
  // We define layers left-to-right
  // Layer 0: Comitê
  // Layer 1: Demolição (conditional)
  // Layer 2: Projetos Iniciais
  // Layer 3: AOP (conditional)
  // Layer 4: Bombeiros / Ambiental (parallel)
  // Layer 5: Alvará
  // Layer 6: Obra Liberada

  const LAYER_WIDTH = 280;

  let layerIdx = 0;

  // --- Nó 1: Comitê de Aquisição (sempre) ---
  const comiteX = layerIdx * LAYER_WIDTH;
  nodes.push({
    id: 'comite',
    type: 'custom',
    position: { x: comiteX, y: 150 },
    data: { label: 'Comitê de Aquisição', duracao: 0, variant: 'start' },
  });
  layerIdx++;

  // --- Condicional: Demolição ---
  let prevNode = 'comite';
  if (hasDemolition) {
    nodes.push({
      id: 'demolicao',
      type: 'custom',
      position: { x: layerIdx * LAYER_WIDTH, y: 150 },
      data: { label: 'Demolição', duracao: 6, variant: 'conditional' },
    });
    edges.push({ id: 'e-comite-dem', source: 'comite', target: 'demolicao' });
    prevNode = 'demolicao';
    layerIdx++;
  }

  // --- Nó 2: Projetos Iniciais (sempre) ---
  nodes.push({
    id: 'projetos',
    type: 'custom',
    position: { x: layerIdx * LAYER_WIDTH, y: 150 },
    data: { label: 'Projetos Iniciais', duracao: 2, variant: 'fixed' },
  });
  edges.push({ id: `e-${prevNode}-proj`, source: prevNode, target: 'projetos' });
  layerIdx++;

  // --- Nó 3: Aprovação Bombeiros (sempre, ramo superior) ---
  const parallelX = layerIdx * LAYER_WIDTH;

  // Determine if there's an AOP layer before
  let ambientalPrev = 'projetos';
  if (hasOver300Units) {
    // AOP goes between Projetos and the Ambiental node
    nodes.push({
      id: 'aop',
      type: 'custom',
      position: { x: parallelX, y: 220 },
      data: { label: 'Análise de Orientação Prévia (AOP)', duracao: 3, variant: 'conditional' },
    });
    edges.push({ id: 'e-proj-aop', source: 'projetos', target: 'aop' });
    ambientalPrev = 'aop';
    layerIdx++;
  }

  // Bombeiros (upper row — always at the same column as the parallel branch start)
  nodes.push({
    id: 'bombeiros',
    type: 'custom',
    position: { x: parallelX, y: 40 },
    data: { label: 'Aprovação Bombeiros', duracao: 2, variant: 'fixed' },
  });
  edges.push({ id: 'e-proj-bomb', source: 'projetos', target: 'bombeiros' });

  // --- Condicional: Ambiental ---
  const ambientalX = hasOver300Units ? layerIdx * LAYER_WIDTH : parallelX;
  if (!hasOver49Trees) {
    // LAS (Licença Ambiental Simplificada)
    nodes.push({
      id: 'ambiental',
      type: 'custom',
      position: { x: ambientalX, y: 260 },
      data: { label: 'Licença Ambiental Simplificada (LAS)', duracao: 7, variant: 'conditional' },
    });
  } else {
    // LP+LI (Licença Regular)
    nodes.push({
      id: 'ambiental',
      type: 'custom',
      position: { x: ambientalX, y: 260 },
      data: { label: 'Licença Regular (LP+LI)', duracao: 12, variant: 'conditional' },
    });
  }
  edges.push({ id: `e-${ambientalPrev}-amb`, source: ambientalPrev, target: 'ambiental' });

  layerIdx++;

  // --- Nó 4: Alvará de Construção (sempre) ---
  nodes.push({
    id: 'alvara',
    type: 'custom',
    position: { x: layerIdx * LAYER_WIDTH, y: 150 },
    data: { label: 'Alvará de Construção', duracao: 3, variant: 'fixed' },
  });
  edges.push({ id: 'e-bomb-alv', source: 'bombeiros', target: 'alvara' });
  edges.push({ id: 'e-amb-alv', source: 'ambiental', target: 'alvara' });
  layerIdx++;

  // --- Nó 5: Obra Liberada (sempre) ---
  nodes.push({
    id: 'obra',
    type: 'custom',
    position: { x: layerIdx * LAYER_WIDTH, y: 150 },
    data: { label: 'Obra Liberada', duracao: 0, variant: 'end' },
  });
  edges.push({ id: 'e-alv-obra', source: 'alvara', target: 'obra' });

  // Style edges
  const styledEdges = edges.map((e) => ({
    ...e,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#64748b', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
  }));

  return { nodes, edges: styledEdges };
}

// ═══════════════════════════════════════════════════════════════════════
// 4. EDIT DURATION MODAL
// ═══════════════════════════════════════════════════════════════════════
function EditModal({ node, onSave, onClose }) {
  const [value, setValue] = useState(node?.data?.duracao ?? 0);

  useEffect(() => {
    setValue(node?.data?.duracao ?? 0);
  }, [node]);

  if (!node) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onSave(node.id, parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[380px] border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Editar Duração</h3>
        <p className="text-sm text-gray-500 mb-4">{node.data.label}</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="duracao-input" className="block text-sm font-medium text-gray-700 mb-1">
            Duração (meses)
          </label>
          <input
            id="duracao-input"
            type="number"
            min="0"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 5. SIMULATION FORM
// ═══════════════════════════════════════════════════════════════════════
function Toggle({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700 font-medium pr-4 leading-snug">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer ${
          value ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function SimulationForm({ onGenerate }) {
  const [hasDemolition, setHasDemolition] = useState(false);
  const [hasOver49Trees, setHasOver49Trees] = useState(false);
  const [hasOver300Units, setHasOver300Units] = useState(false);

  const handleGenerate = () => {
    onGenerate({ hasDemolition, hasOver49Trees, hasOver300Units });
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">Motor de Regras</h2>
          <p className="text-xs text-gray-500">Configure os parâmetros do cenário</p>
        </div>
      </div>

      <div className="space-y-0 mb-6">
        <Toggle
          label="Haverá demolição no terreno?"
          value={hasDemolition}
          onChange={setHasDemolition}
        />
        <Toggle
          label="Haverá supressão de mais de 49 árvores?"
          value={hasOver49Trees}
          onChange={setHasOver49Trees}
        />
        <Toggle
          label="O projeto tem mais de 300 unidades?"
          value={hasOver300Units}
          onChange={setHasOver300Units}
        />
      </div>

      <button
        onClick={handleGenerate}
        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-md hover:shadow-lg cursor-pointer"
      >
        🚀 Gerar Simulação de Prazo
      </button>

      <div className="mt-5 p-3 bg-gray-50 rounded-xl border border-gray-100">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Legenda</h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: '#059669' }} />
            <span className="text-xs text-gray-600">Marco (Início/Fim)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: '#1e40af' }} />
            <span className="text-xs text-gray-600">Etapa Fixa</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: '#d97706' }} />
            <span className="text-xs text-gray-600">Etapa Condicional</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400 text-center">
        💡 Clique em qualquer nó do fluxograma para editar sua duração
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 6. MAIN APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Calculate critical path whenever nodes/edges change
  const totalMonths = useMemo(() => calculateCriticalPath(nodes, edges), [nodes, edges]);

  const handleGenerate = useCallback(
    (options) => {
      const graph = buildGraph(options);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setHasGenerated(true);
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  const handleNodeClick = useCallback((_event, node) => {
    setSelectedNode(node);
  }, []);

  const handleSaveDuration = useCallback(
    (nodeId, newDuration) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, duracao: newDuration } }
            : n
        )
      );
      setSelectedNode(null);
    },
    [setNodes]
  );

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight">
              Simulador de Cenários de Legalização
            </h1>
            <p className="text-xs text-gray-500">Planejamento de prazos para legalização de terrenos</p>
          </div>
        </div>
        {hasGenerated && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2 rounded-xl shadow-md">
            <span className="text-xs font-medium opacity-80">Tempo Total Estimado</span>
            <span className="ml-2 text-xl font-extrabold">
              {totalMonths} {totalMonths === 1 ? 'mês' : 'meses'}
            </span>
          </div>
        )}
      </header>

      {/* Body — 2 columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column — Form */}
        <aside className="w-[360px] flex-shrink-0 p-5 overflow-y-auto border-r border-gray-200 bg-gray-50">
          <SimulationForm onGenerate={handleGenerate} />
        </aside>

        {/* Right Column — React Flow */}
        <main className="flex-1 relative">
          {!hasGenerated ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-600 mb-2">Nenhuma simulação gerada</h3>
                <p className="text-sm text-gray-400">
                  Configure as opções no painel à esquerda e clique em{' '}
                  <strong className="text-gray-500">"Gerar Simulação de Prazo"</strong> para visualizar o fluxograma do caminho crítico.
                </p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e2e8f0" gap={20} size={1} />
              <Controls
                showInteractive={false}
                className="!bg-white !shadow-lg !border !border-gray-200 !rounded-xl"
              />
            </ReactFlow>
          )}
        </main>
      </div>

      {/* Edit Modal */}
      {selectedNode && (
        <EditModal
          node={selectedNode}
          onSave={handleSaveDuration}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
