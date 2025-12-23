import { useState, useEffect } from 'react';
import { qaApi, QAResult, QASummary } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';

export default function QADashboard() {
  const { lastMessage } = useWebSocket();
  const [summary, setSummary] = useState<QASummary | null>(null);
  const [activeChange, setActiveChange] = useState<string | null>(null);
  const [history, setHistory] = useState<QAResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  // Fetch initial data
  useEffect(() => {
    fetchSummary();
  }, []);

  // Fetch history when active change changes
  useEffect(() => {
    if (activeChange) {
      fetchHistory(activeChange);
    } else {
      setHistory([]);
    }
  }, [activeChange]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!lastMessage) return;

    const { event, data } = lastMessage;
    
    // Refresh summary on any QA event
    if (event.startsWith('qa:')) {
      fetchSummary();
      
      // If the event relates to the active change, refresh history
      if (activeChange && data.changeName && data.changeName === activeChange) {
        fetchHistory(activeChange);
      }
    }
  }, [lastMessage, activeChange]);

  const fetchSummary = async () => {
    try {
      const data = await qaApi.getSummary();
      setSummary(data);
    } catch (error) {
      console.error('Failed to fetch QA summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (changeName: string) => {
    try {
      const data = await qaApi.getHistory(changeName);
      setHistory(data.history);
    } catch (error) {
      console.error(`Failed to fetch history for ${changeName}:`, error);
    }
  };

  const handleRunQA = async (changeName: string) => {
    if (processing[changeName]) return;
    
    setProcessing(prev => ({ ...prev, [changeName]: true }));
    try {
      await qaApi.run(changeName);
      // Optimistic update or wait for websocket
    } catch (error) {
      console.error(`Failed to run QA for ${changeName}:`, error);
      alert('Failed to start QA check');
    } finally {
      setProcessing(prev => ({ ...prev, [changeName]: false }));
    }
  };

  const handleStopQA = async (changeName: string) => {
    if (processing[changeName]) return;
    
    setProcessing(prev => ({ ...prev, [changeName]: true }));
    try {
      await qaApi.stop(changeName);
    } catch (error) {
      console.error(`Failed to stop QA for ${changeName}:`, error);
      alert('Failed to stop QA check');
    } finally {
      setProcessing(prev => ({ ...prev, [changeName]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">QA Dashboard</h2>
          <p className="text-gray-500">Monitor and run quality checks for your changes</p>
        </div>
        <div className="flex space-x-4 text-sm">
          <div className="px-3 py-1 bg-white rounded shadow border border-gray-200">
            <span className="font-semibold text-gray-700">Running: </span>
            <span className="text-blue-600">{summary?.running || 0}</span>
          </div>
          <div className="px-3 py-1 bg-white rounded shadow border border-gray-200">
            <span className="font-semibold text-gray-700">Total Runs: </span>
            <span className="text-gray-900">{summary?.total || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Change List */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Changes</h3>
          </div>
          <div className="divide-y divide-gray-200 max-h-[calc(100vh-250px)] overflow-y-auto">
            {summary?.changes.map((change) => (
              <div
                key={change.name}
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                  activeChange === change.name ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                }`}
                onClick={() => setActiveChange(change.name)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900 truncate pr-2" title={change.name}>
                    {change.name}
                  </h4>
                  {change.status.isRunning ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 animate-pulse">
                      Running
                    </span>
                  ) : change.lastRun ? (
                    <span className="text-xs text-gray-500">
                      {new Date(change.lastRun).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Never run</span>
                  )}
                </div>
                
                {change.status.isRunning ? (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{change.status.currentCheck || 'Preparing...'}</span>
                      <span>
                        {change.status.progress?.completed}/{change.status.progress?.total}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ 
                          width: `${((change.status.progress?.completed || 0) / (change.status.progress?.total || 1)) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center mt-2">
                     <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunQA(change.name);
                        }}
                        disabled={processing[change.name]}
                        className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50"
                      >
                        Run Check
                      </button>
                  </div>
                )}
              </div>
            ))}
            
            {(!summary?.changes || summary.changes.length === 0) && (
              <div className="p-8 text-center text-gray-500">
                No changes found
              </div>
            )}
          </div>
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2 space-y-6">
          {activeChange ? (
            <>
              {/* Active Run Status (if running) */}
              {summary?.changes.find(c => c.name === activeChange)?.status.isRunning && (
                <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Running QA Check</h3>
                      <p className="text-sm text-gray-500">Executing tests for {activeChange}</p>
                    </div>
                    <button
                      onClick={() => handleStopQA(activeChange)}
                      disabled={processing[activeChange]}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium disabled:opacity-50"
                    >
                      Stop Execution
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Overall Progress */}
                    {/* (This could be expanded with more details from status) */}
                  </div>
                </div>
              )}

              {/* History List */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">Run History</h3>
                  <button 
                    onClick={() => handleRunQA(activeChange)}
                    disabled={summary?.changes.find(c => c.name === activeChange)?.status.isRunning || processing[activeChange]}
                    className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400"
                  >
                    Start New Run
                  </button>
                </div>
                
                <div className="divide-y divide-gray-200">
                  {history.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      No history available for this change
                    </div>
                  ) : (
                    history.map((run) => (
                      <div key={run.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center space-x-3">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              run.failed > 0 ? 'bg-red-500' : 'bg-green-500'
                            }`} />
                            <span className="font-mono text-sm text-gray-600">
                              {new Date(run.startedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-sm space-x-3">
                            <span className="text-green-600">{run.passed} passed</span>
                            <span className="text-red-600">{run.failed} failed</span>
                            <span className="text-gray-400">{run.skipped} skipped</span>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          {run.checks.map((check, idx) => (
                            <div key={idx} className="flex items-center text-sm border rounded p-2 bg-gray-50">
                              <div className={`w-20 font-medium ${
                                check.status === 'passed' ? 'text-green-600' :
                                check.status === 'failed' ? 'text-red-600' :
                                'text-gray-500'
                              }`}>
                                {check.type}
                              </div>
                              <div className="flex-1 mx-3 truncate text-gray-600">
                                {check.status === 'failed' && check.errors ? (
                                  <span className="text-red-500">{check.errors[0]}</span>
                                ) : (
                                  <span className="text-gray-400 italic">{check.status}</span>
                                )}
                              </div>
                              <div className="text-gray-400 w-16 text-right">
                                {(check.duration / 1000).toFixed(1)}s
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white rounded-lg shadow min-h-[400px]">
              <div className="text-5xl mb-4">👈</div>
              <p>Select a change to view QA details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
