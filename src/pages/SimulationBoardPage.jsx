import { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import CustomNode from '../components/CustomNode';
import Modal from '../components/Modal';
import {
  genId,
  fmt,
  fmtTotal,
  fmtCurrency,
  calculateCriticalPath,
  buildCriticalPathEntries,
  getStepStats,
  styledEdges,
  wouldCreateCycle,
} from '../engine';

const nodeTypes = { custom: CustomNode };

function getChildStepIds(steps) {
  const ids = new Set();
  steps.forEach((s) => { if (s.childStepId) ids.add(s.childStepId); });
  return ids;
}

function getParentStep(steps, childId) {
  return steps.find((s) => s.childStepId === childId) || null;
}

export default function SimulationBoardPage({ state, update, navigate, simulationId }) {
  const sim = state.simulations.find((s) => s.id === simulationId);
  if (!sim) return <div className="p-6 text-red-600">Simulação não encontrada.</div>;

  const isFinished = !!sim.finishedAt;
  const locality = state.localities.find((l) => l.id === sim.localityId);
  const questions = state.questions.filter(
    (q) => !q.localityId || q.localityId === sim.localityId,
  );
  const childStepIds = useMemo(() => getChildStepIds(state.steps), [state.steps]);

  const [nodes, setNodes, onNodesChange] = useNodesState(sim.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(sim.edges || []);
  const [selectedNode, setSelectedNode] = useState(null);
  const [answers, setAnswers] = useState(sim.answers || {});
  const [completedSteps, setCompletedSteps] = useState(sim.completedSteps || []);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const persist = useCallback(
    (overrides = {}) => {
      const updated = {
        ...sim,
        nodes: overrides.nodes ?? nodes,
        edges: overrides.edges ?? edges,
        answers: overrides.answers ?? answers,
        completedSteps: overrides.completedSteps ?? completedSteps,
      };
      update({
        simulations: state.simulations.map((s) => (s.id === simulationId ? updated : s)),
      });
    },
    [sim, nodes, edges, answers, completedSteps, state.simulations, simulationId, update],
  );

  const { total, criticalIds, schedule } = useMemo(() => {
    const entries = buildCriticalPathEntries(nodes, edges, state.steps);
    return calculateCriticalPath(entries);
  }, [nodes, edges, state.steps]);

  const styledE = useMemo(() => styledEdges(edges, criticalIds), [edges, criticalIds]);

  const enrichedNodes = useMemo(() => {
    const stepMap = Object.fromEntries(state.steps.map((s) => [s.id, s]));
    return nodes.map((n) => {
      const step = stepMap[n.id];
      const s = schedule[n.id] || {};
      const comp = completedSteps.find((c) => c.stepId === n.id);
      const stats = getStepStats(state.simulations, n.id, sim.localityId);
      return {
        ...n,
        data: {
          ...n.data,
          label: step?.name || n.data?.label || n.id,
          duracao: n.data?.durationOverride ?? step?.defaultDurationMonths ?? 0,
          predictedTime: n.data?.predictedTime ?? null,
          statsPredicted: stats ? stats.avg : null,
          cost: step?.estimatedCost ?? 0,
          isCritical: criticalIds.has(n.id),
          completed: !!comp,
          slack: s.slack ?? 0,
          es: s.es ?? 0,
          ef: s.ef ?? 0,
        },
      };
    });
  }, [nodes, state.steps, state.simulations, sim.localityId, schedule, criticalIds, completedSteps]);

  const onConnect = useCallback(
    (conn) => {
      if (isFinished) return;
      if (wouldCreateCycle(edges, conn.source, conn.target)) {
        alert('Conexão bloqueada: criaria um loop de dependência.');
        return;
      }
      const newEdge = {
        ...conn,
        id: `e-${conn.source}-${conn.target}`,
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
        style: { stroke: '#64748b', strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges, edges, isFinished],
  );

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
  }, []);

  const onEdgeClick = useCallback(
    (_, edge) => {
      if (isFinished) return;
      if (confirm('Remover esta conexão?')) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
    },
    [setEdges, isFinished],
  );

  const addStepToBoard = useCallback(
    (stepId) => {
      if (isFinished) return;

      // If this is a child step, redirect to adding the parent instead
      const parent = getParentStep(state.steps, stepId);
      if (parent) {
        stepId = parent.id;
      }

      if (nodes.find((n) => n.id === stepId)) return;
      const step = state.steps.find((s) => s.id === stepId);
      if (!step) return;

      const newNode = {
        id: stepId,
        type: 'custom',
        position: { x: 50 + Math.random() * 400, y: 50 + Math.random() * 300 },
        data: { label: step.name, duracao: step.defaultDurationMonths },
      };

      const newNodes = [...nodes, newNode];
      let newEdges = [...edges];

      if (step.childStepId && !nodes.find((n) => n.id === step.childStepId)) {
        const child = state.steps.find((s) => s.id === step.childStepId);
        if (child) {
          newNodes.push({
            id: child.id,
            type: 'custom',
            position: { x: newNode.position.x + 250, y: newNode.position.y },
            data: { label: child.name, duracao: child.defaultDurationMonths },
          });
          newEdges.push({
            id: `e-${stepId}-${child.id}`,
            source: stepId,
            target: child.id,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
            style: { stroke: '#64748b', strokeWidth: 2 },
          });
        }
      }

      setNodes(newNodes);
      setEdges(newEdges);
    },
    [nodes, edges, state.steps, setNodes, setEdges, isFinished],
  );

  const removeStepFromBoard = useCallback(
    (stepId) => {
      if (isFinished) return;
      const step = state.steps.find((s) => s.id === stepId);
      const idsToRemove = new Set([stepId]);

      if (step?.childStepId) idsToRemove.add(step.childStepId);

      const parent = getParentStep(state.steps, stepId);
      if (parent) {
        idsToRemove.add(parent.id);
        if (parent.childStepId && parent.childStepId !== stepId) {
          idsToRemove.add(parent.childStepId);
        }
      }

      setNodes((nds) => nds.filter((n) => !idsToRemove.has(n.id)));
      setEdges((eds) => eds.filter((e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target)));
      setCompletedSteps((cs) => cs.filter((c) => !idsToRemove.has(c.stepId)));
      setSelectedNode(null);
    },
    [setNodes, setEdges, state.steps, isFinished],
  );

  const answerQuestion = useCallback(
    (questionId, value) => {
      if (isFinished) return;
      const newAnswers = { ...answers, [questionId]: value };
      setAnswers(newAnswers);

      const q = questions.find((x) => x.id === questionId);
      if (!q) return;

      if (shouldTrigger(q, value)) {
        q.stepsToAdd.forEach((sid) => addStepToBoard(sid));
      }
    },
    [answers, questions, addStepToBoard, isFinished],
  );

  const answerSubQuestion = useCallback(
    (parentId, subId, value) => {
      if (isFinished) return;
      const key = `${parentId}__${subId}`;
      const newAnswers = { ...answers, [key]: value };
      setAnswers(newAnswers);

      const parent = questions.find((q) => q.id === parentId);
      const sub = parent?.subQuestions?.find((s) => s.id === subId);
      if (!sub) return;

      if (shouldTrigger(sub, value)) {
        sub.stepsToAdd.forEach((sid) => addStepToBoard(sid));
      }
    },
    [answers, questions, addStepToBoard, isFinished],
  );

  const completeStep = useCallback(
    (stepId, actualDuration, notes) => {
      if (isFinished) return;
      const already = completedSteps.find((c) => c.stepId === stepId);
      let next;
      if (already) {
        next = completedSteps.map((c) =>
          c.stepId === stepId ? { ...c, actualDuration, notes } : c,
        );
      } else {
        next = [...completedSteps, { stepId, actualDuration, notes }];
      }
      setCompletedSteps(next);
    },
    [completedSteps, isFinished],
  );

  const updatePredictedTime = useCallback(
    (stepId, time) => {
      if (isFinished) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === stepId ? { ...n, data: { ...n.data, predictedTime: time } } : n,
        ),
      );
    },
    [setNodes, isFinished],
  );

  const handleSave = useCallback(() => {
    persist();
  }, [persist]);

  const handleSaveAsTemplate = useCallback(() => {
    const tpl = {
      id: genId('tpl'),
      name: `Template de ${sim.name}`,
      description: `Criado a partir da simulação "${sim.name}"`,
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
    update({ templates: [...state.templates, tpl] });
  }, [sim, nodes, edges, state.templates, update]);

  const handleFinishSimulation = useCallback(() => {
    const updated = {
      ...sim,
      nodes,
      edges,
      answers,
      completedSteps,
      finishedAt: new Date().toISOString(),
    };
    update({
      simulations: state.simulations.map((s) => (s.id === simulationId ? updated : s)),
    });
  }, [sim, nodes, edges, answers, completedSteps, state.simulations, simulationId, update]);

  const eliminatoryMsg = useMemo(() => {
    for (const q of questions) {
      if (q.eliminatory && answers[q.id] === q.eliminatory.value) {
        return q.eliminatory.message;
      }
    }
    return null;
  }, [questions, answers]);

  const totalCost = useMemo(() => {
    const stepMap = Object.fromEntries(state.steps.map((s) => [s.id, s]));
    return nodes.reduce((sum, n) => sum + (stepMap[n.id]?.estimatedCost || 0), 0);
  }, [nodes, state.steps]);

  const allCompleted = nodes.length > 0 && nodes.every((n) => completedSteps.some((c) => c.stepId === n.id));

  const addableSteps = useMemo(
    () => state.steps.filter((s) => !childStepIds.has(s.id)),
    [state.steps, childStepIds],
  );

  return (
    <div className="flex h-[calc(100vh-80px)]">
      {/* Left panel: Questions */}
      <div className="w-80 bg-white border-r overflow-y-auto flex flex-col">
        <div className="p-4 border-b">
          <button onClick={() => { handleSave(); navigate('simulations'); }} className="text-blue-600 hover:underline text-xs mb-2">&larr; Voltar</button>
          <h2 className="font-bold text-gray-800">{sim.name}</h2>
          <p className="text-xs text-gray-500">{locality?.name}/{locality?.state}</p>
          {isFinished && (
            <div className="mt-2 bg-green-100 border border-green-300 rounded p-2 text-xs text-green-800 font-medium">
              Simulação concluída em {new Date(sim.finishedAt).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>

        {eliminatoryMsg && (
          <div className="mx-4 mt-3 p-3 bg-red-100 border border-red-300 rounded text-sm text-red-800">
            {eliminatoryMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Perguntas</h3>
          {questions.map((q) => (
            <QuestionWidget
              key={q.id}
              question={q}
              answer={answers[q.id]}
              subAnswers={answers}
              onAnswer={answerQuestion}
              onSubAnswer={answerSubQuestion}
              disabled={isFinished}
            />
          ))}
        </div>

        <div className="p-4 border-t bg-gray-50 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Prazo total (caminho crítico):</span>
            <span className="font-bold text-gray-800">{fmtTotal(total)} meses</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Custo estimado:</span>
            <span className="font-bold text-gray-800">{fmtCurrency(totalCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Etapas:</span>
            <span>{completedSteps.length}/{nodes.length} concluídas</span>
          </div>
          {!isFinished && (
            <div className="flex gap-2 mt-2">
              <button onClick={handleSave} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded font-medium">
                Salvar
              </button>
              <button onClick={handleSaveAsTemplate} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-1.5 rounded font-medium">
                Template
              </button>
            </div>
          )}
          {!isFinished && allCompleted && nodes.length > 0 && (
            <button
              onClick={handleFinishSimulation}
              className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded font-bold text-sm"
            >
              Concluir Simulação
            </button>
          )}
          {isFinished && (
            <div className="mt-2">
              <h4 className="font-semibold text-gray-700 mb-1">Histórico de etapas concluídas</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {completedSteps.map((cs) => {
                  const step = state.steps.find((s) => s.id === cs.stepId);
                  return (
                    <div key={cs.stepId} className="bg-white rounded p-1.5 border text-[10px]">
                      <div className="font-medium text-gray-700">{step?.name || cs.stepId}</div>
                      <div className="text-gray-500">Duração real: {cs.actualDuration}m {cs.notes ? `| ${cs.notes}` : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: React Flow diagram */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={enrichedNodes}
          edges={styledE}
          onNodesChange={isFinished ? undefined : onNodesChange}
          onEdgesChange={isFinished ? undefined : onEdgesChange}
          onConnect={isFinished ? undefined : onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={isFinished ? undefined : onEdgeClick}
          nodeTypes={nodeTypes}
          nodesDraggable={!isFinished}
          nodesConnectable={!isFinished}
          elementsSelectable={!isFinished}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e5e7eb" gap={20} />
          <Controls />
          <MiniMap nodeStrokeWidth={3} />
        </ReactFlow>

        {!isFinished && (
          <button
            onClick={() => setShowAddPanel((v) => !v)}
            className="absolute bottom-6 right-6 z-10 w-12 h-12 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg text-2xl font-bold flex items-center justify-center transition"
            title="Adicionar etapa"
          >
            {showAddPanel ? '\u00d7' : '+'}
          </button>
        )}

        {showAddPanel && !isFinished && (
          <div className="absolute bottom-20 right-6 z-10 w-72 bg-white rounded-lg shadow-2xl border p-4 max-h-80 overflow-y-auto">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Adicionar etapa ao board</h3>
            <div className="space-y-1">
              {addableSteps.map((s) => {
                const onBoard = nodes.some((n) => n.id === s.id);
                return (
                  <div key={s.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-gray-50">
                    <div>
                      <span className={onBoard ? 'text-gray-400' : 'text-gray-700'}>{s.name}</span>
                      {s.childStepId && (
                        <span className="ml-1 text-[10px] text-purple-500">
                          + {state.steps.find((x) => x.id === s.childStepId)?.name}
                        </span>
                      )}
                    </div>
                    {onBoard ? (
                      <button onClick={() => removeStepFromBoard(s.id)} className="text-red-400 hover:text-red-600 text-xs ml-2">Remover</button>
                    ) : (
                      <button onClick={() => addStepToBoard(s.id)} className="text-blue-600 hover:underline text-xs ml-2">+ Add</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedNode && (
        <StepDetailModal
          stepId={selectedNode.id}
          steps={state.steps}
          simulations={state.simulations}
          localityId={sim.localityId}
          completed={completedSteps.find((c) => c.stepId === selectedNode.id)}
          schedule={schedule[selectedNode.id]}
          nodeData={nodes.find((n) => n.id === selectedNode.id)?.data}
          onComplete={completeStep}
          onRemove={removeStepFromBoard}
          onUpdatePredictedTime={updatePredictedTime}
          onClose={() => setSelectedNode(null)}
          isFinished={isFinished}
        />
      )}
    </div>
  );
}

/* ===== Question Widget ===== */
function QuestionWidget({ question, answer, subAnswers, onAnswer, onSubAnswer, disabled }) {
  const q = question;

  const renderInput = () => {
    if (q.type === 'boolean') {
      return (
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => !disabled && onAnswer(q.id, true)}
            disabled={disabled}
            className={`px-3 py-1 rounded text-xs font-medium border transition ${answer === true ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Sim
          </button>
          <button
            onClick={() => !disabled && onAnswer(q.id, false)}
            disabled={disabled}
            className={`px-3 py-1 rounded text-xs font-medium border transition ${answer === false ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Não
          </button>
        </div>
      );
    }

    if (q.type === 'number_gt' || q.type === 'number_lt') {
      return (
        <div className="mt-1">
          <input
            type="number"
            disabled={disabled}
            className="w-full border rounded px-2 py-1 text-xs disabled:opacity-60"
            placeholder={`Valor em ${q.unit || ''}`}
            value={answer ?? ''}
            onChange={(e) => onAnswer(q.id, e.target.value === '' ? undefined : Number(e.target.value))}
          />
          {q.threshold != null && (
            <span className="text-[10px] text-gray-400">
              {q.type === 'number_gt' ? '>' : '<'} {q.threshold} {q.unit}
            </span>
          )}
        </div>
      );
    }

    if (q.type === 'select') {
      return (
        <select
          disabled={disabled}
          className="w-full border rounded px-2 py-1 text-xs mt-1 disabled:opacity-60"
          value={answer ?? ''}
          onChange={(e) => onAnswer(q.id, e.target.value || undefined)}
        >
          <option value="">Selecione...</option>
          {(q.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    return null;
  };

  const showSubs = q.type === 'boolean' ? answer === q.triggerValue : answer != null;

  return (
    <div className="border rounded p-2.5 bg-gray-50">
      <div className="text-xs font-medium text-gray-700">{q.text}</div>
      {q.eliminatory && <span className="text-[10px] text-red-500 font-medium">(eliminatória)</span>}
      {renderInput()}

      {showSubs && q.subQuestions?.length > 0 && (
        <div className="mt-2 ml-1 space-y-2">
          {q.subQuestions.map((sub) => {
            const subKey = `${q.id}__${sub.id}`;
            const subAnswer = subAnswers[subKey];
            return (
              <div key={sub.id} className="bg-white rounded border border-purple-200 p-2">
                <div className="text-xs font-medium text-purple-700 mb-1">{sub.text}</div>
                {sub.type === 'boolean' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => !disabled && onSubAnswer(q.id, sub.id, true)}
                      disabled={disabled}
                      className={`px-3 py-1 rounded text-xs font-medium border transition ${subAnswer === true ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >Sim</button>
                    <button
                      onClick={() => !disabled && onSubAnswer(q.id, sub.id, false)}
                      disabled={disabled}
                      className={`px-3 py-1 rounded text-xs font-medium border transition ${subAnswer === false ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >Não</button>
                  </div>
                )}
                {(sub.type === 'number_gt' || sub.type === 'number_lt') && (
                  <div>
                    <input
                      type="number"
                      disabled={disabled}
                      className="w-full border rounded px-2 py-1 text-xs disabled:opacity-60"
                      placeholder={`Valor em ${sub.unit || ''}`}
                      value={subAnswer ?? ''}
                      onChange={(e) => onSubAnswer(q.id, sub.id, e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                    {sub.threshold != null && (
                      <span className="text-[10px] text-gray-400">
                        {sub.type === 'number_gt' ? '>' : '<'} {sub.threshold} {sub.unit}
                      </span>
                    )}
                  </div>
                )}
                {sub.stepsToAdd?.length > 0 && (
                  <div className="mt-1 text-[10px] text-gray-400">
                    Vincula: {sub.stepsToAdd.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ===== Step Detail / Completion Modal ===== */
function StepDetailModal({ stepId, steps, simulations, localityId, completed, schedule, nodeData, onComplete, onRemove, onUpdatePredictedTime, onClose, isFinished }) {
  const step = steps.find((s) => s.id === stepId);
  const stats = getStepStats(simulations, stepId, localityId);

  const [duration, setDuration] = useState(completed?.actualDuration ?? step?.defaultDurationMonths ?? 0);
  const [notes, setNotes] = useState(completed?.notes ?? '');
  const [predictedTime, setPredictedTime] = useState(nodeData?.predictedTime ?? '');

  if (!step) return null;

  return (
    <Modal title={step.name} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        {step.details && <p className="text-gray-600 text-xs">{step.details}</p>}

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-50 rounded p-2 text-center">
            <div className="text-gray-500">Padrão</div>
            <div className="font-bold">{fmt(step.defaultDurationMonths)}</div>
          </div>
          <div className="bg-gray-50 rounded p-2 text-center">
            <div className="text-gray-500">Mínimo</div>
            <div className="font-bold">{fmt(step.minDurationMonths)}</div>
          </div>
          <div className="bg-gray-50 rounded p-2 text-center">
            <div className="text-gray-500">Máximo</div>
            <div className="font-bold">{fmt(step.maxDurationMonths)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-50 rounded p-2 text-center">
            <div className="text-gray-500">Custo</div>
            <div className="font-bold">{fmtCurrency(step.estimatedCost)}</div>
          </div>
          <div className="bg-gray-50 rounded p-2 text-center">
            <div className="text-gray-500">Internos</div>
            <div className="font-bold">{fmt(step.internalMonths)}</div>
          </div>
          <div className="bg-gray-50 rounded p-2 text-center">
            <div className="text-gray-500">Externos</div>
            <div className="font-bold">{fmt(step.externalMonths)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-amber-50 rounded p-2">
            <div className="text-amber-700 font-medium mb-1">Tempo previsto (manual)</div>
            {!isFinished ? (
              <input
                type="number"
                step="0.5"
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="meses"
                value={predictedTime}
                onChange={(e) => setPredictedTime(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() => onUpdatePredictedTime(stepId, predictedTime === '' ? null : Number(predictedTime))}
              />
            ) : (
              <div className="font-bold">{predictedTime ? `${predictedTime}m` : 'N/A'}</div>
            )}
          </div>
          <div className="bg-purple-50 rounded p-2">
            <div className="text-purple-700 font-medium mb-1">Tempo previsto (estatística)</div>
            <div className="font-bold text-purple-900">
              {stats ? `${stats.avg}m (média de ${stats.count})` : 'Sem dados'}
            </div>
            {stats && <div className="text-[10px] text-purple-500">Mediana: {stats.median}m</div>}
          </div>
        </div>

        {schedule && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-blue-50 rounded p-2 text-center">
              <div className="text-blue-500">Início (ES)</div>
              <div className="font-bold">{fmtTotal(schedule.es)}m</div>
            </div>
            <div className="bg-blue-50 rounded p-2 text-center">
              <div className="text-blue-500">Fim (EF)</div>
              <div className="font-bold">{fmtTotal(schedule.ef)}m</div>
            </div>
            <div className="bg-blue-50 rounded p-2 text-center">
              <div className="text-blue-500">Folga</div>
              <div className="font-bold">{fmtTotal(schedule.slack)}m</div>
            </div>
          </div>
        )}

        {!isFinished && (
          <div className="border-t pt-3">
            <h3 className="font-semibold text-gray-700 mb-2">
              {completed ? 'Etapa concluída' : 'Concluir etapa'}
            </h3>
            <label className="block mb-2">
              <span className="text-xs text-gray-600">Duração real (meses)</span>
              <input
                type="number"
                step="0.5"
                className="w-full border rounded px-3 py-1.5"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
            <label className="block mb-2">
              <span className="text-xs text-gray-600">Observações</span>
              <textarea
                className="w-full border rounded px-3 py-1.5 h-16"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
        )}

        {completed && isFinished && (
          <div className="bg-green-50 border border-green-200 rounded p-3 text-xs">
            <div className="font-semibold text-green-800">Concluída</div>
            <div className="text-green-700">Duração real: {completed.actualDuration}m</div>
            {completed.notes && <div className="text-green-600 mt-1">{completed.notes}</div>}
          </div>
        )}

        <div className="flex justify-between pt-2 border-t">
          {!isFinished && (
            <button
              onClick={() => { onRemove(stepId); }}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded font-medium"
            >
              Excluir do board
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Fechar</button>
            {!isFinished && (
              <button
                onClick={() => { onComplete(stepId, duration, notes); onClose(); }}
                className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded font-medium"
              >
                {completed ? 'Atualizar' : 'Concluir'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ===== Helpers ===== */
function shouldTrigger(question, answer) {
  if (question.type === 'boolean') return answer === question.triggerValue;
  if (question.type === 'number_gt') return typeof answer === 'number' && answer > (question.threshold ?? 0);
  if (question.type === 'number_lt') return typeof answer === 'number' && answer < (question.threshold ?? 0);
  if (question.type === 'select') return answer === question.triggerValue;
  return false;
}
