const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Changes API
export const changesApi = {
  list: (includeArchived = false) =>
    fetchJson<{ changes: any[] }>(`/changes?includeArchived=${includeArchived}`),

  get: (id: string) => fetchJson<{ change: any }>(`/changes/${id}`),

  validate: (id: string, strict = false) =>
    fetchJson<{ valid: boolean; errors: any[] }>(`/changes/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify({ strict }),
    }),

  archive: (id: string, skipSpecs = false) =>
    fetchJson<{ success: boolean; archivedPath: string }>(`/changes/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ skipSpecs }),
    }),

  // Reviews
  getReviews: (id: string) =>
    fetchJson<{
      proposal: any[];
      design: any[];
      tasks: any[];
      summary: any;
    }>(`/changes/${id}/reviews`),

  addReview: (
    id: string,
    targetType: 'proposal' | 'design' | 'tasks',
    body: string,
    type: string,
    options?: { lineNumber?: number; severity?: string }
  ) =>
    fetchJson<{ review: any }>(`/changes/${id}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ targetType, body, type, ...options }),
    }),

  resolveReview: (
    id: string,
    reviewId: string,
    targetType: 'proposal' | 'design' | 'tasks',
    status: 'resolved' | 'wont_fix' = 'resolved'
  ) =>
    fetchJson<{ success: boolean }>(`/changes/${id}/reviews/${reviewId}`, {
      method: 'PATCH',
      body: JSON.stringify({ targetType, status }),
    }),

  // Cross-Service Documents
  getCrossServiceInfo: (id: string) =>
    fetchJson<{
      config: { rootPath: string; documents: string[]; archivePolicy?: string } | null;
      documents: { name: string; path: string; content: string; isSnapshot?: boolean }[];
    }>(`/changes/${id}/cross-service`),

  getCrossServiceDoc: (id: string, docName: string) =>
    fetchJson<{ name: string; path: string; content: string; isSnapshot?: boolean }>(
      `/changes/${id}/cross-service/${encodeURIComponent(docName)}`
    ),

  // Specs
  getSpecs: (id: string) =>
    fetchJson<{ specs: Array<{ id: string; title: string; content: string }> }>(
      `/changes/${id}/specs`
    ),

  // Revisions
  getRevisions: (id: string) =>
    fetchJson<{ revisions: Array<{ 
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
    }> }>(
      `/changes/${id}/revisions`
    ),

  addRevision: (id: string, description: string, reason?: string, metadata?: any) =>
    fetchJson<{ revision: any }>(`/changes/${id}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ description, reason, metadata }),
    }),
};

// Specs API
export const specsApi = {
  list: () => fetchJson<{ specs: any[] }>('/specs'),

  get: (id: string) => fetchJson<{ spec: any }>(`/specs/${id}`),

  validate: (id: string, strict = false) =>
    fetchJson<{ valid: boolean; errors: any[] }>(`/specs/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify({ strict }),
    }),

  // Reviews
  listReviews: (id: string, status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<{ reviews: any[] }>(`/specs/${id}/reviews${query}`);
  },

  addReview: (
    id: string,
    body: string,
    type: string,
    options?: { lineNumber?: number; severity?: string; suggestedChange?: string }
  ) =>
    fetchJson<{ review: any }>(`/specs/${id}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ body, type, ...options }),
    }),

  resolveReview: (id: string, reviewId: string, status: 'resolved' | 'wont_fix' = 'resolved') =>
    fetchJson<{ success: boolean }>(`/specs/${id}/reviews/${reviewId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Dependencies
  getDependencies: () =>
    fetchJson<{ graph: { nodes: any[]; edges: any[] }; mermaid: string }>('/specs/dependencies'),
};

// Tasks API
export const tasksApi = {
  get: (changeId: string) =>
    fetchJson<{ tasks: any[]; progress: any }>(`/changes/${changeId}/tasks`),

  update: (changeId: string, taskId: string, status: string) =>
    fetchJson<{ success: boolean }>(`/changes/${changeId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getProgress: () =>
    fetchJson<{
      summaries: any[];
      overall: { total: number; completed: number; percentage: number };
    }>('/progress'),
};

// Approvals API
export const approvalsApi = {
  list: () => fetchJson<{ approvals: any[] }>('/approvals'),

  listPending: () => fetchJson<{ approvals: any[] }>('/approvals/pending'),

  get: (changeId: string) => fetchJson<{ approval: any }>(`/approvals/${changeId}`),

  request: (changeId: string, requestedBy: string, reviewers?: string[]) =>
    fetchJson<{ approval: any }>(`/approvals/${changeId}/request`, {
      method: 'POST',
      body: JSON.stringify({ requestedBy, reviewers }),
    }),

  approve: (changeId: string, approver: string, comment?: string) =>
    fetchJson<{ approval: any }>(`/approvals/${changeId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver, comment }),
    }),

  reject: (changeId: string, rejector: string, reason: string) =>
    fetchJson<{ approval: any }>(`/approvals/${changeId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejector, reason }),
    }),
};

