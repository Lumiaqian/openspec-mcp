import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { changesApi } from '../api/client';
import ServicesYamlView from './ServicesYamlView';
import { useWebSocket } from '../hooks/useWebSocket';

interface CrossServiceDocument {
  name: string;
  path: string;
  content: string;
  isSnapshot?: boolean;
}

interface CrossServiceConfig {
  rootPath: string;
  documents: string[];
  archivePolicy?: string;
}

interface CrossServiceDocsProps {
  changeId: string;
}

export default function CrossServiceDocs({ changeId }: CrossServiceDocsProps) {
  const { lastMessage } = useWebSocket();
  const [config, setConfig] = useState<CrossServiceConfig | null>(null);
  const [documents, setDocuments] = useState<CrossServiceDocument[]>([]);
  const [selectedDocName, setSelectedDocName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data function
  const fetchData = useCallback(async () => {
    try {
      const info = await changesApi.getCrossServiceInfo(changeId);
      setConfig(info.config);
      setDocuments(info.documents);
      // Auto-select first document if none selected
      if (info.documents.length > 0 && !selectedDocName) {
        setSelectedDocName(info.documents[0].name);
      }
    } catch (err) {
      console.error('Failed to fetch cross-service docs:', err);
      setError('Failed to load cross-service documents');
    } finally {
      setLoading(false);
    }
  }, [changeId, selectedDocName]);

  // Fetch on mount
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchData();
  }, [fetchData]);

  // Listen for WebSocket updates
  useEffect(() => {
    if (!lastMessage) return;
    const { event } = lastMessage;

    // Refresh when cross-service files change
    if (event === 'cross-service:updated') {
      fetchData();
    }
  }, [lastMessage, fetchData]);

  // Get selected document
  const selectedDoc = documents.find(d => d.name === selectedDocName);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No Cross-Service Configuration
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            This change doesn't have cross-service documents configured.
          </p>
          <div className="bg-white rounded border p-4 text-left max-w-md mx-auto">
            <p className="text-xs text-gray-500 mb-2">
              Add this to your <code className="bg-gray-100 px-1 rounded">proposal.md</code> frontmatter:
            </p>
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
{`---
crossService:
  rootPath: "../../../../.cross-service"
  documents:
    - design.md
    - flows.md
    - services.yaml
---`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-yellow-700 mb-2">
            Documents Not Found
          </h3>
          <p className="text-yellow-600 text-sm">
            Cross-service configuration exists but no documents were found at:
          </p>
          <code className="bg-yellow-100 px-2 py-1 rounded text-sm mt-2 inline-block">
            {config.rootPath}
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-lg">🔗</span>
          <span className="text-sm text-gray-500">
            from <code className="bg-gray-100 px-1 rounded">{config.rootPath}</code>
          </span>
          {selectedDoc?.isSnapshot && (
            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded">
              📦 Archived Snapshot
            </span>
          )}
        </div>
      </div>

      {/* Document tabs */}
      <div className="flex space-x-2 mb-4 overflow-x-auto pb-2">
        {documents.map((doc) => (
          <button
            key={doc.name}
            onClick={() => setSelectedDocName(doc.name)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              selectedDocName === doc.name
                ? 'bg-blue-100 text-blue-700 shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {doc.name.endsWith('.yaml') || doc.name.endsWith('.yml') ? '📋' : '📄'}{' '}
            {doc.name}
          </button>
        ))}
      </div>

      {/* Document content */}
      {selectedDoc && (
        <div className="bg-gray-50 rounded-lg border">
          {/* File path */}
          <div className="px-4 py-2 bg-gray-100 border-b rounded-t-lg flex items-center justify-between">
            <span className="text-xs text-gray-500 font-mono truncate">
              {selectedDoc.path}
            </span>
          </div>

          {/* Content */}
          <div className="p-6 prose prose-sm max-w-none overflow-x-auto">
            {selectedDoc.name === 'services.yaml' || selectedDoc.name === 'services.yml' ? (
              <ServicesYamlView content={selectedDoc.content} />
            ) : selectedDoc.name.endsWith('.yaml') || selectedDoc.name.endsWith('.yml') ? (
              <pre className="bg-gray-800 text-gray-100 p-4 rounded overflow-x-auto text-sm">
                <code>{selectedDoc.content}</code>
              </pre>
            ) : selectedDoc.name.endsWith('.sql') ? (
              <pre className="bg-gray-800 text-gray-100 p-4 rounded overflow-x-auto text-sm">
                <code>{selectedDoc.content}</code>
              </pre>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selectedDoc.content}
              </ReactMarkdown>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
