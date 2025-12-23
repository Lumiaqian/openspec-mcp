import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { kanbanApi, KanbanData, KanbanCard, KanbanColumn as KanbanColumnType } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';

export default function Kanban() {
  const { lastMessage } = useWebSocket();
  const [kanbanData, setKanbanData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<KanbanCard | null>(null);
  const [movingCard, setMovingCard] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await kanbanApi.get();
      setKanbanData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load kanban');
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Listen for WebSocket events to refresh
  useEffect(() => {
    if (!lastMessage) return;
    const { event } = lastMessage;
    
    if ([
      'kanban:updated', 'change:archived', 'tasks:updated',
      'approval:requested', 'approval:approved', 'approval:rejected'
    ].includes(event)) {
      fetchData();
    }
  }, [lastMessage, fetchData]);

  const handleDragStart = (card: KanbanCard) => {
    setDraggedCard(card);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (targetColumn: string) => {
    setDragOverColumn(null);
    if (!draggedCard || draggedCard.column === targetColumn) {
      setDraggedCard(null);
      return;
    }

    // Optimistic update
    setMovingCard(draggedCard.id);
    
    try {
      await kanbanApi.moveCard(draggedCard.id, targetColumn);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move card');
      // 3秒后清除错误
      setTimeout(() => setError(null), 5000);
    } finally {
      setDraggedCard(null);
      setMovingCard(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-t-2 border-indigo-100 opacity-30 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error && !kanbanData) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
          <ExclamationIcon className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load Kanban</h3>
        <p className="text-gray-500 mb-4">{error}</p>
        <button
          onClick={() => fetchData()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <span className="text-3xl">📋</span>
            Kanban Board
          </h2>
          <p className="mt-1 text-gray-500">
            Drag and drop cards to update status • {kanbanData?.summary.total || 0} total changes
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-sm transition-all hover:shadow"
          >
            <RefreshIcon className="w-4 h-4 inline mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start animate-fade-in">
          <ExclamationIcon className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Kanban Board - Horizontal Scroll */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4" style={{ scrollBehavior: 'smooth' }}>
        {kanbanData?.columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            onDragStart={handleDragStart}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(column.id)}
            isDragOver={dragOverColumn === column.id && draggedCard?.column !== column.id}
            movingCardId={movingCard}
          />
        ))}
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Summary</h3>
        <div className="flex flex-wrap gap-4">
          {kanbanData?.columns.map((col) => (
            <div key={col.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
              <span className="text-sm text-gray-600">{col.title}</span>
              <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full">
                {col.cards.length}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  movingCardId,
}: {
  column: KanbanColumnType;
  onDragStart: (card: KanbanCard) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  isDragOver: boolean;
  movingCardId: string | null;
}) {
  return (
    <div
      className={`flex-shrink-0 w-80 rounded-xl p-4 transition-all duration-200 ${
        isDragOver 
          ? 'bg-indigo-50 ring-2 ring-indigo-300 ring-offset-2' 
          : 'bg-gradient-to-b from-gray-50 to-gray-100/50'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div
            className="w-3.5 h-3.5 rounded-full shadow-sm"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="font-semibold text-gray-900">{column.title}</h3>
        </div>
        <span className="px-2.5 py-1 text-xs font-bold bg-white text-gray-600 rounded-full shadow-sm border border-gray-100">
          {column.cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-3 min-h-[280px]">
        {column.cards.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl text-gray-400 text-sm transition-colors ${
            isDragOver ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
          }`}>
            <EmptyIcon className="w-8 h-8 mb-2 opacity-50" />
            <span>Drop here</span>
          </div>
        ) : (
          column.cards.map((card) => (
            <KanbanCardComponent
              key={card.id}
              card={card}
              onDragStart={onDragStart}
              isMoving={movingCardId === card.id}
              columnColor={column.color}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCardComponent({
  card,
  onDragStart,
  isMoving,
  columnColor,
}: {
  card: KanbanCard;
  onDragStart: (card: KanbanCard) => void;
  isMoving: boolean;
  columnColor: string;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(card)}
      className={`group bg-white rounded-xl p-4 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing transition-all duration-200 ${
        isMoving 
          ? 'opacity-50 scale-95 animate-pulse' 
          : 'hover:shadow-lg hover:-translate-y-0.5 hover:border-gray-200'
      }`}
      style={{ borderLeftWidth: '3px', borderLeftColor: columnColor }}
    >
      <Link to={`/changes/${card.id}`} className="block space-y-3">
        {/* Title */}
        <h4 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
          {card.name}
        </h4>

        {/* Labels */}
        {card.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {card.labels.map((label) => (
              <span
                key={label}
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  label === 'complete'
                    ? 'bg-green-100 text-green-700 ring-1 ring-green-200'
                    : label === 'has-tasks'
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {label === 'complete' && '✓ '}
                {label === 'has-tasks' && '📋 '}
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 font-medium">Progress</span>
            <span className={`font-bold ${card.progress === 100 ? 'text-green-600' : 'text-gray-700'}`}>
              {card.progress}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                card.progress === 100 
                  ? 'bg-gradient-to-r from-green-400 to-green-500' 
                  : card.progress >= 50
                  ? 'bg-gradient-to-r from-blue-400 to-indigo-500'
                  : 'bg-gradient-to-r from-gray-300 to-gray-400'
              }`}
              style={{ width: `${card.progress}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded truncate max-w-[140px]">
            {card.id}
          </span>
          <ArrowRightIcon className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
        </div>
      </Link>
    </div>
  );
}

// Icons
function RefreshIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function ExclamationIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function EmptyIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9l6 6" />
      <path d="M15 9l-6 6" />
    </svg>
  );
}

function ArrowRightIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
