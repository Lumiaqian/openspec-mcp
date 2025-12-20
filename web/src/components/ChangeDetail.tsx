import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { changesApi, tasksApi } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';

interface Review {
  id: string;
  targetType: string;
  type: 'comment' | 'suggestion' | 'question' | 'issue';
  severity?: 'low' | 'medium' | 'high';
  body: string;
  lineNumber?: number;
  author: string;
  status: 'open' | 'resolved' | 'wont_fix';
  createdAt: string;
  replies: any[];
}

interface ReviewSummary {
  total: number;
  open: number;
  resolved: number;
  wontFix: number;
  hasBlockingIssues: boolean;
}

const typeIcons: Record<Review['type'], string> = {
  comment: '💬',
  suggestion: '💡',
  question: '❓',
  issue: '🚨',
};

const severityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

export default function ChangeDetail() {
  const { id } = useParams<{ id: string }>();
  const { lastMessage } = useWebSocket();
  const [change, setChange] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'proposal' | 'tasks' | 'design'>('proposal');
  const [showResolved, setShowResolved] = useState(false);
  
  // Reviews state
  const [reviews, setReviews] = useState<{
    proposal: Review[];
    design: Review[];
    tasks: Review[];
    summary: ReviewSummary | null;
  }>({ proposal: [], design: [], tasks: [], summary: null });

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      if (!id) return;

      try {
        const [changeRes, tasksRes, reviewsRes] = await Promise.all([
          changesApi.get(id),
          tasksApi.get(id),
          changesApi.getReviews(id),
        ]);

        setChange(changeRes.change);
        setTasks(tasksRes.tasks);
        setProgress(tasksRes.progress);
        setReviews(reviewsRes);
      } catch (error) {
        console.error('Failed to fetch change:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  // Listen for WebSocket events to update reviews in real-time
  useEffect(() => {
    if (!lastMessage || !id) return;

    const { event, data } = lastMessage;
    
    // Handle review:added event (from REST API)
    if (event === 'review:added' && data.changeId === id) {
      const targetType = data.targetType as 'proposal' | 'design' | 'tasks';
      if (targetType && data.review) {
        setReviews(prev => ({
          ...prev,
          [targetType]: [...prev[targetType], data.review],
        }));
      }
    }
    
    // Handle review:resolved event
    if (event === 'review:resolved' && data.changeId === id) {
      const targetType = data.targetType as 'proposal' | 'design' | 'tasks';
      if (targetType && data.reviewId) {
        setReviews(prev => ({
          ...prev,
          [targetType]: prev[targetType].map(r =>
            r.id === data.reviewId ? { ...r, status: data.status || 'resolved' } : r
          ),
        }));
      }
    }
    
    // Handle reviews:updated event (from file watcher - MCP tool changes)
    if (event === 'reviews:updated' && data.changeId === id) {
      // Re-fetch all reviews when file changes
      changesApi.getReviews(id).then(reviewsRes => {
        setReviews(reviewsRes);
      }).catch(err => {
        console.error('Failed to refresh reviews:', err);
      });
    }
  }, [lastMessage, id]);

  const handleTaskUpdate = async (taskId: string, status: string) => {
    if (!id) return;

    try {
      await tasksApi.update(id, taskId, status);
      const tasksRes = await tasksApi.get(id);
      setTasks(tasksRes.tasks);
      setProgress(tasksRes.progress);
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleResolveReview = async (reviewId: string, targetType: 'proposal' | 'design' | 'tasks') => {
    if (!id) return;
    try {
      await changesApi.resolveReview(id, reviewId, targetType);
      // Update local state
      setReviews(prev => ({
        ...prev,
        [targetType]: prev[targetType].map(r =>
          r.id === reviewId ? { ...r, status: 'resolved' as const } : r
        ),
      }));
    } catch (error) {
      console.error('Failed to resolve review:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!change) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Change not found</h2>
        <Link to="/changes" className="text-blue-500 hover:text-blue-700 mt-2 inline-block">
          ← Back to changes
        </Link>
      </div>
    );
  }

  // Get reviews for current tab
  const openReviews = reviews[activeTab].filter(r => r.status === 'open');
  const resolvedReviews = reviews[activeTab].filter(r => r.status !== 'open');
  const currentReviews = showResolved ? resolvedReviews : openReviews;
  const hasBlockingIssues = reviews.summary?.hasBlockingIssues || false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Link to="/changes" className="text-blue-500 hover:text-blue-700 text-sm">
            ← Back to changes
          </Link>
          <h2 className="text-2xl font-bold text-gray-900 mt-2">{change.title}</h2>
          <p className="text-gray-500">{change.id}</p>
        </div>
        <div className="flex items-center space-x-2">
          {hasBlockingIssues && (
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
              🚨 Blocking Issues
            </span>
          )}
          {reviews.summary && reviews.summary.open > 0 && (
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
              {reviews.summary.open} open reviews
            </span>
          )}
          <span
            className={`status-badge ${
              change.status === 'active' ? 'status-implementing' : 'status-completed'
            }`}
          >
            {change.status}
          </span>
        </div>
      </div>

      {/* Progress */}
      {progress && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm text-gray-500">
              {progress.completed}/{progress.total} tasks ({progress.percentage}%)
            </span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>✅ {progress.completed} done</span>
            <span>🔄 {progress.inProgress} in progress</span>
            <span>⏳ {progress.pending} pending</span>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tabs and content - 3 columns */}
        <div className="lg:col-span-3">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              {(['proposal', 'tasks', 'design'] as const).map((tab) => {
                const tabReviews = reviews[tab].filter(r => r.status === 'open');
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                      activeTab === tab
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tabReviews.length > 0 && (
                      <span className="ml-2 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs">
                        {tabReviews.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg shadow mt-4">
            {activeTab === 'proposal' && (
              <div className="p-6 prose prose-sm max-w-none">
                {change.proposal ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {change.proposal}
                  </ReactMarkdown>
                ) : (
                  <p className="text-gray-500">No proposal content.</p>
                )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="p-6">
                {tasks.length === 0 ? (
                  <p className="text-gray-500">No tasks defined.</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-3 rounded border hover:bg-gray-50"
                      >
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => {
                              const nextStatus =
                                task.status === 'pending'
                                  ? 'in_progress'
                                  : task.status === 'in_progress'
                                  ? 'done'
                                  : 'pending';
                              handleTaskUpdate(task.id, nextStatus);
                            }}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              task.status === 'done'
                                ? 'bg-green-500 border-green-500 text-white'
                                : task.status === 'in_progress'
                                ? 'bg-blue-500 border-blue-500 text-white'
                                : 'border-gray-300'
                            }`}
                          >
                            {task.status === 'done' && '✓'}
                            {task.status === 'in_progress' && '●'}
                          </button>
                          <div>
                            <span className="font-mono text-sm text-gray-500">[{task.id}]</span>
                            <span className="ml-2">{task.title}</span>
                          </div>
                        </div>
                        <span
                          className={`text-xs ${
                            task.status === 'done'
                              ? 'text-green-600'
                              : task.status === 'in_progress'
                              ? 'text-blue-600'
                              : 'text-gray-400'
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'design' && (
              <div className="p-6 prose prose-sm max-w-none">
                {change.design ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {change.design}
                  </ReactMarkdown>
                ) : (
                  <p className="text-gray-500">No design document.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Reviews sidebar - 1 column */}
        <div className="lg:col-span-1 h-[calc(100vh-200px)]">
          <div className="bg-white rounded-lg shadow h-full flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700 mb-2">
                Reviews <span className="text-xs text-gray-400">for {activeTab}</span>
              </h3>
              {/* Tab buttons */}
              <div className="flex space-x-1">
                <button
                  onClick={() => setShowResolved(false)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    !showResolved
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Open ({openReviews.length})
                </button>
                <button
                  onClick={() => setShowResolved(true)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    showResolved
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Resolved ({resolvedReviews.length})
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
              {currentReviews.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">
                    {showResolved ? 'No resolved reviews' : 'No open reviews'}
                  </p>
                  {!showResolved && (
                    <p className="text-xs text-gray-400 mt-1">
                      Use <code className="bg-gray-100 px-1 rounded">openspec_add_review</code>
                    </p>
                  )}
                </div>
              ) : (
                currentReviews.map((review) => (
                  <div
                    key={review.id}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-200 group hover:border-blue-300 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-1">
                        <span className="text-lg">{typeIcons[review.type]}</span>
                        {review.severity && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${severityColors[review.severity]}`}>
                            {review.severity}
                          </span>
                        )}
                        {review.lineNumber && (
                          <span className="text-xs text-gray-400">L{review.lineNumber}</span>
                        )}
                      </div>
                      {/* Only show resolve button for open reviews */}
                      {review.status === 'open' ? (
                        <button
                          onClick={() => handleResolveReview(review.id, activeTab)}
                          className="text-green-500 hover:text-green-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Resolve"
                        >
                          ✓
                        </button>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          review.status === 'resolved' 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {review.status === 'resolved' ? '✓ resolved' : '⏭️ won\'t fix'}
                        </span>
                      )}
                    </div>
                    <div className="prose prose-xs max-w-none text-gray-700">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {review.body}
                      </ReactMarkdown>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      by {review.author} • {new Date(review.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
