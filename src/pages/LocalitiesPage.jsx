import { useState } from 'react';
import Modal from '../components/Modal';
import { genId } from '../engine';

// ── PDF.js CDN loader (avoids heavy npm dep) ──────────────────────────────────
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function loadPdfjsLib() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS_CDN;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Falha ao carregar pdf.js da CDN'));
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return window.pdfjsLib;
}

async function extractPdfText(dataUrl) {
  const lib = await loadPdfjsLib();
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await lib.getDocument({ data: bytes }).promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, 100);
  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return { text, numPages: pdf.numPages, pagesRead: maxPages };
}

// ── AI extraction (OpenAI + Gemini) ─────────────────────────────────────────
const EXTRACTION_PROMPT = `Analise o trecho do Plano Diretor abaixo e retorne SOMENTE um objeto JSON válido (sem markdown, sem texto fora do JSON) com a seguinte estrutura:

{
  "municipio": "nome do município",
  "anoAprovacao": "ano de aprovação/revisão como string ou null",
  "resumoExecutivo": "2-3 frases resumindo as principais diretrizes para empreendimentos imobiliários verticais",
  "zonas": [
    {
      "sigla": "ex: ZO, ZRM, ZC",
      "nome": "nome completo da zona",
      "coeficienteAproveitamentoBasico": número_ou_null,
      "coeficienteAproveitamentoMaximo": número_ou_null,
      "taxaOcupacaoMaxima": número_entre_0_e_1_ou_null,
      "gabaritoMaxAndares": número_inteiro_ou_null,
      "alturaMaximaMetros": número_ou_null,
      "recuoFrontalMinimo": número_metros_ou_null,
      "recuoLateralMinimo": número_metros_ou_null,
      "usoResidencialPermitido": true_false_ou_null,
      "usoComercialPermitido": true_false_ou_null,
      "observacoes": "peculiaridades relevantes sobre esta zona"
    }
  ],
  "outorgaOnerosa": {
    "prevista": true_ou_false,
    "coeficienteMaximoOutorga": número_ou_null,
    "descricao": "descrição breve ou null"
  },
  "zonasEspeciais": [
    { "tipo": "ex: ZEIS, ZIA, ZEPAM, ZPA", "sigla": "sigla", "descricao": "descrição breve" }
  ],
  "restricoesAmbientais": [
    "lista de restrições ambientais, APPs, áreas de proteção relevantes"
  ],
  "pontosDeAtencao": [
    "lista de pontos críticos que impactam aprovações de empreendimentos verticais neste município"
  ]
}`;

async function callOpenAI(pdfText, apiKey) {
  const truncated = pdfText.slice(0, 16000);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Você é especialista em direito urbanístico e planejamento urbano brasileiro. Responda APENAS com JSON válido, sem markdown.',
        },
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}\n\nTEXTO DO PLANO DIRETOR:\n${truncated}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content.trim();
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(clean);
}

async function callGemini(pdfText, apiKey) {
  const truncated = pdfText.slice(0, 20000);
  const prompt = `${EXTRACTION_PROMPT}\n\nTEXTO DO PLANO DIRETOR:\n${truncated}\n\nResponda APENAS com JSON válido, sem markdown, sem texto fora do JSON.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Erro HTTP ${res.status}`,
    );
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error('Resposta vazia do Gemini');
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(clean);
}

async function callAI(pdfText, apiKey, provider) {
  return provider === 'gemini' ? callGemini(pdfText, apiKey) : callOpenAI(pdfText, apiKey);
}

