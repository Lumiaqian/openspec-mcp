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