// Project API
export const projectApi = {
  get: () =>
    fetchJson<{ project: { name: string; source: 'project.md' | 'package.json' | 'cwd' } }>(
      '/project'
    ),
};

// Kanban API
export interface KanbanCard {
  id: string;
  name: string;
  description?: string;
  progress: number;
  column: string;
  labels: string[];
  priority?: 'high' | 'medium' | 'low';
  updatedAt: string;
  createdAt: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
}

export interface KanbanData {
  columns: KanbanColumn[];
  summary: {
    total: number;
    byColumn: Record<string, number>;
  };
}

export const kanbanApi = {
  get: () => fetchJson<KanbanData>('/kanban'),
  
  getSummary: () => fetchJson<{ total: number; columns: Record<string, number> }>('/kanban/summary'),
  
  moveCard: (id: string, toColumn: string, note?: string) =>
    fetchJson<{ success: boolean; changeId: string; newColumn: string }>(`/kanban/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ toColumn, note }),
    }),
};

// Context API (通过 MCP 调用)
export interface ProjectContext {
  projectName: string;
  projectRoot: string;
  analyzedAt: string;
  stack: {
    languages: Array<{ name: string; percentage: number; fileCount: number; lineCount: number }>;
    frameworks: string[];
    packageManager: string;
    buildTools: string[];
    testFramework?: string;
  };
  structure: {
    rootFiles: string[];
    mainDirectories: Array<{ name: string; purpose: string; fileCount: number; path: string }>;
    entryPoints: string[];
  };
  patterns: {
    architecture: string;
    codeStyle: string[];
    conventions: string[];
  };
  stats: {
    totalFiles: number;
    totalLines: number;
    byLanguage: Record<string, number>;
  };
}

export const contextApi = {
  // 注意：这些通过 REST 包装 MCP 工具，后端需要添加新路由
  analyze: (refresh = false) =>
    fetchJson<ProjectContext>(`/context/analyze${refresh ? '?refresh=true' : ''}`),
  
  getSummary: () =>
    fetchJson<{ summary: string } | null>('/context/summary'),
};

// QA Types
export interface QACheckResult {
  type: 'syntax' | 'typecheck' | 'lint' | 'test' | 'build';
  status: 'passed' | 'failed' | 'skipped' | 'timeout';
  output?: string;
  errors?: string[];
  duration: number;
}

export interface QAStatus {
  currentCheck?: string;
  isRunning: boolean;
  startTime?: string;
  progress?: {
    total: number;
    completed: number;
    current: number;
  };
}

export interface QAResult {
  id: string;
  changeName: string;
  status: QAStatus;
  iteration: number;
  maxIterations: number;
  checks: QACheckResult[];
  startedAt: string;
  completedAt?: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface QASummary {
  total: number;
  passed: number;
  failed: number;
  running: number;
  changes: Array<{
    name: string;
    status: QAStatus;
    lastRun?: string;
  }>;
}

export const qaApi = {
  // Get QA status for a specific change
  getStatus: (changeName: string) =>
    fetchJson<{ status: QAResult | null }>(`/qa/status/${changeName}`),

  // Get all running QA status summary
  getSummary: () =>
    fetchJson<QASummary>('/qa/summary'),

  // Get QA history for a specific change
  getHistory: (changeName: string, limit = 10) =>
    fetchJson<{ history: QAResult[] }>(`/qa/history/${changeName}?limit=${limit}`),

  // Run QA for a specific change
  run: (changeName: string, checks?: string[]) =>
    fetchJson<{ message: string; changeName: string; checks: string[] }>('/qa/run/' + changeName, {
      method: 'POST',
      body: JSON.stringify({ checks }),
    }),

  // Stop QA for a specific change
  stop: (changeName: string) =>
    fetchJson<{ message: string; changeName: string }>('/qa/stop/' + changeName, {
      method: 'POST',
    }),
};

