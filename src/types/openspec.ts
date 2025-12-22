/**
 * OpenSpec 类型定义
 */

// 变更状态
export type ChangeStatus = 'active' | 'archived';

// 任务状态
export type TaskStatus = 'pending' | 'in_progress' | 'done';

// 审批状态
export type ApprovalStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'implementing'
  | 'completed';

// Delta 操作类型
export type DeltaOperation = 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED';

/**
 * 变更提案
 */
export interface Change {
  id: string;
  title: string;
  status: ChangeStatus;
  tasksCompleted: number;
  tasksTotal: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 变更详情
 */
export interface ChangeDetail extends Change {
  proposal: string;          // proposal.md 内容
  design?: string;           // design.md 内容 (可选)
  tasks: Task[];
  deltas: Delta[];
  crossService?: CrossServiceInfo;  // 跨服务文档 (可选)
}

/**
 * 跨服务配置 (proposal.md frontmatter)
 */
export interface CrossServiceConfig {
  rootPath: string;                           // 相对于 change 目录的路径
  documents: string[];                        // 文档列表
  archivePolicy?: 'snapshot' | 'reference';   // 归档策略，默认 snapshot
}

/**
 * 跨服务文档
 */
export interface CrossServiceDocument {
  name: string;               // 文件名
  path: string;               // 完整路径
  content: string;            // 文件内容
  isSnapshot?: boolean;       // 是否为快照
}

/**
 * 跨服务信息
 */
export interface CrossServiceInfo {
  config: CrossServiceConfig;
  documents: CrossServiceDocument[];
}

/**
 * 规格
 */
export interface Spec {
  id: string;
  title: string;
  requirementsCount: number;
  updatedAt: string;
}

/**
 * 规格详情
 */
export interface SpecDetail extends Spec {
  content: string;           // spec.md 内容
  requirements: Requirement[];
}

/**
 * 任务
 */
export interface Task {
  id: string;                // e.g., "1.1", "2.3"
  section: string;           // e.g., "1. Implementation"
  title: string;
  status: TaskStatus;
  line: number;              // 文件行号
  children?: Task[];         // 子任务
}

/**
 * 进度统计
 */
export interface Progress {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  percentage: number;
}

/**
 * Delta（变更差异）
 */
export interface Delta {
  specName: string;
  operation: DeltaOperation;
  requirements: Requirement[];
}

/**
 * 需求
 */
export interface Requirement {
  id: number;
  title: string;
  content: string;
  scenarios: Scenario[];
}

/**
 * 场景
 */
export interface Scenario {
  name: string;
  when: string;
  then: string;
}

/**
 * 验证错误
 */
export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  location?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 审批记录
 */
export interface ApprovalRecord {
  changeId: string;
  status: ApprovalStatus;
  requestedAt?: string;
  requestedBy?: string;
  reviewers?: string[];
  approvals: {
    approver: string;
    approvedAt: string;
    comment?: string;
  }[];
  rejections: {
    rejector: string;
    rejectedAt: string;
    reason: string;
  }[];
  history: {
    action: string;
    by: string;
    at: string;
    details?: string;
  }[];
}

/**
 * 进度汇总
 */
export interface ProgressSummary {
  changeId: string;
  title: string;
  progress: Progress;
  approvalStatus?: ApprovalStatus;
}
