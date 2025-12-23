import { useState, useEffect, useCallback } from 'react';
import { contextApi, ProjectContext } from '../api/client';

export default function ProjectContextView() {
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchContext = useCallback(async (refresh = false) => {
    try {
      if (refresh) setAnalyzing(true);
      const data = await contextApi.analyze(refresh);
      setContext(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze context');
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (error && !context) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
          <ExclamationIcon className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to analyze project</h3>
        <p className="text-gray-500 mb-4">{error}</p>
        <button
          onClick={() => fetchContext()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!context) return null;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <span className="text-3xl">🔍</span>
            Project Context
          </h2>
          <p className="mt-1 text-gray-500">
            AI's understanding of your project structure and tech stack
          </p>
        </div>
        <button
          onClick={() => fetchContext(true)}
          disabled={analyzing}
          className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-all ${
            analyzing
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:shadow'
          }`}
        >
          {analyzing ? (
            <>
              <RefreshIcon className="w-4 h-4 inline mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshIcon className="w-4 h-4 inline mr-2" />
              Re-analyze
            </>
          )}
        </button>
      </div>

      {/* Project Info */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold">{context.projectName}</h3>
            <p className="text-indigo-100 mt-1 text-sm font-mono opacity-80">{context.projectRoot}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-indigo-100">Analyzed</p>
            <p className="text-lg font-semibold">{new Date(context.analyzedAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Language Distribution */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span> Language Distribution
          </h3>
          <div className="space-y-3">
            {context.stack.languages.slice(0, 6).map((lang) => (
              <div key={lang.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{lang.name}</span>
                  <span className="text-gray-500">{lang.percentage}% • {lang.fileCount} files</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500"
                    style={{ width: `${lang.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Stack */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>🛠️</span> Tech Stack
          </h3>
          <div className="space-y-4">
            <InfoRow label="Frameworks" value={context.stack.frameworks.join(', ') || 'None detected'} />
            <InfoRow label="Build Tools" value={context.stack.buildTools.join(', ') || 'None detected'} />
            <InfoRow label="Package Manager" value={context.stack.packageManager} />
            <InfoRow label="Test Framework" value={context.stack.testFramework || 'None detected'} />
          </div>
        </div>

        {/* Directory Structure */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>📁</span> Directory Structure
          </h3>
          <div className="space-y-2">
            {context.structure.mainDirectories.slice(0, 8).map((dir) => (
              <div key={dir.path} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <FolderIcon className="w-4 h-4 text-blue-500" />
                  <span className="font-mono text-sm text-gray-700">{dir.name}/</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{dir.purpose}</span>
                  <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{dir.fileCount} files</span>
                </div>
              </div>
            ))}
          </div>
          {context.structure.entryPoints.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                <strong>Entry Points:</strong> {context.structure.entryPoints.map(e => `\`${e}\``).join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Patterns & Stats */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>🧩</span> Patterns & Stats
          </h3>
          <div className="space-y-4">
            <InfoRow label="Architecture" value={context.patterns.architecture} />
            <InfoRow label="Code Style" value={context.patterns.codeStyle.join(', ') || 'Not configured'} />
            <InfoRow label="Conventions" value={context.patterns.conventions.join(', ') || 'None'} />
            <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-indigo-50 rounded-lg">
                <p className="text-2xl font-bold text-indigo-600">{context.stats.totalFiles.toLocaleString()}</p>
                <p className="text-xs text-indigo-500">Total Files</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{context.stats.totalLines.toLocaleString()}</p>
                <p className="text-xs text-purple-500">Est. Lines</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{value}</span>
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

function FolderIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
