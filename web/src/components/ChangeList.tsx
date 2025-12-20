import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { changesApi } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ChangeList() {
  const { lastMessage } = useWebSocket();
  const [changes, setChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);

  const fetchChanges = async () => {
    try {
      const res = await changesApi.list(includeArchived);
      setChanges(res.changes);
    } catch (error) {
      console.error('Failed to fetch changes:', error);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchChanges().finally(() => setLoading(false));
  }, [includeArchived]);

  // Listen for WebSocket events to refresh list
  useEffect(() => {
    if (!lastMessage) return;
    const { event } = lastMessage;
    
    // Refresh list when changes are archived or tasks updated
    if (['change:archived', 'tasks:updated', 'task:updated', 'change:content_updated'].includes(event)) {
      fetchChanges();
    }
  }, [lastMessage]);

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
        <h2 className="text-2xl font-bold text-gray-900">Changes</h2>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>Include archived</span>
        </label>
      </div>

      {changes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No changes found.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {changes.map((change) => (
                <tr key={change.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      to={`/changes/${change.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <div className="font-medium">{change.title}</div>
                      <div className="text-sm text-gray-500">{change.id}</div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`status-badge ${
                        change.status === 'active' ? 'status-implementing' : 'status-completed'
                      }`}
                    >
                      {change.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-24 h-2 bg-gray-200 rounded-full">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${
                              change.tasksTotal > 0
                                ? (change.tasksCompleted / change.tasksTotal) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-600">
                        {change.tasksCompleted}/{change.tasksTotal}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(change.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
