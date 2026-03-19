const PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'localities', label: 'Localidades' },
  { key: 'questions', label: 'Perguntas' },
  { key: 'steps', label: 'Etapas' },
  { key: 'templates', label: 'Templates' },
  { key: 'simulations', label: 'Simulações' },
];

export default function Navbar({ currentPage, onNavigate }) {
  return (
    <nav className="bg-gray-900 text-white flex items-center gap-1 px-4 py-2 shadow-lg">
      <span className="font-bold text-lg mr-6 tracking-tight text-amber-400">Victa Legalização</span>
      {PAGES.map((p) => (
        <button
          key={p.key}
          onClick={() => onNavigate(p.key)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition
            ${currentPage === p.key ? 'bg-amber-500 text-gray-900' : 'hover:bg-gray-700'}`}
        >
          {p.label}
        </button>
      ))}
    </nav>
  );
}
