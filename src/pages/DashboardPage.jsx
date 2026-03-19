import { useMemo } from 'react';
import { fmtCurrency } from '../engine';

// ── Helpers ─────────────────────────────────────────────────────────────────

function diffMonths(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (db - da) / (1000 * 60 * 60 * 24 * 30.44);
}

function fmt1(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// ── Tiny building‑blocks for charts ─────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'amber' }) {
  const ring = {
    amber: 'border-amber-400',
    green: 'border-green-400',
    blue: 'border-blue-400',
    rose: 'border-rose-400',
    purple: 'border-purple-400',
  }[color] ?? 'border-amber-400';

  const txt = {
    amber: 'text-amber-600',
    green: 'text-green-600',
    blue: 'text-blue-600',
    rose: 'text-rose-600',
    purple: 'text-purple-600',
  }[color] ?? 'text-amber-600';

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border-l-4 ${ring} flex flex-col gap-1`}>
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-bold ${txt}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function HBar({ label, value, max, fmtVal, color = 'bg-amber-400', sub }) {
  const width = max > 0 ? Math.max(2, pct(value, max)) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs text-gray-600 w-48 truncate flex-shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div className={`${color} h-4 rounded-full transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-20 text-right flex-shrink-0">{fmtVal ?? value}</span>
      {sub && <span className="text-xs text-gray-400 w-16 flex-shrink-0">{sub}</span>}
    </div>
  );
}

function DeltaBar({ label, expected, actual, max }) {
  const expW = max > 0 ? pct(expected, max) : 0;
  const actW = max > 0 ? pct(actual, max) : 0;
  const delta = actual - expected;
  const isLate = delta > 0.05;
  const isEarly = delta < -0.05;

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-gray-600 truncate max-w-[200px]">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">Previsto: {fmt1(expected)}m</span>
          <span className={`text-[11px] font-semibold ${isLate ? 'text-rose-500' : isEarly ? 'text-green-600' : 'text-gray-500'}`}>
            Real: {fmt1(actual)}m
            {isLate && ` (+${fmt1(delta)})`}
            {isEarly && ` (${fmt1(delta)})`}
          </span>
        </div>
      </div>
      <div className="relative bg-gray-100 rounded-full h-3 overflow-visible">
        <div
          className="absolute top-0 left-0 h-3 rounded-full bg-blue-200"
          style={{ width: `${expW}%` }}
        />
        <div
          className={`absolute top-0 left-0 h-3 rounded-full ${isLate ? 'bg-rose-400' : isEarly ? 'bg-green-400' : 'bg-blue-400'} opacity-80`}
          style={{ width: `${actW}%` }}
        />
      </div>
    </div>
  );
}

const AREA_COLORS = {
  Licenciamento: 'bg-blue-400',
  Ambiental: 'bg-green-500',
  Obra: 'bg-orange-400',
  Jurídico: 'bg-purple-400',
  Urbanismo: 'bg-indigo-400',
  Projetos: 'bg-yellow-400',
  Patrimônio: 'bg-pink-400',
  Gestão: 'bg-gray-400',
};

const AREA_TEXT = {
  Licenciamento: 'text-blue-600',
  Ambiental: 'text-green-600',
  Obra: 'text-orange-500',
  Jurídico: 'text-purple-600',
  Urbanismo: 'text-indigo-600',
  Projetos: 'text-yellow-600',
  Patrimônio: 'text-pink-600',
  Gestão: 'text-gray-600',
};