// ── API Key helpers ───────────────────────────────────────────────────────────
const PROVIDER_STORAGE = 'victa_ai_provider';
const KEY_STORAGE = { openai: 'victa_openai_key', gemini: 'victa_gemini_key' };
const getStoredProvider = () => localStorage.getItem(PROVIDER_STORAGE) || 'openai';
const saveStoredProvider = (p) => localStorage.setItem(PROVIDER_STORAGE, p);
const getStoredKey = (p) => localStorage.getItem(KEY_STORAGE[p] || KEY_STORAGE.openai) || '';
const saveStoredKey = (p, k) => localStorage.setItem(KEY_STORAGE[p] || KEY_STORAGE.openai, k);

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function LocalitiesPage({ state, update }) {
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [provider, setProvider] = useState(() => getStoredProvider());
  const [apiKey, setApiKey] = useState(() => getStoredKey(getStoredProvider()));
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [providerDraft, setProviderDraft] = useState('openai');

  const save = (loc) => {
    const exists = state.localities.find((l) => l.id === loc.id);
    update({
      localities: exists
        ? state.localities.map((l) => (l.id === loc.id ? loc : l))
        : [...state.localities, loc],
    });
    setEditing(null);
  };

  const remove = (id) => update({ localities: state.localities.filter((l) => l.id !== id) });

  const saveInsights = (locId, insights) => {
    update({
      localities: state.localities.map((l) =>
        l.id === locId ? { ...l, planoDiretorInsights: insights } : l,
      ),
    });
    // Keep viewer in sync
    setViewing((v) => (v?.id === locId ? { ...v, planoDiretorInsights: insights } : v));
  };

  const confirmKey = () => {
    const k = keyDraft.trim();
    saveStoredProvider(providerDraft);
    saveStoredKey(providerDraft, k);
    setProvider(providerDraft);
    setApiKey(k);
    setShowKeyModal(false);
    setKeyDraft('');
  };

  const openKeyModal = () => {
    setProviderDraft(provider);
    setKeyDraft(getStoredKey(provider));
    setShowKeyModal(true);
  };

  const handleProviderDraftChange = (p) => {
    setProviderDraft(p);
    setKeyDraft(getStoredKey(p));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Localidades</h1>
        <div className="flex gap-2">
          <button
            onClick={openKeyModal}
            className={`text-xs px-3 py-1.5 rounded border font-medium transition ${
              apiKey
                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                : 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
            }`}
          >
            {apiKey
              ? `🔑 ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} configurado`
              : '⚠️ Configurar API Key'}
          </button>
          <button
            onClick={() =>
              setEditing({
                id: genId('loc'),
                name: '',
                state: '',
                planoDiretorFileName: null,
                planoDiretorDataUrl: null,
                planoDiretorInsights: null,
              })
            }
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium"
          >
            + Nova Localidade
          </button>
        </div>
      </div>

      {!state.localities.length && (
        <p className="text-gray-400 text-sm">Nenhuma localidade cadastrada.</p>
      )}

      <div className="grid grid-cols-1 gap-4">
        {state.localities.map((loc) => (
          <LocalityCard
            key={loc.id}
            locality={loc}
            onEdit={() => setEditing({ ...loc })}
            onRemove={() => remove(loc.id)}
            onView={() => setViewing({ ...loc })}
          />
        ))}
      </div>

      {/* API Key modal */}
      {showKeyModal && (
        <Modal title="Configurar provedor de IA" onClose={() => setShowKeyModal(false)}>
          <div className="space-y-4">
            {/* Provider selector */}
            <div>
              <span className="text-xs text-gray-600 font-medium block mb-1.5">Provedor</span>
              <div className="flex gap-2">
                {[{ id: 'openai', label: 'OpenAI (GPT-4o mini)', color: 'green' }, { id: 'gemini', label: 'Google Gemini 2.0 Flash', color: 'blue' }].map(({ id, label, color }) => (
                  <button
                    key={id}
                    onClick={() => handleProviderDraftChange(id)}
                    className={`flex-1 py-2 rounded border text-xs font-medium transition ${
                      providerDraft === id
                        ? color === 'green'
                          ? 'bg-green-100 border-green-400 text-green-800'
                          : 'bg-blue-100 border-blue-400 text-blue-800'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {id === 'openai' ? '🟢' : '🔵'} {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              A chave é salva apenas no <code>localStorage</code> do navegador.
            </p>

            <label className="block">
              <span className="text-xs text-gray-600">
                {providerDraft === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}
              </span>
              <input
                type="password"
                className="w-full border rounded px-3 py-1.5 text-sm font-mono mt-1"
                placeholder={providerDraft === 'gemini' ? 'AIza...' : 'sk-...'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmKey()}
              />
            </label>

            {getStoredKey(providerDraft) && (
              <button
                onClick={() => {
                  saveStoredKey(providerDraft, '');
                  setKeyDraft('');
                  if (providerDraft === provider) setApiKey('');
                }}
                className="text-xs text-red-500 hover:underline"
              >
                Remover chave do {providerDraft === 'gemini' ? 'Gemini' : 'OpenAI'}
              </button>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowKeyModal(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
              <button onClick={confirmKey} className="px-4 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded">Salvar</button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <LocalityFormModal locality={editing} onSave={save} onClose={() => setEditing(null)} />
      )}

      {viewing && (
        <PlanoDiretorViewerModal
          locality={viewing}
          apiKey={apiKey}
          provider={provider}
          onClose={() => setViewing(null)}
          onSaveInsights={saveInsights}
          onNeedKey={openKeyModal}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LOCALITY CARD
// ═════════════════════════════════════════════════════════════════════════════
function LocalityCard({ locality: loc, onEdit, onRemove, onView }) {
  const hasDoc = !!loc.planoDiretorDataUrl;
  const ins = loc.planoDiretorInsights;

  return (
    <div className={`bg-white rounded-xl shadow border p-5 transition ${ins ? 'border-purple-200' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-800 text-base">{loc.name}</h3>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">{loc.state}</span>
            {ins && (
              <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded font-medium">✦ Insights IA</span>
            )}
          </div>

          {/* Plano Diretor row */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {hasDoc ? (
              <>
                <span className="text-[11px] text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded truncate max-w-[260px]">
                  📄 {loc.planoDiretorFileName}
                </span>
                <button
                  onClick={onView}
                  className="text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded font-medium transition"
                >
                  Visualizar + Extrair com IA →
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-400 italic">Nenhum Plano Diretor vinculado — edite para adicionar um PDF.</span>
            )}
          </div>

          {/* Quick insights summary */}
          {ins && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-100 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-purple-900">{ins.municipio}</span>
                {ins.anoAprovacao && (
                  <span className="text-purple-400">({ins.anoAprovacao})</span>
                )}
              </div>
              <p className="text-purple-700 leading-relaxed">{ins.resumoExecutivo}</p>
              {ins.zonas?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {ins.zonas.map((z, i) => (
                    <span key={i} className="bg-purple-200 text-purple-800 text-[10px] font-medium px-1.5 py-0.5 rounded">{z.sigla}</span>
                  ))}
                  <span className="text-purple-400 text-[10px] self-center">{ins.zonas.length} zonas</span>
                </div>
              )}
              {ins.pontosDeAtencao?.length > 0 && (
                <div className="text-orange-700 text-[10px]">
                  ⚠️ {ins.pontosDeAtencao.length} ponto(s) de atenção identificado(s)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <button onClick={onEdit} className="text-blue-600 hover:underline text-xs">Editar</button>
          <button onClick={onRemove} className="text-red-500 hover:underline text-xs">Excluir</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PDF VIEWER + AI EXTRACTION MODAL (full-screen overlay)
// ═════════════════════════════════════════════════════════════════════════════
function PlanoDiretorViewerModal({ locality, apiKey, provider, onClose, onSaveInsights, onNeedKey }) {
  const [insights, setInsights] = useState(locality.planoDiretorInsights || null);
  const [status, setStatus] = useState('idle'); // idle | extracting | error
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const handleExtract = async () => {
    if (!apiKey) { onNeedKey(); return; }
    if (!locality.planoDiretorDataUrl) return;

    setStatus('extracting');
    setError('');
    try {
      setProgress('Carregando biblioteca de PDF...');
      const { text, numPages, pagesRead } = await extractPdfText(locality.planoDiretorDataUrl);
      const providerLabel = provider === 'gemini' ? 'Gemini' : 'OpenAI';
      setProgress(
        `${pagesRead} de ${numPages} páginas lidas · ${text.length.toLocaleString('pt-BR')} caracteres extraídos. Enviando para ${providerLabel}...`,
      );
      const result = await callAI(text, apiKey, provider);
      const withMeta = { ...result, extractedAt: new Date().toISOString() };
      setInsights(withMeta);
      onSaveInsights(locality.id, withMeta);
      setStatus('idle');
      setProgress('');
    } catch (e) {
      setStatus('error');
      setError(e.message);
      setProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '96vw', height: '92vh', maxWidth: 1500 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0 bg-gray-50">
          <div>
            <h2 className="font-bold text-gray-800">
              📄 Plano Diretor — {locality.name}/{locality.state}
            </h2>
            <p className="text-xs text-gray-400">{locality.planoDiretorFileName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none px-1">×</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* PDF viewer — left column */}
          <div className="flex-1 flex flex-col min-h-0 bg-gray-200 border-r">
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-300 shrink-0">
              <span className="text-xs text-gray-500 font-medium">Visualização</span>
              {locality.planoDiretorDataUrl && (
                <a
                  href={locality.planoDiretorDataUrl}
                  download={locality.planoDiretorFileName}
                  className="text-xs text-blue-600 hover:underline"
                >
                  ⬇ Baixar PDF
                </a>
              )}
            </div>
            {locality.planoDiretorDataUrl ? (
              <iframe
                src={locality.planoDiretorDataUrl}
                className="flex-1 w-full"
                title="Plano Diretor PDF"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Nenhum PDF vinculado
              </div>
            )}
          </div>

          {/* Insights panel — right column */}
          <div className="flex flex-col min-h-0" style={{ width: 440 }}>
            {/* Extraction controls */}
            <div className="p-4 border-b bg-purple-50 shrink-0">
              <p className="text-sm font-semibold text-purple-800 mb-0.5">Extração com IA</p>
              <p className="text-[11px] text-purple-500 mb-3">
                Extrai automaticamente zoneamento, coeficientes, recuos, zonas especiais e pontos de atenção.
              </p>
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  provider === 'gemini' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {provider === 'gemini' ? '🔵 Gemini 2.0 Flash' : '🟢 GPT-4o mini'}
                </span>
                <button onClick={onNeedKey} className="text-[11px] text-gray-400 hover:text-gray-600 underline">trocar</button>
              </div>
              {!apiKey && (
                <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
                  ⚠️ Nenhuma API Key configurada.{' '}
                  <button onClick={onNeedKey} className="underline font-medium">Configurar agora</button>
                </div>
              )}
              <button
                onClick={handleExtract}
                disabled={status === 'extracting' || !locality.planoDiretorDataUrl}
                className="w-full py-2 rounded font-medium text-sm transition disabled:opacity-50
                  bg-purple-600 hover:bg-purple-700 text-white"
              >
                {status === 'extracting'
                  ? '⏳ Extraindo...'
                  : insights
                  ? '🔄 Re-extrair com IA'
                  : '✦ Extrair informações com IA'}
              </button>
              {progress && <p className="text-[11px] text-purple-500 mt-2 leading-relaxed">{progress}</p>}
              {status === 'error' && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  ❌ {error}
                </div>
              )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4">
              {insights ? (
                <InsightsDisplay insights={insights} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center px-4">
                  <div className="text-5xl mb-3">🤖</div>
                  <p className="text-sm">
                    Clique em <strong>"Extrair informações com IA"</strong> para analisar o Plano Diretor automaticamente.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// INSIGHTS DISPLAY
// ═════════════════════════════════════════════════════════════════════════════
function InsightsDisplay({ insights: ins }) {
  const [expandedZone, setExpandedZone] = useState(null);

  return (
    <div className="space-y-4 text-xs">
      {/* Header / Resumo */}
      <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-purple-900 text-sm">{ins.municipio}</span>
          {ins.anoAprovacao && (
            <span className="text-purple-400 text-[11px]">Aprovado {ins.anoAprovacao}</span>
          )}
        </div>
        <p className="mt-1 text-purple-700 leading-relaxed">{ins.resumoExecutivo}</p>
        {ins.extractedAt && (
          <p className="text-[10px] text-purple-300 mt-1.5">
            Extraído em {new Date(ins.extractedAt).toLocaleString('pt-BR')}
          </p>
        )}
      </div>

      {/* Zones */}
      {ins.zonas?.length > 0 && (
        <section>
          <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <span className="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-[11px]">{ins.zonas.length}</span>
            Zonas identificadas
          </h3>
          <div className="space-y-1.5">
            {ins.zonas.map((z, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 hover:bg-blue-100 text-left transition"
                  onClick={() => setExpandedZone(expandedZone === i ? null : i)}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-blue-800">{z.sigla}</span>
                    <span className="text-blue-600 text-[11px] truncate max-w-[220px]">{z.nome}</span>
                  </div>
                  <span className="text-blue-400 text-[10px] shrink-0">{expandedZone === i ? '▲' : '▼'}</span>
                </button>
                {expandedZone === i && (
                  <div className="p-3 bg-white grid grid-cols-2 gap-x-4 gap-y-2">
                    <MRow label="CA básico" value={z.coeficienteAproveitamentoBasico} />
                    <MRow label="CA máximo" value={z.coeficienteAproveitamentoMaximo} />
                    <MRow
                      label="Taxa de ocupação"
                      value={z.taxaOcupacaoMaxima != null ? `${(z.taxaOcupacaoMaxima * 100).toFixed(0)}%` : null}
                    />
                    <MRow
                      label="Gabarito max."
                      value={z.gabaritoMaxAndares != null ? `${z.gabaritoMaxAndares} pav.` : null}
                    />
                    <MRow
                      label="Altura máxima"
                      value={z.alturaMaximaMetros != null ? `${z.alturaMaximaMetros} m` : null}
                    />
                    <MRow
                      label="Recuo frontal"
                      value={z.recuoFrontalMinimo != null ? `${z.recuoFrontalMinimo} m` : null}
                    />
                    <MRow
                      label="Recuo lateral"
                      value={z.recuoLateralMinimo != null ? `${z.recuoLateralMinimo} m` : null}
                    />
                    <MRow
                      label="Uso residencial"
                      value={
                        z.usoResidencialPermitido === true
                          ? '✅ Permitido'
                          : z.usoResidencialPermitido === false
                          ? '❌ Proibido'
                          : null
                      }
                    />
                    <MRow
                      label="Uso comercial"
                      value={
                        z.usoComercialPermitido === true
                          ? '✅ Permitido'
                          : z.usoComercialPermitido === false
                          ? '❌ Proibido'
                          : null
                      }
                    />
                    {z.observacoes && (
                      <p className="col-span-2 text-gray-500 italic border-t pt-1.5 mt-0.5">
                        {z.observacoes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Outorga onerosa */}
      {ins.outorgaOnerosa && (
        <section className={`rounded-lg p-3 border ${ins.outorgaOnerosa.prevista ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
          <h3 className="font-bold text-amber-800 mb-1">Outorga Onerosa</h3>
          <p className={`font-medium ${ins.outorgaOnerosa.prevista ? 'text-amber-700' : 'text-gray-500'}`}>
            {ins.outorgaOnerosa.prevista ? '⚠️ Prevista no plano' : 'Não mencionada'}
          </p>
          {ins.outorgaOnerosa.coeficienteMaximoOutorga != null && (
            <p className="text-amber-600 mt-0.5">CA máximo com outorga: {ins.outorgaOnerosa.coeficienteMaximoOutorga}</p>
          )}
          {ins.outorgaOnerosa.descricao && (
            <p className="text-amber-700 mt-1">{ins.outorgaOnerosa.descricao}</p>
          )}
        </section>
      )}

      {/* Zonas especiais */}
      {ins.zonasEspeciais?.length > 0 && (
        <section>
          <h3 className="font-bold text-gray-700 mb-1.5">Zonas Especiais</h3>
          <div className="space-y-1">
            {ins.zonasEspeciais.map((z, i) => (
              <div key={i} className="bg-green-50 border border-green-100 rounded p-2">
                <span className="font-bold text-green-800">{z.sigla || z.tipo}</span>
                {z.sigla && z.tipo !== z.sigla && (
                  <span className="text-green-600 ml-1 text-[11px]">({z.tipo})</span>
                )}
                <span className="text-green-700 ml-1">{z.descricao}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Restrições ambientais */}
      {ins.restricoesAmbientais?.length > 0 && (
        <section>
          <h3 className="font-bold text-gray-700 mb-1.5">Restrições Ambientais</h3>
          <ul className="space-y-1">
            {ins.restricoesAmbientais.map((r, i) => (
              <li key={i} className="bg-red-50 border border-red-100 rounded p-2 text-red-800">
                🌿 {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pontos de atenção */}
      {ins.pontosDeAtencao?.length > 0 && (
        <section>
          <h3 className="font-bold text-gray-700 mb-1.5">Pontos de Atenção</h3>
          <ul className="space-y-1">
            {ins.pontosDeAtencao.map((p, i) => (
              <li key={i} className="bg-orange-50 border border-orange-100 rounded p-2 text-orange-800">
                ⚠️ {p}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MRow({ label, value }) {
  if (value == null) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LOCALITY FORM MODAL
// ═════════════════════════════════════════════════════════════════════════════
function LocalityFormModal({ locality, onSave, onClose }) {
  const [form, setForm] = useState({ planoDiretorInsights: null, ...locality });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({
        ...f,
        planoDiretorFileName: file.name,
        planoDiretorDataUrl: reader.result,
        planoDiretorInsights: null, // reset when new file
      }));
    };
    reader.readAsDataURL(file);
  };

  const clearDoc = () => {
    setForm((f) => ({
      ...f,
      planoDiretorFileName: null,
      planoDiretorDataUrl: null,
      planoDiretorInsights: null,
    }));
  };

  return (
    <Modal title={locality.name ? 'Editar Localidade' : 'Nova Localidade'} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-gray-600">Nome</span>
          <input
            className="w-full border rounded px-3 py-1.5 text-sm mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Estado (sigla, ex: CE, SP)</span>
          <input
            className="w-full border rounded px-3 py-1.5 text-sm mt-1"
            maxLength={2}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
          />
        </label>
        <div>
          <span className="text-xs text-gray-600 block mb-1">PDF — Plano Diretor</span>
          {form.planoDiretorFileName ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded truncate max-w-[300px]">
                📄 {form.planoDiretorFileName}
              </span>
              <button onClick={clearDoc} className="text-red-500 text-xs hover:underline shrink-0">
                Remover
              </button>
            </div>
          ) : (
            <input type="file" accept=".pdf" onChange={handleFile} className="text-sm" />
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            O PDF é armazenado localmente no navegador (base64). Recomeda-se PDFs até ~10 MB.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || !form.state.trim()}
            className="px-4 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}
