import { Handle, Position } from 'reactflow';
import { memo } from 'react';
import { fmt, fmtCurrency } from '../engine';

const VARIANT_COLORS = {
  milestone: { bg: 'bg-yellow-100', border: 'border-yellow-400', ring: 'ring-yellow-300' },
  fixed:     { bg: 'bg-blue-50',    border: 'border-blue-300',   ring: 'ring-blue-200' },
  completed: { bg: 'bg-green-100',  border: 'border-green-400',  ring: 'ring-green-300' },
};

function CustomNode({ data }) {
  const variant = data.completed ? 'completed' : (data.duracao === 0 ? 'milestone' : 'fixed');
  const colors = VARIANT_COLORS[variant];
  const critical = data.isCritical;

  return (
    <div
      className={`rounded-lg border-2 px-3 py-2 min-w-[180px] shadow-md transition-all
        ${colors.bg} ${colors.border}
        ${critical ? 'ring-2 ring-red-400 border-red-500' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-500 !w-2.5 !h-2.5" />
      <div className="font-semibold text-xs text-gray-800 mb-1 truncate">{data.label}</div>
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        <span>⏱ {fmt(data.duracao)}</span>
        {data.cost > 0 && <span>💰 {fmtCurrency(data.cost)}</span>}
      </div>
      {(data.predictedTime != null || data.statsPredicted != null) && (
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
          {data.predictedTime != null && <span>📋 {data.predictedTime}m</span>}
          {data.statsPredicted != null && <span>📊 {data.statsPredicted}m</span>}
        </div>
      )}
      {data.completed && (
        <div className="mt-1 text-[10px] font-medium text-green-700">✔ Concluída</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-500 !w-2.5 !h-2.5" />
    </div>
  );
}

export default memo(CustomNode);
