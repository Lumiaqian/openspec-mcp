import { useState, useEffect, useRef } from 'react';
import { specsApi } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Review {
  id: string;
  targetType: string;
  targetId: string;
  lineNumber?: number;
  type: 'comment' | 'suggestion' | 'question' | 'issue';
  severity?: 'low' | 'medium' | 'high';
  body: string;
  suggestedChange?: string;
  author: string;
  status: 'open' | 'resolved' | 'wont_fix';
  createdAt: string;
  resolvedAt?: string;
  replies: Array<{ id: string; author: string; body: string; createdAt: string }>;
}

type SelectionInfo = {
  text: string;
  lineNumber: number;
  popupTop: number;
};

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

export default function SpecList() {
  const { lastMessage } = useWebSocket();
  const [specs, setSpecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpec, setSelectedSpec] = useState<any>(null);
  
  // Review State
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [reviewType, setReviewType] = useState<Review['type']>('comment');
  const [severity, setSeverity] = useState<Review['severity']>('medium');
  const contentRef = useRef<HTMLDivElement>(null);

  const fetchSpecs = async () => {
    try {
      const res = await specsApi.list();
      setSpecs(res.specs);
    } catch (error) {
      console.error('Failed to fetch specs:', error);
    }
  };

  useEffect(() => {
    fetchSpecs().finally(() => setLoading(false));
  }, []);

  // Listen for WebSocket events to refresh specs
  useEffect(() => {
    if (!lastMessage) return;
    const { event, data } = lastMessage;
    
    // Refresh spec list or selected spec when file changes
    if (event === 'file:changed' || event === 'reviews:updated') {
      fetchSpecs();
      // Refresh selected spec's reviews if applicable
      if (selectedSpec && event === 'reviews:updated' && data?.targetType === 'spec') {
        specsApi.listReviews(selectedSpec.id).then(res => {
          setReviews(res.reviews);
        }).catch(console.error);
      }
    }
  }, [lastMessage, selectedSpec]);

  const handleViewSpec = async (specId: string) => {
    try {
      const res = await specsApi.get(specId);
      setSelectedSpec(res.spec);
      setSelection(null);
      setCommentInput('');
      
      // Fetch reviews for this spec
      const reviewRes = await specsApi.listReviews(specId);
      setReviews(reviewRes.reviews);
    } catch (error) {
      console.error('Failed to fetch spec:', error);
    }
  };

  const handleTextMouseUp = () => {
    const sel = window.getSelection();
    const contentRoot = contentRef.current;
    if (!sel || sel.isCollapsed || !contentRoot) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const isInOverlay = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return Boolean((node as Element).closest('[data-review-overlay]'));
      }
      return Boolean((node as Element | null)?.parentElement?.closest('[data-review-overlay]'));
    };
    if (
      !contentRoot.contains(range.startContainer) ||
      !contentRoot.contains(range.endContainer) ||
      isInOverlay(range.startContainer) ||
      isInOverlay(range.endContainer)
    ) {
      setSelection(null);
      return;
    }

    const rawText = sel.toString();
    if (!rawText.trim()) {
      setSelection(null);
      return;
    }

    // Estimate line number based on position in content
    const preRange = range.cloneRange();
    preRange.selectNodeContents(contentRoot);
    preRange.setEnd(range.startContainer, range.startOffset);
    const preText = preRange.toString();
    const lineNumber = (preText.match(/\n/g) || []).length + 1;

    const rootRect = contentRoot.getBoundingClientRect();
    const rangeRect = range.getBoundingClientRect();
    const popupTop = Math.max(rangeRect.top - rootRect.top + contentRoot.scrollTop - 180, 12);

    setSelection({
      text: rawText,
      lineNumber,
      popupTop,
    });
  };

  const addReview = async () => {
    const trimmedComment = commentInput.trim();
    if (!selection || !trimmedComment || !selectedSpec) return;

    try {
      const res = await specsApi.addReview(
        selectedSpec.id,
        trimmedComment,
        reviewType,
        {
          lineNumber: selection.lineNumber,
          severity: reviewType === 'issue' ? severity : undefined,
        }
      );
      setReviews((prev) => [...prev, res.review]);
      setSelection(null);
      setCommentInput('');
    } catch (error) {
      console.error('Failed to add review:', error);
      alert('Failed to save review');
    }
  };

  const resolveReview = async (reviewId: string, status: 'resolved' | 'wont_fix' = 'resolved') => {
    if (!selectedSpec) return;
    try {
      await specsApi.resolveReview(selectedSpec.id, reviewId, status);
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, status, resolvedAt: new Date().toISOString() } : r))
      );
    } catch (error) {
      console.error('Failed to resolve review:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const openReviews = reviews.filter((r) => r.status === 'open');
  const hasBlockingIssues = openReviews.some((r) => r.type === 'issue' && r.severity === 'high');

  return (
    <div className="space-y-6 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Specifications</h2>
        {selectedSpec && openReviews.length > 0 && (
          <div className="flex items-center space-x-2">
            {hasBlockingIssues && (
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                🚨 Blocking Issues
              </span>
            )}
            <span className="text-sm text-gray-500">
              {openReviews.length} open review{openReviews.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Spec List Sidebar */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-y-auto">
          {specs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No specs found.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {specs.map((spec) => (
                <button
                  key={spec.id}
                  onClick={() => handleViewSpec(spec.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedSpec?.id === spec.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{spec.title}</div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">{spec.id}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-6 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
          {selectedSpec ? (
            <>
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 rounded-t-xl flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedSpec.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Select text to add review comment</p>
                </div>
              </div>
              
              <div 
                className="flex-1 overflow-y-auto p-6 relative"
                ref={contentRef}
                onMouseUp={handleTextMouseUp}
              >
                <div className="prose prose-sm max-w-none prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-50">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedSpec.content}
                  </ReactMarkdown>
                </div>

                {/* Floating Review Box */}
                {selection && (
                  <div 
                    className="absolute z-10 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 animate-fade-in"
                    data-review-overlay
                    style={{ 
                      top: selection.popupTop,
                      right: 20
                    }}
                  >
                    <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider flex justify-between items-center">
                      <span>Add Review (Line {selection.lineNumber})</span>
                    </div>
                    <div className="mb-2 p-2 bg-indigo-50 rounded text-xs text-indigo-800 border-l-2 border-indigo-300 italic truncate">
                      "{selection.text.trim().substring(0, 60)}{selection.text.length > 60 ? '...' : ''}"
                    </div>
                    
                    {/* Review Type Selection */}
                    <div className="flex space-x-1 mb-2">
                      {(['comment', 'suggestion', 'question', 'issue'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setReviewType(t)}
                          className={`px-2 py-1 text-xs rounded ${
                            reviewType === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {typeIcons[t]} {t}
                        </button>
                      ))}
                    </div>

                    {/* Severity for Issues */}
                    {reviewType === 'issue' && (
                      <div className="flex space-x-1 mb-2">
                        {(['low', 'medium', 'high'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setSeverity(s)}
                            className={`px-2 py-1 text-xs rounded ${
                              severity === s ? severityColors[s] + ' ring-2 ring-offset-1' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      autoFocus
                      className="w-full text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                      rows={3}
                      placeholder="Your review comment..."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                    />
                    <div className="flex justify-end space-x-2">
                      <button 
                        onClick={() => setSelection(null)}
                        className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                      >
                        Cancel
                      </button>
                     <button 
                        onClick={addReview}
                        className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
                      >
                        Add Review
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-gray-400 p-8">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <p>Select a specification to view and review</p>
            </div>
          )}
        </div>

        {/* Reviews Sidebar */}
        <div className="lg:col-span-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col min-h-0">
          <div className="p-4 border-b border-gray-200 bg-white rounded-t-xl">
             <h3 className="font-semibold text-gray-700 flex items-center">
               <span>Reviews</span>
               <span className="ml-2 bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                 {openReviews.length}
               </span>
             </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {openReviews.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-gray-400">No reviews yet.</p>
                <p className="text-xs text-gray-400 mt-1">Select text in the spec to add one.</p>
              </div>
            ) : (
              openReviews.map((review) => (
                <div key={review.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 group hover:border-indigo-300 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-2">
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
                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        className="text-green-500 hover:text-green-700 text-xs"
                        onClick={() => resolveReview(review.id, 'resolved')}
                        title="Resolve"
                      >
                        ✓
                      </button>
                      <button 
                        className="text-gray-400 hover:text-gray-600 text-xs"
                        onClick={() => resolveReview(review.id, 'wont_fix')}
                        title="Won't fix"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-800">
                    {review.body}
                  </div>
                  {review.replies.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                      💭 {review.replies.length} replies
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
