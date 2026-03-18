import { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import LocalitiesPage from './pages/LocalitiesPage';
import QuestionsPage from './pages/QuestionsPage';
import StepsPage from './pages/StepsPage';
import TemplatesPage from './pages/TemplatesPage';
import SimulationsPage from './pages/SimulationsPage';
import SimulationBoardPage from './pages/SimulationBoardPage';
import { INITIAL_STATE } from './data';

const STORAGE_KEY = 'victa_hibrido_v3';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt data */ }
  return null;
}

export default function App() {
  const [state, setState] = useState(() => loadState() || structuredClone(INITIAL_STATE));
  const [currentPage, setCurrentPage] = useState('simulations');
  const [activeSim, setActiveSim] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback((partial) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const openBoard = useCallback((simId) => {
    setActiveSim(simId);
    setCurrentPage('board');
  }, []);

  const navigate = useCallback((page) => {
    if (page !== 'board') setActiveSim(null);
    setCurrentPage(page);
  }, []);

  const resetData = useCallback(() => {
    setState(structuredClone(INITIAL_STATE));
  }, []);

  const pageProps = { state, update, navigate, openBoard };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar currentPage={currentPage} onNavigate={navigate} />
      <main className="flex-1 overflow-auto">
        {currentPage === 'localities' && <LocalitiesPage {...pageProps} />}
        {currentPage === 'questions' && <QuestionsPage {...pageProps} />}
        {currentPage === 'steps' && <StepsPage {...pageProps} />}
        {currentPage === 'templates' && <TemplatesPage {...pageProps} />}
        {currentPage === 'simulations' && <SimulationsPage {...pageProps} />}
        {currentPage === 'board' && activeSim && (
          <SimulationBoardPage {...pageProps} simulationId={activeSim} />
        )}
      </main>
      <footer className="bg-gray-900 text-gray-500 text-xs text-center py-2">
        Victa Legalizacao - POC |
        <button onClick={resetData} className="underline hover:text-gray-300 ml-1">Resetar dados</button>
      </footer>
    </div>
  );
}