function AreaBadge({ area }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${AREA_TEXT[area] ?? 'text-gray-500'} bg-opacity-10`}>
      {area}
    </span>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 ${className}`}>
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage({ state }) {
  const { simulations, steps, localities, templates } = state;

  // ── Summary KPIs ────────────────────────────────────────────────
  const finished = simulations.filter((s) => s.finishedAt);
  const inProgress = simulations.filter((s) => !s.finishedAt);

  const totalStepsInAllSims = simulations.reduce((acc, s) => acc + (s.nodes?.length || 0), 0);

  const allCompletedSteps = simulations.flatMap((s) => s.completedSteps || []);
  const stepsWithDelay = allCompletedSteps.filter((cs) => {
    const step = steps.find((s) => s.id === cs.stepId);
    if (!step || cs.actualDuration == null) return false;
    return cs.actualDuration > step.defaultDurationMonths + 0.1;
  });

  // Total estimated cost across all simulations (sum of steps in each simulation)
  const totalEstimatedCost = simulations.reduce((total, sim) => {
    return total + (sim.nodes || []).reduce((acc, node) => {
      const step = steps.find((s) => s.id === node.id);
      return acc + (step?.estimatedCost || 0);
    }, 0);
  }, 0);

  // ── Avg completion time for finished sims ───────────────────────
  const avgCompletionMonths = useMemo(() => {
    const times = finished.map((s) => diffMonths(s.createdAt, s.finishedAt)).filter((t) => t > 0);
    if (!times.length) return null;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }, [finished]);

  // ── Steps by area ───────────────────────────────────────────────
  const areaBreakdown = useMemo(() => {
    const map = {};
    steps.forEach((s) => {
      map[s.area] = (map[s.area] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [steps]);

  const maxAreaCount = areaBreakdown[0]?.[1] || 1;

  // ── Step frequency in simulations ───────────────────────────────
  const stepFrequency = useMemo(() => {
    const map = {};
    simulations.forEach((sim) => {
      (sim.nodes || []).forEach((n) => {
        map[n.id] = (map[n.id] || 0) + 1;
      });
    });
    return Object.entries(map)
      .map(([id, count]) => ({ id, count, name: steps.find((s) => s.id === id)?.name || id, area: steps.find((s) => s.id === id)?.area || '' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [simulations, steps]);

  const maxFreq = stepFrequency[0]?.count || 1;

  // ── Duration deviation analysis (default vs actual) ─────────────
  const durationAnalysis = useMemo(() => {
    const map = {};
    simulations.forEach((sim) => {
      (sim.completedSteps || []).forEach((cs) => {
        if (cs.actualDuration == null) return;
        const step = steps.find((s) => s.id === cs.stepId);
        if (!step) return;
        if (!map[cs.stepId]) map[cs.stepId] = { step, actuals: [] };
        map[cs.stepId].actuals.push(cs.actualDuration);
      });
    });

    return Object.values(map)
      .map(({ step, actuals }) => {
        const avg = actuals.reduce((a, b) => a + b, 0) / actuals.length;
        const delta = avg - step.defaultDurationMonths;
        return { step, avgActual: avg, delta, sampleSize: actuals.length };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [simulations, steps]);

  const maxDurAnalysis = durationAnalysis.reduce((m, d) => Math.max(m, d.step.defaultDurationMonths, d.avgActual), 0);

  // ── Cost by area (across all step catalog) ──────────────────────
  const costByArea = useMemo(() => {
    const map = {};
    steps.forEach((s) => {
      if (!s.estimatedCost) return;
      map[s.area] = (map[s.area] || 0) + s.estimatedCost;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [steps]);

  const maxCost = costByArea[0]?.[1] || 1;

  // ── Simulations by locality ──────────────────────────────────────
  const simsByLocality = useMemo(() => {
    const map = {};
    simulations.forEach((sim) => {
      const loc = localities.find((l) => l.id === sim.localityId);
      const name = loc ? `${loc.name}/${loc.state}` : sim.localityId;
      if (!map[name]) map[name] = { total: 0, finished: 0 };
      map[name].total++;
      if (sim.finishedAt) map[name].finished++;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [simulations, localities]);

  const maxSimsLoc = simsByLocality[0]?.[1]?.total || 1;

  // ── Recent simulations ───────────────────────────────────────────
  const recentSims = useMemo(
    () => [...simulations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6),
    [simulations],
  );

  // ── Steps exceeding estimated time most often ────────────────────
  const riskSteps = durationAnalysis.filter((d) => d.delta > 0).slice(0, 5);
  const earlySteps = durationAnalysis.filter((d) => d.delta < 0).slice(0, 3);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Visão geral do portfólio de licenciamento &middot; atualizado em {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2 text-xs text-gray-500">
          <span className="bg-gray-100 px-3 py-1 rounded-full">{localities.length} localidades</span>
          <span className="bg-gray-100 px-3 py-1 rounded-full">{steps.length} etapas</span>
          <span className="bg-gray-100 px-3 py-1 rounded-full">{templates.length} templates</span>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Total de Simulações"
          value={simulations.length}
          sub={`${totalStepsInAllSims} etapas no total`}
          color="blue"
        />
        <KpiCard
          label="Concluídas"
          value={finished.length}
          sub={avgCompletionMonths ? `Média: ${fmt1(avgCompletionMonths)} meses` : 'Sem dados de tempo'}
          color="green"
        />
        <KpiCard
          label="Em Andamento"
          value={inProgress.length}
          sub={`${inProgress.reduce((a, s) => a + (s.completedSteps?.length || 0), 0)} etapas feitas`}
          color="amber"
        />
        <KpiCard
          label="Custo Total Est."
          value={fmtCurrency(totalEstimatedCost)}
          sub="Soma de todas simulações"
          color="purple"
        />
        <KpiCard
          label="Etapas com Atraso"
          value={stepsWithDelay.length}
          sub={`de ${allCompletedSteps.length} etapas registradas`}
          color="rose"
        />
      </div>

      {/* ── Row 2: Area breakdown + Locality breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <Section title="Etapas por área (catálogo)">
          <div className="space-y-0.5">
            {areaBreakdown.map(([area, count]) => (
              <HBar
                key={area}
                label={area}
                value={count}
                max={maxAreaCount}
                fmtVal={`${count} etapa${count !== 1 ? 's' : ''}`}
                color={AREA_COLORS[area] ?? 'bg-gray-400'}
              />
            ))}
          </div>
        </Section>

        <Section title="Simulações por localidade">
          <div className="space-y-2">
            {simsByLocality.length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma simulação criada ainda.</p>
            )}
            {simsByLocality.map(([name, { total, finished: fin }]) => (
              <div key={name}>
                <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span className="font-medium">{name}</span>
                  <span>{fin} concluídas / {total} total</span>
                </div>
                <div className="flex gap-1 h-4">
                  <div
                    className="bg-green-400 rounded-l h-4"
                    style={{ width: `${pct(fin, maxSimsLoc) * 0.7}%`, minWidth: fin > 0 ? '4px' : 0 }}
                    title="Concluídas"
                  />
                  <div
                    className="bg-amber-300 rounded-r h-4"
                    style={{ width: `${pct(total - fin, maxSimsLoc) * 0.7}%`, minWidth: total - fin > 0 ? '4px' : 0 }}
                    title="Em andamento"
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-4 mt-3 pt-3 border-t">
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-3 h-3 rounded bg-green-400 inline-block" /> Concluídas
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-3 h-3 rounded bg-amber-300 inline-block" /> Em andamento
              </span>
            </div>
          </div>
        </Section>
      </div>

      {/* ── Row 3: Duration deviation ── */}
      {durationAnalysis.length > 0 && (
        <Section title="Tempo previsto vs. realizado por etapa">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-1">
              {durationAnalysis.map(({ step, avgActual, delta }) => (
                <DeltaBar
                  key={step.id}
                  label={step.name}
                  expected={step.defaultDurationMonths}
                  actual={avgActual}
                  max={maxDurAnalysis}
                />
              ))}
              <div className="flex gap-6 mt-3 pt-3 border-t">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-4 h-3 rounded bg-blue-200 inline-block" /> Previsto
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-4 h-3 rounded bg-rose-400 inline-block" /> Acima do previsto
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-4 h-3 rounded bg-green-400 inline-block" /> Abaixo do previsto
                </span>
              </div>
            </div>
            <div className="space-y-4">
              {riskSteps.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-rose-600 uppercase tracking-wide mb-2">⚠ Maior atraso médio</h3>
                  <div className="space-y-1.5">
                    {riskSteps.map(({ step, delta, sampleSize }) => (
                      <div key={step.id} className="flex items-center justify-between bg-rose-50 rounded px-3 py-1.5">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{step.name}</p>
                          <p className="text-[10px] text-gray-400">{sampleSize} ocorrência{sampleSize !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-sm font-bold text-rose-500">+{fmt1(delta)}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {earlySteps.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2">✓ Concluídas mais rápido</h3>
                  <div className="space-y-1.5">
                    {earlySteps.map(({ step, delta, sampleSize }) => (
                      <div key={step.id} className="flex items-center justify-between bg-green-50 rounded px-3 py-1.5">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{step.name}</p>
                          <p className="text-[10px] text-gray-400">{sampleSize} ocorrência{sampleSize !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-sm font-bold text-green-600">{fmt1(delta)}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Row 4: Step frequency + Cost by area ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <Section title="Etapas mais usadas nas simulações">
          {stepFrequency.length === 0 && (
            <p className="text-sm text-gray-400">Nenhuma simulação com etapas ainda.</p>
          )}
          <div className="space-y-0.5">
            {stepFrequency.map(({ id, name, count, area }) => (
              <HBar
                key={id}
                label={name}
                value={count}
                max={maxFreq}
                fmtVal={`${count}×`}
                color={AREA_COLORS[area] ?? 'bg-gray-300'}
                sub={area}
              />
            ))}
          </div>
        </Section>

        <Section title="Custo estimado por área (catálogo)">
          <div className="space-y-0.5">
            {costByArea.map(([area, cost]) => (
              <HBar
                key={area}
                label={area}
                value={cost}
                max={maxCost}
                fmtVal={fmtCurrency(cost)}
                color={AREA_COLORS[area] ?? 'bg-gray-400'}
              />
            ))}
          </div>
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <span className="text-xs text-gray-500">Total catálogo</span>
            <span className="text-sm font-bold text-gray-700">
              {fmtCurrency(steps.reduce((acc, s) => acc + (s.estimatedCost || 0), 0))}
            </span>
          </div>
        </Section>
      </div>

      {/* ── Row 5: Simulations table ── */}
      <Section title="Simulações recentes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="text-left pb-2 font-medium">Nome</th>
                <th className="text-left pb-2 font-medium">Localidade</th>
                <th className="text-center pb-2 font-medium">Etapas</th>
                <th className="text-center pb-2 font-medium">Concluídas</th>
                <th className="text-right pb-2 font-medium">Custo Est.</th>
                <th className="text-right pb-2 font-medium">Tempo (criação→fim)</th>
                <th className="text-center pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentSims.map((sim) => {
                const loc = localities.find((l) => l.id === sim.localityId);
                const locName = loc ? `${loc.name}/${loc.state}` : sim.localityId;
                const stepCount = sim.nodes?.length || 0;
                const doneCount = sim.completedSteps?.length || 0;
                const simCost = (sim.nodes || []).reduce((acc, n) => {
                  const step = steps.find((s) => s.id === n.id);
                  return acc + (step?.estimatedCost || 0);
                }, 0);
                const elapsed = sim.finishedAt
                  ? diffMonths(sim.createdAt, sim.finishedAt)
                  : diffMonths(sim.createdAt, new Date().toISOString());
                const isFinished = !!sim.finishedAt;
                const progress = stepCount > 0 ? pct(doneCount, stepCount) : 0;

                return (
                  <tr key={sim.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-800">{sim.name}</td>
                    <td className="py-3 text-xs text-gray-500">{locName}</td>
                    <td className="py-3 text-center text-xs">{stepCount}</td>
                    <td className="py-3 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <div className="w-16 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${isFinished ? 'bg-green-400' : 'bg-amber-400'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-500">{doneCount}/{stepCount}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-xs text-gray-600">{simCost > 0 ? fmtCurrency(simCost) : '—'}</td>
                    <td className="py-3 text-right text-xs">
                      {isFinished
                        ? <span className="text-green-600 font-medium">{fmt1(elapsed)} meses</span>
                        : <span className="text-amber-600">{fmt1(elapsed)}m decorridos</span>
                      }
                    </td>
                    <td className="py-3 text-center">
                      {isFinished
                        ? <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Concluída</span>
                        : <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Em andamento</span>
                      }
                    </td>
                  </tr>
                );
              })}
              {recentSims.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-400 text-sm">Nenhuma simulação criada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Row 6: Step catalog quick stats ── */}
      <Section title="Estatísticas do catálogo de etapas">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Maior duração padrão',
              step: [...steps].sort((a, b) => b.defaultDurationMonths - a.defaultDurationMonths)[0],
              fmt: (s) => `${s.defaultDurationMonths} meses`,
            },
            {
              label: 'Maior variação (máx−mín)',
              step: [...steps].sort((a, b) => (b.maxDurationMonths - b.minDurationMonths) - (a.maxDurationMonths - a.minDurationMonths))[0],
              fmt: (s) => `±${fmt1((s.maxDurationMonths - s.minDurationMonths) / 2)} meses`,
            },
            {
              label: 'Maior custo estimado',
              step: [...steps].sort((a, b) => b.estimatedCost - a.estimatedCost)[0],
              fmt: (s) => fmtCurrency(s.estimatedCost),
            },
            {
              label: 'Menor duração (excl. marcos)',
              step: [...steps].filter((s) => s.defaultDurationMonths > 0).sort((a, b) => a.defaultDurationMonths - b.defaultDurationMonths)[0],
              fmt: (s) => `${s.defaultDurationMonths} meses`,
            },
          ].map(({ label, step, fmt: fmtFn }) => {
            if (!step) return null;
            return (
              <div key={label} className="bg-gray-50 rounded-lg p-3 border">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-sm font-semibold text-gray-800 leading-tight mb-1">{step.name}</p>
                <p className="text-base font-bold text-amber-600">{fmtFn(step)}</p>
                <AreaBadge area={step.area} />
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-3 md:grid-cols-6 gap-3">
          {areaBreakdown.map(([area, count]) => (
            <div key={area} className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full ${AREA_COLORS[area] ?? 'bg-gray-400'} flex items-center justify-center text-white text-sm font-bold`}>
                {count}
              </div>
              <span className="text-[10px] text-gray-500 text-center leading-tight">{area}</span>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
