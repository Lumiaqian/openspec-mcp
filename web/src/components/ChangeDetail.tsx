import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { changesApi, tasksApi } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import CrossServiceDocs from './CrossServiceDocs';

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

interface Revision {
  id: string;
  description: string;
  reason?: string;
  author: string;
  createdAt: string;
  metadata?: {
    type: 'contract' | 'behavior' | 'internal';
    affectedAPI?: string;
    affectedField?: string;
    updateTarget: ('specs' | 'design' | 'delta-specs')[];
    source?: {
      file: string;
      function: string;
    };
  };
}

// Simple icon components
const LinkIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-2.828 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
  </svg>
);

const CodeIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

// Simple icon components

export default function ChangeDetail() {
  const { id } = useParams<{ id: string }>();
  const { lastMessage } = useWebSocket();
  const [change, setChange] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'proposal' | 'tasks' | 'design' | 'specs' | 'cross-service'>('proposal');
  const [showResolved, setShowResolved] = useState(false);
  const [specs, setSpecs] = useState<Array<{ id: string; title: string; content: string }>>([]);
  
  // Reviews state
  const [reviews, setReviews] = useState<{
    proposal: Review[];
    design: Review[];
    tasks: Review[];
    summary: ReviewSummary | null;
  }>({ proposal: [], design: [], tasks: [], summary: null });

  // Revisions state
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      if (!id) return;

      try {
        const [changeRes, tasksRes, reviewsRes, specsRes, revisionsRes] = await Promise.all([
          changesApi.get(id),
          tasksApi.get(id),
          changesApi.getReviews(id),
          changesApi.getSpecs(id),
          changesApi.getRevisions(id),
        ]);

        setChange(changeRes.change);
        setTasks(tasksRes.tasks);
        setProgress(tasksRes.progress);
        setReviews(reviewsRes);
        setSpecs(specsRes.specs);
        setRevisions(revisionsRes.revisions || []);
      } catch (error) {
        console.error('Failed to fetch change:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  // Listen for WebSocket events to update in real-time
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
    
    // Handle revision:added event
    if (event === 'revision:added' && data.changeId === id) {
      if (data.revision) {
        setRevisions(prev => [...prev, data.revision]);
      }
    }
    
    // Handle reviews:updated event (from file watcher - MCP tool changes)
    if (event === 'reviews:updated' && data.changeId === id) {
      changesApi.getReviews(id).then(reviewsRes => {
        setReviews(reviewsRes);
      }).catch(err => {
        console.error('Failed to refresh reviews:', err);
      });
    }
    
    // Handle tasks:updated event (from file watcher - tasks.md changes)
    if (event === 'tasks:updated' && data.changeId === id) {
      tasksApi.get(id).then(tasksRes => {
        setTasks(tasksRes.tasks);
        setProgress(tasksRes.progress);
      }).catch(err => {
        console.error('Failed to refresh tasks:', err);
      });
    }
    
    // Handle task:updated event (from REST API)
    if (event === 'task:updated' && data.changeId === id) {
      setTasks(prev => prev.map(t => 
        t.id === data.taskId ? { ...t, status: data.status } : t
      ));
    }
    
    // Handle change:content_updated event (from file watcher - proposal/design changes)
    if (event === 'change:content_updated' && data.changeId === id) {
      changesApi.get(id).then(changeRes => {
        setChange(changeRes.change);
      }).catch(err => {
        console.error('Failed to refresh change:', err);
      });
    }
    
    // Handle revisions:updated event (from file watcher - revisions.json changes)
    if (event === 'revisions:updated' && data.changeId === id) {
      changesApi.getRevisions(id).then(revisionsRes => {
        setRevisions(revisionsRes.revisions || []);
      }).catch(err => {
        console.error('Failed to refresh revisions:', err);
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

  // Get reviews for current tab (cross-service and specs tabs have no reviews)
  const reviewableTab = (activeTab === 'cross-service' || activeTab === 'specs') ? null : activeTab;
  const tabReviewList = reviewableTab ? reviews[reviewableTab] : [];
  const openReviews = tabReviewList.filter((r: Review) => r.status === 'open');
  const resolvedReviews = tabReviewList.filter((r: Review) => r.status !== 'open');
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
              {/* Specs Tab */}
              <button
                onClick={() => setActiveTab('specs')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === 'specs'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📋 Specs
                {specs.length > 0 && (
                  <span className="ml-2 bg-green-100 text-green-600 px-2 py-0.5 rounded-full text-xs">
                    {specs.length}
                  </span>
                )}
              </button>
              {/* Cross-Service Tab */}
              <button
                onClick={() => setActiveTab('cross-service')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === 'cross-service'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🔗 Cross-Service
              </button>
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

            {activeTab === 'specs' && (
              <div className="p-6">
                {specs.length === 0 ? (
                  <p className="text-gray-500">No specs defined for this change.</p>
                ) : (
                  <div className="space-y-6">
                    {specs.map((spec) => (
                      <div key={spec.id} className="border rounded-lg overflow-hidden">
                        <div className="bg-green-50 px-4 py-2 border-b flex items-center justify-between">
                          <h4 className="font-semibold text-green-800">{spec.title}</h4>
                          <span className="text-xs text-green-600 font-mono">{spec.id}</span>
                        </div>
                        <div className="p-4 prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {spec.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'cross-service' && id && (
              <CrossServiceDocs changeId={id} />
            )}
          </div>
        </div>

        {/* Sidebar - 1 column */}
        <div className="lg:col-span-1 space-y-4">
          {/* Revisions section - at top */}
          {revisions.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-700">
                  📝 Revisions <span className="text-xs text-gray-400">({revisions.length})</span>
                </h3>
              </div>
              <div className="p-4 pr-1">
                <div className="relative border-l border-gray-100 ml-3 space-y-6 pb-2">
                  {revisions.map((rev) => {
                    const type = rev.metadata?.type || 'internal';
                    
                    // Timeline dot colors
                    const dotColorClass = type === 'contract' ? 'bg-blue-500' : 
                                         type === 'behavior' ? 'bg-amber-500' : 'bg-gray-400';
                    
                    const isExpanded = expandedRevisionId === rev.id;
                    
                    return (
                      <div key={rev.id} className="relative pl-6 group">
                        {/* Timeline Dot */}
                        <div 
                          className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ring-1 ring-transparent group-hover:scale-110 transition-transform ${dotColorClass}`} 
                        />
                        
                        {/* Content Container */}
                        <div 
                          className="cursor-pointer"
                          onClick={() => setExpandedRevisionId(isExpanded ? null : rev.id)}
                        >
                          {/* Header: Date & Type */}
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-xs font-semibold text-gray-900">
                              {new Date(rev.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <span className={`text-[10px] uppercase tracking-wider font-medium opacity-60 ${
                              type === 'contract' ? 'text-blue-600' : type === 'behavior' ? 'text-amber-600' : 'text-gray-500'
                            }`}>
                              {type}
                            </span>
                          </div>
                          
                          {/* Description */}
                          <div className={`text-sm text-gray-700 leading-snug hover:text-gray-900 transition-colors ${!isExpanded && 'line-clamp-2'}`}>
                            {rev.description}
                          </div>

                          {/* Quick Metadata Preview (API/File) */}
                          <div className="mt-1.5 flex items-center">
                            {rev.metadata?.affectedAPI ? (
                              <div className="flex items-center text-xs text-gray-500 font-mono truncate hover:text-blue-600 transition-colors" title={rev.metadata.affectedAPI}>
                                <LinkIcon className="w-3 h-3 mr-1.5 flex-shrink-0 opacity-50" />
                                <span className="truncate">{rev.metadata.affectedAPI}</span>
                              </div>
                            ) : rev.metadata?.source && !isExpanded ? (
                              <div className="flex items-center text-[10px] text-gray-400 font-mono">
                                <CodeIcon className="w-3 h-3 mr-1.5 flex-shrink-0 opacity-50" />
                                <span className="truncate">{rev.metadata.source.file.split('/').pop()}</span>
                              </div>
                            ) : null}
                          </div>
                          
                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="mt-2 pt-2 border-t border-dashed border-gray-100 space-y-2 animate-fadeIn bg-gray-50/50 -ml-2 p-2 rounded">
                              {rev.reason && (
                                <div className="text-xs text-gray-500 italic">
                                  {rev.reason}
                                </div>
                              )}
                              
                              {rev.metadata && (
                                <div className="space-y-1 pt-1">
                                  {rev.metadata.updateTarget.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {rev.metadata.updateTarget.map(target => (
                                        <span key={target} className="px-1.5 py-0.5 bg-white border border-gray-100 text-gray-500 text-[10px] rounded shadow-sm">
                                          {target}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {rev.metadata.source && (
                                    <div className="flex items-center text-xs text-gray-400 group-hover:text-gray-500">
                                       <span className="font-mono text-[10px]">{rev.metadata.source.file}:{rev.metadata.source.function}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Reviews section */}
          <div className="bg-white rounded-lg shadow" style={{ maxHeight: revisions.length > 0 ? 'calc(100vh - 400px)' : 'calc(100vh - 200px)' }}>
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
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

            <div className="flex-1 p-4 pr-1 overflow-y-auto">
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
                <div className="relative border-l border-gray-100 ml-3 space-y-6 pb-2">
                  {currentReviews.map((review) => {
                    // Determine dot color based on severity or type
                    let dotColorClass = 'bg-gray-400';
                    if (review.severity === 'high') dotColorClass = 'bg-red-500';
                    else if (review.severity === 'medium') dotColorClass = 'bg-yellow-500';
                    else if (review.type === 'issue') dotColorClass = 'bg-red-400';
                    else if (review.type === 'suggestion') dotColorClass = 'bg-blue-400';
                    else if (review.type === 'question') dotColorClass = 'bg-purple-400';

                    return (
                      <div key={review.id} className="relative pl-6 group">
                        {/* Timeline Dot */}
                        <div 
                          className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ring-1 ring-transparent group-hover:scale-110 transition-transform ${dotColorClass}`} 
                        />

                        {/* Content */}
                        <div>
                          {/* Header */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-semibold text-gray-900">
                                {review.author}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                              {review.lineNumber && (
                                <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1 rounded">
                                  L{review.lineNumber}
                                </span>
                              )}
                            </div>

                            {/* Actions (visible on hover) */}
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                              {review.status === 'open' && reviewableTab && (
                                <button
                                  onClick={() => handleResolveReview(review.id, reviewableTab)}
                                  className="text-[10px] text-green-600 hover:text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 hover:border-green-200"
                                  title="Resolve review"
                                >
                                  Resolve
                                </button>
                              )}
                              {review.status === 'resolved' && (
                                <span className="text-[10px] text-green-600 flex items-center">
                                  ✓ Resolved
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Body */}
                          <div className="prose prose-xs max-w-none text-gray-700 break-words leading-snug prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-code:break-all prose-code:text-xs prose-code:bg-gray-50 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-strong:font-medium">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {review.body}
                            </ReactMarkdown>
                          </div>
                          
                          {/* Replies or Status badge if needed */}
                          {review.status === 'wont_fix' && (
                             <div className="mt-1">
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                  Won't Fix
                                </span>
                             </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
