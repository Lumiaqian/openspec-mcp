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
