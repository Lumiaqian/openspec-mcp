/**
 * OpenSpec 常量定义
 * 集中管理所有魔法字符串
 */

/**
 * OpenSpec 文件名常量
 */
export const OPENSPEC_FILES = {
  AGENTS: 'AGENTS.md',
  PROJECT: 'project.md',
  PROPOSAL: 'proposal.md',
  DESIGN: 'design.md',
  TASKS: 'tasks.md',
  SPEC: 'spec.md',
} as const;

/**
 * OpenSpec 目录路径常量
 */
export const OPENSPEC_DIRS = {
  ROOT: 'openspec',
  CHANGES: 'changes',
  SPECS: 'specs',
  APPROVALS: 'approvals',
  ANNOTATIONS: 'annotations',
  ARCHIVE: 'archive',
} as const;

/**
 * WebSocket 事件类型
 */
export const WS_EVENTS = {
  CONNECTED: 'connected',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',
  FILE_CHANGED: 'file:changed',
} as const;

/**
 * WebSocket 消息类型
 */
export const WS_MESSAGE_TYPES = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
} as const;

/**
 * 审批状态 (5 个)
 */
export const APPROVAL_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  IN_PROGRESS: 'in_progress',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
} as const;
