import { useState, useEffect } from 'react';
import { approvalsApi } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ApprovalQueue() {
  const { lastMessage } = useWebSocket();
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject' | null;
    changeId: string;
  }>({ type: null, changeId: '' });
  const [actionInput, setActionInput] = useState({ name: '', comment: '' });

  async function fetchApprovals() {
    try {
      const res = showAll
        ? await approvalsApi.list()
        : await approvalsApi.listPending();
      setApprovals(res.approvals);
    } catch (error) {
      console.error('Failed to fetch approvals:', error);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchApprovals().finally(() => setLoading(false));
  }, [showAll]);

  // Listen for WebSocket events to refresh approvals
  useEffect(() => {
    if (!lastMessage) return;
    const { event } = lastMessage;
    
    if (['approval:requested', 'approval:approved', 'approval:rejected'].includes(event)) {
      fetchApprovals();
    }
  }, [lastMessage]);

  const handleApprove = async () => {
    if (!actionInput.name) return;

    try {
      await approvalsApi.approve(
        actionModal.changeId,
        actionInput.name,
        actionInput.comment || undefined
      );
      setActionModal({ type: null, changeId: '' });
      setActionInput({ name: '', comment: '' });
      fetchApprovals();
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleReject = async () => {
    if (!actionInput.name || !actionInput.comment) return;

    try {
      await approvalsApi.reject(actionModal.changeId, actionInput.name, actionInput.comment);
      setActionModal({ type: null, changeId: '' });
      setActionInput({ name: '', comment: '' });
      fetchApprovals();
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'status-draft',
      pending_approval: 'status-pending',
      approved: 'status-approved',
      rejected: 'status-rejected',
      implementing: 'status-implementing',
      completed: 'status-completed',
    };
    return colors[status] || 'status-draft';
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
        <h2 className="text-2xl font-bold text-gray-900">Approval Queue</h2>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>Show all</span>
        </label>
      </div>

      {approvals.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {showAll ? 'No approval records found.' : 'No pending approvals.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Requested
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {approvals.map((approval) => (
                <tr key={approval.changeId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{approval.changeId}</div>
                    {approval.requestedBy && (
                      <div className="text-sm text-gray-500">by {approval.requestedBy}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`status-badge ${getStatusColor(approval.status)}`}>
                      {approval.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {approval.requestedAt
                      ? new Date(approval.requestedAt).toLocaleString()
                      : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {approval.status === 'pending_approval' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() =>
                            setActionModal({ type: 'approve', changeId: approval.changeId })
                          }
                          className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            setActionModal({ type: 'reject', changeId: approval.changeId })
                          }
                          className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action Modal */}
      {actionModal.type && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {actionModal.type === 'approve' ? 'Approve Change' : 'Reject Change'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  value={actionInput.name}
                  onChange={(e) => setActionInput({ ...actionInput, name: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {actionModal.type === 'approve' ? 'Comment (optional)' : 'Reason (required)'}
                </label>
                <textarea
                  value={actionInput.comment}
                  onChange={(e) => setActionInput({ ...actionInput, comment: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
                  rows={3}
                  placeholder={
                    actionModal.type === 'approve'
                      ? 'Optional comment...'
                      : 'Explain why this is rejected...'
                  }
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setActionModal({ type: null, changeId: '' });
                  setActionInput({ name: '', comment: '' });
                }}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={actionModal.type === 'approve' ? handleApprove : handleReject}
                className={`px-4 py-2 text-white rounded-md ${
                  actionModal.type === 'approve'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {actionModal.type === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
