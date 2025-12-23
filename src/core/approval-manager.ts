/**
 * 审批管理器
 * 管理变更提案的审批流程
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ApprovalRecord, ApprovalStatus } from '../types/openspec.js';

export interface ApprovalManagerOptions {
  cwd?: string;
}

export class ApprovalManager {
  private cwd: string;

  constructor(options?: ApprovalManagerOptions) {
    this.cwd = options?.cwd || process.cwd();
  }

  /**
   * 获取审批目录路径
   */
  private getApprovalsDir(): string {
    return path.join(this.cwd, 'openspec', 'approvals');
  }

  /**
   * 获取审批记录文件路径
   */
  private getApprovalPath(changeId: string): string {
    return path.join(this.getApprovalsDir(), `${changeId}.json`);
  }

  /**
   * 确保审批目录存在
   */
  private async ensureApprovalsDir(): Promise<void> {
    const dir = this.getApprovalsDir();
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 获取审批状态
   */
  async getApprovalStatus(changeId: string): Promise<ApprovalRecord | null> {
    const approvalPath = this.getApprovalPath(changeId);

    try {
      const content = await fs.readFile(approvalPath, 'utf-8');
      return JSON.parse(content) as ApprovalRecord;
    } catch {
      return null;
    }
  }

  /**
   * 创建或更新审批记录
   */
  private async saveApproval(record: ApprovalRecord): Promise<void> {
    await this.ensureApprovalsDir();
    const approvalPath = this.getApprovalPath(record.changeId);
    await fs.writeFile(approvalPath, JSON.stringify(record, null, 2), 'utf-8');
  }

  /**
   * 请求审批
   */
  async requestApproval(
    changeId: string,
    requestedBy: string,
    reviewers?: string[]
  ): Promise<ApprovalRecord> {
    const existing = await this.getApprovalStatus(changeId);
    const now = new Date().toISOString();

    const record: ApprovalRecord = existing || {
      changeId,
      status: 'draft',
      approvals: [],
      rejections: [],
      history: [],
    };

    // 更新状态
    record.status = 'pending_approval';
    record.requestedAt = now;
    record.requestedBy = requestedBy;
    if (reviewers) {
      record.reviewers = reviewers;
    }

    // 添加历史记录
    record.history.push({
      action: 'request_approval',
      by: requestedBy,
      at: now,
      details: reviewers ? `Reviewers: ${reviewers.join(', ')}` : undefined,
    });

    await this.saveApproval(record);
    return record;
  }

  /**
   * 审批通过
   */
  async approve(
    changeId: string,
    approver: string,
    comment?: string
  ): Promise<ApprovalRecord> {
    const record = await this.getApprovalStatus(changeId);
    const now = new Date().toISOString();

    if (!record) {
      throw new Error(`No approval record found for change: ${changeId}`);
    }

    if (record.status !== 'pending_approval') {
      throw new Error(
        `Cannot approve change in status: ${record.status}. Must be pending_approval.`
      );
    }

    // 添加审批
    record.approvals.push({
      approver,
      approvedAt: now,
      comment,
    });

    // 检查是否所有评审人都已批准
    let allApproved = true;
    if (record.reviewers && record.reviewers.length > 0) {
      const approvers = new Set(record.approvals.map(a => a.approver));
      allApproved = record.reviewers.every(reviewer => approvers.has(reviewer));
    }

    // 更新状态
    if (allApproved) {
      record.status = 'approved';
    }

    // 添加历史记录
    record.history.push({
      action: 'approved',
      by: approver,
      at: now,
      details: comment,
    });

    await this.saveApproval(record);
    return record;
  }

  /**
   * 审批拒绝
   */
  async reject(
    changeId: string,
    rejector: string,
    reason: string
  ): Promise<ApprovalRecord> {
    const record = await this.getApprovalStatus(changeId);
    const now = new Date().toISOString();

    if (!record) {
      throw new Error(`No approval record found for change: ${changeId}`);
    }

    if (record.status !== 'pending_approval') {
      throw new Error(
        `Cannot reject change in status: ${record.status}. Must be pending_approval.`
      );
    }

    // 添加拒绝
    record.rejections.push({
      rejector,
      rejectedAt: now,
      reason,
    });

    // 更新状态
    record.status = 'rejected';

    // 添加历史记录
    record.history.push({
      action: 'rejected',
      by: rejector,
      at: now,
      details: reason,
    });

    await this.saveApproval(record);
    return record;
  }

  /**
   * 开始实施
   */
  async startImplementation(
    changeId: string,
    implementer: string
  ): Promise<ApprovalRecord> {
    const record = await this.getApprovalStatus(changeId);
    const now = new Date().toISOString();

    if (!record) {
      throw new Error(`No approval record found for change: ${changeId}`);
    }

    if (record.status !== 'approved') {
      throw new Error(
        `Cannot start implementation in status: ${record.status}. Must be approved.`
      );
    }

    record.status = 'implementing';

    record.history.push({
      action: 'start_implementation',
      by: implementer,
      at: now,
    });

    await this.saveApproval(record);
    return record;
  }

  /**
   * 标记完成
   */
  async markCompleted(changeId: string, completedBy: string): Promise<ApprovalRecord> {
    const record = await this.getApprovalStatus(changeId);
    const now = new Date().toISOString();

    if (!record) {
      throw new Error(`No approval record found for change: ${changeId}`);
    }

    if (record.status !== 'implementing') {
      throw new Error(
        `Cannot mark as completed in status: ${record.status}. Must be implementing.`
      );
    }

    record.status = 'completed';

    record.history.push({
      action: 'completed',
      by: completedBy,
      at: now,
    });

    await this.saveApproval(record);
    return record;
  }

  /**
   * 重置为草稿（用于被拒绝后重新提交）
   */
  async resetToDraft(changeId: string, resetBy: string): Promise<ApprovalRecord> {
    const record = await this.getApprovalStatus(changeId);
    const now = new Date().toISOString();

    if (!record) {
      // 创建新的草稿记录
      const newRecord: ApprovalRecord = {
        changeId,
        status: 'draft',
        approvals: [],
        rejections: [],
        history: [
          {
            action: 'created',
            by: resetBy,
            at: now,
          },
        ],
      };
      await this.saveApproval(newRecord);
      return newRecord;
    }

    record.status = 'draft';

    record.history.push({
      action: 'reset_to_draft',
      by: resetBy,
      at: now,
    });

    await this.saveApproval(record);
    return record;
  }

  /**
   * 列出所有审批记录
   */
  async listApprovals(): Promise<ApprovalRecord[]> {
    const dir = this.getApprovalsDir();
    const records: ApprovalRecord[] = [];

    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          records.push(JSON.parse(content));
        } catch {
          // 跳过无效文件
        }
      }
    } catch {
      // 目录不存在
    }

    return records;
  }

  /**
   * 列出待审批的记录
   */
  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    const all = await this.listApprovals();
    return all.filter((r) => r.status === 'pending_approval');
  }

  /**
   * 删除审批记录
   */
  async deleteApproval(changeId: string): Promise<boolean> {
    const approvalPath = this.getApprovalPath(changeId);

    try {
      await fs.unlink(approvalPath);
      return true;
    } catch {
      return false;
    }
  }
}
