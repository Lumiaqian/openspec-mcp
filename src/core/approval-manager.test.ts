/**
 * ApprovalManager 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApprovalManager } from './approval-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ApprovalManager', () => {
  let tempDir: string;
  let manager: ApprovalManager;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'approval-test-'));
    await fs.mkdir(path.join(tempDir, 'openspec', 'approvals'), { recursive: true });
    manager = new ApprovalManager({ cwd: tempDir });
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('requestApproval', () => {
    it('should create a new approval record', async () => {
      const record = await manager.requestApproval('test-change', 'user1');

      expect(record.changeId).toBe('test-change');
      expect(record.status).toBe('pending_approval');
      expect(record.requestedBy).toBe('user1');
      expect(record.history).toHaveLength(1);
      expect(record.history[0].action).toBe('request_approval');
    });

    it('should include reviewers when specified', async () => {
      const record = await manager.requestApproval('test-change', 'user1', ['reviewer1', 'reviewer2']);

      expect(record.reviewers).toEqual(['reviewer1', 'reviewer2']);
    });
  });

  describe('approve', () => {
    it('should approve a pending approval', async () => {
      await manager.requestApproval('test-change', 'user1');
      const record = await manager.approve('test-change', 'approver1', 'Looks good!');

      expect(record.status).toBe('approved');
      expect(record.approvals).toHaveLength(1);
      expect(record.approvals[0].approver).toBe('approver1');
      expect(record.approvals[0].comment).toBe('Looks good!');
    });

    it('should throw error for non-existent change', async () => {
      await expect(manager.approve('non-existent', 'approver1')).rejects.toThrow(
        'No approval record found'
      );
    });

    it('should throw error for non-pending approval', async () => {
      const record = await manager.requestApproval('test-change', 'user1');
      await manager.approve('test-change', 'approver1');

      await expect(manager.approve('test-change', 'approver2')).rejects.toThrow(
        'Must be pending_approval'
      );
    });
  });

  describe('reject', () => {
    it('should reject a pending approval', async () => {
      await manager.requestApproval('test-change', 'user1');
      const record = await manager.reject('test-change', 'reviewer1', 'Needs more work');

      expect(record.status).toBe('rejected');
      expect(record.rejections).toHaveLength(1);
      expect(record.rejections[0].rejector).toBe('reviewer1');
      expect(record.rejections[0].reason).toBe('Needs more work');
    });
  });

  describe('status flow', () => {
    it('should support full approval workflow', async () => {
      // Request approval
      let record = await manager.requestApproval('test-change', 'author');
      expect(record.status).toBe('pending_approval');

      // Approve
      record = await manager.approve('test-change', 'reviewer');
      expect(record.status).toBe('approved');

      // Start implementation
      record = await manager.startImplementation('test-change', 'author');
      expect(record.status).toBe('implementing');

      // Mark completed
      record = await manager.markCompleted('test-change', 'author');
      expect(record.status).toBe('completed');

      // Verify history
      expect(record.history).toHaveLength(4);
    });

    it('should support rejection and resubmission', async () => {
      // Request approval
      await manager.requestApproval('test-change', 'author');

      // Reject
      let record = await manager.reject('test-change', 'reviewer', 'Fix issues');
      expect(record.status).toBe('rejected');

      // Reset to draft
      record = await manager.resetToDraft('test-change', 'author');
      expect(record.status).toBe('draft');

      // Request again
      record = await manager.requestApproval('test-change', 'author');
      expect(record.status).toBe('pending_approval');
    });
  });

  describe('listApprovals', () => {
    it('should list all approval records', async () => {
      await manager.requestApproval('change-1', 'user1');
      await manager.requestApproval('change-2', 'user2');

      const records = await manager.listApprovals();
      expect(records).toHaveLength(2);
    });
  });

  describe('listPendingApprovals', () => {
    it('should return only pending approvals', async () => {
      await manager.requestApproval('change-1', 'user1');
      await manager.requestApproval('change-2', 'user2');
      await manager.approve('change-1', 'approver');

      const pending = await manager.listPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].changeId).toBe('change-2');
    });
  });
});
